import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { type AuditRecord, audit, publish } from '../audit.js';
import { type Db, type Tx } from '../db/index.js';
import {
  approvals,
  cases,
  merchants,
  refundAttempts,
  settlementProposals,
  transactions,
} from '../db/schema.js';
import { AppError, conflict, forbidden, notFound } from '../errors.js';
import { formatMoney } from '../money.js';
import { PayPalError, type PayPalGateway, type RefundResult } from '../paypal/client.js';
import { movesMoney, termsHash } from '../settlement/terms.js';

/**
 * The payment side of ResolveOS, and the only code that moves money.
 *
 * Sandbox purchase:  createSandboxOrder → (buyer approves in PayPal) → captureSandboxOrder.
 *   The capture ID and amount stored are the ones PayPal returned, never ones the browser sent.
 *
 * Settlement refund: executeApprovedRefund(caseId)
 *   1. In one DB transaction, with the proposal row locked: load the latest proposal, require that
 *      the buyer AND the merchant approved this exact version (terms hash), that the transaction
 *      is a real captured sandbox payment in the same currency, and that the amount fits what is
 *      still refundable and the merchant's limit. Then insert the refund attempt — unique per
 *      proposal, with a fixed PayPal-Request-Id — and mark the case as processing.
 *   2. Call PayPal with that request id. Only a PayPal answer decides the outcome:
 *        COMPLETED → refunded; PENDING → pending; FAILED/CANCELLED or a definite 4xx refusal → failed;
 *        a timeout / network loss / 5xx / unreadable answer / 409 / 429 → UNKNOWN_REQUIRES_RECONCILIATION.
 *   3. `reconcileRefund` re-sends the SAME request id: PayPal answers with the original result
 *      instead of refunding twice (developer.paypal.com/api/rest/reference/idempotency).
 *
 * Nothing here is called by an AI agent. The caller (a route) has already checked the session.
 */

export interface Actor {
  userId: string;
  role: 'BUYER' | 'MERCHANT' | 'OPERATOR';
}

export class PaymentService {
  constructor(
    private readonly database: Db,
    private readonly paypal: PayPalGateway,
    private readonly frontendUrl: string,
  ) {}

  private requirePayPal(): void {
    if (!this.paypal.isConfigured()) {
      throw new AppError(
        503,
        'paypal_not_configured',
        'PayPal sandbox is not configured, so no real payment or refund can run. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env.',
      );
    }
  }

  // ── Sandbox purchase ──────────────────────────────────────────────────────

  /** The buyer starts a real sandbox purchase from a merchant. Returns the PayPal order id. */
  async createSandboxOrder(
    actor: Actor,
    input: { merchantId: string; amountMinor: number; currency: string; description: string },
  ): Promise<{ transactionId: string; orderId: string; approveUrl: string | null }> {
    this.requirePayPal();
    if (actor.role !== 'BUYER') throw forbidden('Only a buyer can make a purchase.');
    const merchant = await this.database.query.merchants.findFirst({
      where: eq(merchants.id, input.merchantId),
    });
    if (!merchant) throw notFound('Merchant not found');
    if (merchant.currency !== input.currency) {
      throw new AppError(422, 'currency_mismatch', `This merchant sells in ${merchant.currency}.`);
    }
    const [row] = await this.database
      .insert(transactions)
      .values({
        merchantId: merchant.id,
        buyerId: actor.userId,
        description: input.description,
        originalAmountMinor: input.amountMinor,
        currency: input.currency,
        paymentStatus: 'CREATED',
        sourceType: 'PAYPAL_SANDBOX',
      })
      .returning();
    if (!row) throw new Error('transaction insert failed');
    try {
      const order = await this.paypal.createOrder({
        amountMinor: input.amountMinor,
        currency: input.currency,
        referenceId: row.id,
        description: input.description.slice(0, 127),
        requestId: `resolve-order-${row.id}`,
        returnUrl: `${this.frontendUrl}/checkout/return`,
        cancelUrl: `${this.frontendUrl}/checkout/cancel`,
      });
      const records = await this.database.transaction(async (tx) => {
        await tx
          .update(transactions)
          .set({ paypalOrderId: order.orderId, updatedAt: new Date() })
          .where(eq(transactions.id, row.id));
        return [
          await audit(tx, {
            caseId: null,
            actorType: 'PAYPAL',
            actorUserId: actor.userId,
            action: 'paypal.order_created',
            details: { transactionId: row.id, orderId: order.orderId, status: order.status },
          }),
        ];
      });
      publish(records);
      return { transactionId: row.id, orderId: order.orderId, approveUrl: order.approveUrl };
    } catch (error) {
      await this.database
        .update(transactions)
        .set({ paymentStatus: 'FAILED', updatedAt: new Date() })
        .where(eq(transactions.id, row.id));
      throw toAppError(error);
    }
  }

  /** After the buyer approved in PayPal: capture, and store exactly what PayPal reports. */
  async captureSandboxOrder(actor: Actor, orderId: string) {
    this.requirePayPal();
    const transaction = await this.database.query.transactions.findFirst({
      where: eq(transactions.paypalOrderId, orderId),
    });
    if (!transaction || transaction.buyerId !== actor.userId) throw notFound('Order not found');
    if (transaction.paymentStatus === 'CAPTURED' && transaction.paypalCaptureId) {
      return transaction; // already captured: idempotent
    }
    let result;
    try {
      result = await this.paypal.captureOrder(orderId, `resolve-capture-${transaction.id}`);
    } catch (error) {
      throw toAppError(error);
    }
    if (result.amountMinor !== transaction.originalAmountMinor || result.currency !== transaction.currency) {
      // PayPal is the source of truth for what was paid; flag the mismatch loudly.
      throw new AppError(502, 'capture_mismatch', 'PayPal captured a different amount than ordered.', {
        expected: formatMoney(transaction.originalAmountMinor, transaction.currency),
        captured: formatMoney(result.amountMinor, result.currency),
      });
    }
    const captured = result.captureStatus === 'COMPLETED';
    const { updated, records } = await this.database.transaction(async (tx) => {
      const [updatedRow] = await tx
        .update(transactions)
        .set({
          paypalCaptureId: result.captureId,
          paymentStatus: captured ? 'CAPTURED' : 'CREATED',
          payerEmail: result.payerEmail,
          capturedAt: captured ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transaction.id))
        .returning();
      const record = await audit(tx, {
        caseId: null,
        actorType: 'PAYPAL',
        actorUserId: actor.userId,
        action: 'paypal.order_captured',
        details: {
          transactionId: transaction.id,
          orderId,
          captureId: result.captureId,
          captureStatus: result.captureStatus,
          amount: formatMoney(result.amountMinor, result.currency),
        },
      });
      return { updated: updatedRow, records: [record] };
    });
    publish(records);
    return updated;
  }

  // ── Settlement refund ─────────────────────────────────────────────────────

  /**
   * Runs the refund both parties approved, exactly as approved. Takes nothing about money from the
   * caller: the proposal, amount, capture and currency all come from the database.
   */
  async executeApprovedRefund(actor: Actor, caseId: string) {
    this.requirePayPal();
    const prepared = await this.database.transaction(async (tx) => {
      const records: AuditRecord[] = [];
      const kase = await tx.query.cases.findFirst({ where: eq(cases.id, caseId) });
      if (!kase) throw notFound('Case not found');
      await assertParty(tx, actor, kase);

      // Lock the latest proposal: concurrent clicks queue here, then see the attempt below.
      const [proposal] = await tx
        .select()
        .from(settlementProposals)
        .where(eq(settlementProposals.caseId, caseId))
        .orderBy(desc(settlementProposals.proposalVersion))
        .limit(1)
        .for('update');
      if (!proposal) throw conflict('no_proposal', 'There is no settlement to execute yet.');

      const existing = await tx.query.refundAttempts.findFirst({
        where: eq(refundAttempts.proposalId, proposal.id),
      });
      if (existing) return { attempt: existing, fresh: false, records };

      if (proposal.currentStatus !== 'APPROVED') {
        throw conflict('not_approved', 'Both the buyer and the merchant must approve this settlement first.');
      }
      if (!movesMoney(proposal.settlementType)) {
        throw conflict('no_payment_needed', 'This settlement does not involve a refund.');
      }
      const expectedHash = termsHash({
        caseId,
        proposalVersion: proposal.proposalVersion,
        settlementType: proposal.settlementType,
        refundAmountMinor: proposal.refundAmountMinor,
        currency: proposal.currency,
      });
      if (expectedHash !== proposal.termsHash) {
        throw conflict('terms_tampered', 'The stored settlement terms do not match their approvals.');
      }
      const decisions = await tx.select().from(approvals).where(eq(approvals.proposalId, proposal.id));
      for (const role of ['BUYER', 'MERCHANT'] as const) {
        const approval = decisions.find((d) => d.role === role);
        if (!approval || approval.decision !== 'APPROVE' || approval.approvedTermsHash !== proposal.termsHash) {
          throw conflict('missing_approval', `The ${role.toLowerCase()} has not approved this exact settlement.`);
        }
      }

      const [txn] = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, kase.transactionId))
        .for('update');
      if (!txn) throw notFound('Transaction not found');
      if (txn.sourceType !== 'PAYPAL_SANDBOX' || !txn.paypalCaptureId) {
        throw conflict(
          'not_a_real_capture',
          'This case is on seeded demo data, not a captured PayPal sandbox payment, so no real refund can run.',
        );
      }
      if (txn.paymentStatus !== 'CAPTURED' && txn.paymentStatus !== 'PARTIALLY_REFUNDED') {
        throw conflict('not_refundable', `The payment is ${txn.paymentStatus.toLowerCase()} and cannot be refunded.`);
      }
      if (txn.currency !== proposal.currency) {
        throw conflict('currency_mismatch', 'The settlement currency differs from the payment currency.');
      }
      const remaining = txn.originalAmountMinor - txn.amountRefundedMinor;
      if (proposal.refundAmountMinor <= 0 || proposal.refundAmountMinor > remaining) {
        throw conflict('amount_exceeds_refundable', 'The refund is more than what is still refundable.', {
          refundable: formatMoney(remaining, txn.currency),
        });
      }
      if (proposal.refundAmountMinor > kase.merchantMaxRefundMinor) {
        throw conflict('amount_exceeds_merchant_limit', "The refund is more than the merchant's limit for this case.");
      }

      const isFull = proposal.refundAmountMinor === txn.originalAmountMinor && txn.amountRefundedMinor === 0;
      const [attempt] = await tx
        .insert(refundAttempts)
        .values({
          proposalId: proposal.id,
          transactionId: txn.id,
          paypalRequestId: `resolve-refund-${proposal.id}`,
          amountMinor: proposal.refundAmountMinor,
          currency: proposal.currency,
          isFullRefund: isFull,
          status: 'AUTHORIZED',
        })
        .returning();
      if (!attempt) throw new Error('refund attempt insert failed');
      await tx
        .update(cases)
        .set({ currentStatus: 'PAYMENT_PROCESSING', updatedAt: new Date() })
        .where(eq(cases.id, caseId));
      records.push(
        await audit(tx, {
          caseId,
          actorType: 'USER',
          actorUserId: actor.userId,
          action: 'refund.initiated',
          details: {
            proposalVersion: proposal.proposalVersion,
            amount: formatMoney(attempt.amountMinor, attempt.currency),
            full: isFull,
            requestId: attempt.paypalRequestId,
          },
        }),
      );
      return { attempt, fresh: true, records };
    });
    publish(prepared.records);

    // A repeat click while the first is in flight or done: report, never send again.
    if (!prepared.fresh) {
      if (prepared.attempt.status === 'UNKNOWN_REQUIRES_RECONCILIATION') {
        return this.reconcileRefund(actor, caseId);
      }
      return this.refundView(caseId);
    }
    await this.sendRefund(prepared.attempt.id, caseId);
    return this.refundView(caseId);
  }

  /**
   * For an attempt whose outcome is unknown: ask PayPal again with the SAME request id, which
   * returns the original result rather than creating a second refund.
   */
  async reconcileRefund(actor: Actor, caseId: string) {
    this.requirePayPal();
    const kase = await this.database.query.cases.findFirst({ where: eq(cases.id, caseId) });
    if (!kase) throw notFound('Case not found');
    await assertParty(this.database, actor, kase);
    const attempt = await this.latestAttempt(caseId);
    if (!attempt) throw conflict('no_refund', 'No refund has been started for this case.');
    if (attempt.status === 'PENDING' && attempt.paypalRefundId) {
      const result = await this.paypal.getRefund(attempt.paypalRefundId).catch((e: unknown) => {
        throw toAppError(e);
      });
      await this.applyRefundResult(attempt.id, caseId, result, 'reconciled');
    } else if (
      attempt.status === 'UNKNOWN_REQUIRES_RECONCILIATION' ||
      attempt.status === 'AUTHORIZED' ||
      attempt.status === 'PROCESSING' // sendRefund only takes this over once it is stale
    ) {
      await this.sendRefund(attempt.id, caseId);
    }
    return this.refundView(caseId);
  }

  /** Confirms a capture with PayPal, for a verified webhook. */
  captureDetails(captureId: string) {
    return this.paypal.getCapture(captureId);
  }

  /**
   * A verified webhook says something happened to a refund: ask PayPal what is true and apply that,
   * so the event's own contents decide nothing. Returns false for a refund that is not ours. The
   * invoice id finds an attempt whose PayPal response never reached us.
   */
  async applyRefundEvent(refundId: string, invoiceId: string | undefined): Promise<boolean> {
    let attemptId = (
      await this.database.query.refundAttempts.findFirst({ where: eq(refundAttempts.paypalRefundId, refundId) })
    )?.id;
    if (!attemptId && invoiceId) {
      const [match] = await this.database
        .select({ id: refundAttempts.id })
        .from(refundAttempts)
        .innerJoin(settlementProposals, eq(refundAttempts.proposalId, settlementProposals.id))
        .innerJoin(cases, eq(settlementProposals.caseId, cases.id))
        .where(
          and(
            isNull(refundAttempts.paypalRefundId),
            sql`${cases.reference} || '-v' || left(${refundAttempts.proposalId}::text, 8) = ${invoiceId}`,
          ),
        )
        .limit(1);
      attemptId = match?.id;
    }
    if (!attemptId) return false;
    const attempt = await this.database.query.refundAttempts.findFirst({ where: eq(refundAttempts.id, attemptId) });
    const proposal = attempt
      ? await this.database.query.settlementProposals.findFirst({ where: eq(settlementProposals.id, attempt.proposalId) })
      : null;
    if (!proposal) return false;
    await this.applyRefundResult(attemptId, proposal.caseId, await this.paypal.getRefund(refundId), 'webhook');
    return true;
  }

  /** Read-only safety net for missed webhooks: asks PayPal about refunds still pending. Never sends one. */
  async sweepPendingRefunds(): Promise<void> {
    if (!this.paypal.isConfigured()) return;
    const pending = await this.database
      .select({ id: refundAttempts.id, refundId: refundAttempts.paypalRefundId, caseId: settlementProposals.caseId })
      .from(refundAttempts)
      .innerJoin(settlementProposals, eq(refundAttempts.proposalId, settlementProposals.id))
      .where(and(eq(refundAttempts.status, 'PENDING'), isNotNull(refundAttempts.paypalRefundId)));
    for (const { id, refundId, caseId } of pending) {
      try {
        await this.applyRefundResult(id, caseId, await this.paypal.getRefund(refundId as string), 'reconciled');
      } catch {
        // Stays PENDING; the next sweep or a webhook tries again.
      }
    }
  }

  private async sendRefund(attemptId: string, caseId: string): Promise<void> {
    // Move to PROCESSING only from a state that may send; a parallel sender loses this race.
    const [attempt] = await this.database
      .update(refundAttempts)
      .set({
        status: 'PROCESSING',
        attempts: sql`${refundAttempts.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refundAttempts.id, attemptId),
          sql`(${refundAttempts.status} IN ('AUTHORIZED', 'UNKNOWN_REQUIRES_RECONCILIATION') OR (${refundAttempts.status} = 'PROCESSING' AND ${refundAttempts.updatedAt} < ${new Date(Date.now() - STALE_PROCESSING_MS).toISOString()}::timestamptz))`,
        ),
      )
      .returning();
    if (!attempt) return;
    const txn = await this.database.query.transactions.findFirst({
      where: eq(transactions.id, attempt.transactionId),
    });
    const kase = await this.database.query.cases.findFirst({ where: eq(cases.id, caseId) });
    if (!txn?.paypalCaptureId || !kase) throw new Error('refund attempt without a capture');
    let result: RefundResult;
    try {
      result = await this.paypal.refundCapture({
        captureId: txn.paypalCaptureId,
        amountMinor: attempt.isFullRefund ? null : attempt.amountMinor,
        currency: attempt.currency,
        requestId: attempt.paypalRequestId,
        invoiceId: `${kase.reference}-v${attempt.proposalId.slice(0, 8)}`,
        noteToPayer: `ResolveOS settlement for case ${kase.reference}`,
      });
    } catch (error) {
      const unknown = !isDefiniteRefusal(error, attempt.attempts);
      const records = await this.database.transaction(async (tx) => {
        // A webhook may have settled this attempt while the call was failing; PayPal's answer stands.
        const changed = await tx
          .update(refundAttempts)
          .set({
            status: unknown ? 'UNKNOWN_REQUIRES_RECONCILIATION' : 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Refund failed',
            updatedAt: new Date(),
          })
          .where(and(eq(refundAttempts.id, attempt.id), eq(refundAttempts.status, 'PROCESSING')))
          .returning({ id: refundAttempts.id });
        if (changed.length === 0) return [];
        const out = [
          await audit(tx, {
            caseId,
            actorType: 'PAYPAL',
            action: unknown ? 'refund.outcome_unknown' : 'refund.failed',
            details: {
              message: error instanceof Error ? error.message : 'Refund failed',
              issue: error instanceof PayPalError ? error.issue : undefined,
              debugId: error instanceof PayPalError ? error.debugId : undefined,
            },
          }),
        ];
        if (!unknown) {
          out.push(...(await reopenAfterRefusal(tx, caseId, error instanceof Error ? error.message : 'refund failed')));
        }
        return out;
      });
      publish(records);
      return;
    }
    try {
      await this.applyRefundResult(attempt.id, caseId, result, 'response');
    } catch (error) {
      // PayPal answered, but with something we will not record as done (e.g. a different amount).
      await this.database
        .update(refundAttempts)
        .set({
          status: 'UNKNOWN_REQUIRES_RECONCILIATION',
          paypalRefundId: result.refundId,
          paypalStatus: result.status,
          errorMessage: error instanceof Error ? error.message : 'Refund result could not be applied',
          updatedAt: new Date(),
        })
        .where(and(eq(refundAttempts.id, attempt.id), sql`${refundAttempts.status} <> 'COMPLETED'`));
      publish([
        await audit(this.database, {
          caseId,
          actorType: 'SYSTEM',
          action: 'refund.outcome_unknown',
          details: { message: error instanceof Error ? error.message : 'Refund result could not be applied' },
        }),
      ]);
    }
  }

  /**
   * Applies a PayPal refund status (from an API response, a lookup, or a verified webhook).
   * The transaction's refunded total moves exactly once: only on the first move to COMPLETED.
   */
  async applyRefundResult(
    attemptId: string,
    caseId: string,
    result: RefundResult,
    via: 'response' | 'reconciled' | 'webhook',
  ): Promise<void> {
    const status =
      result.status === 'COMPLETED'
        ? 'COMPLETED'
        : result.status === 'PENDING'
          ? 'PENDING'
          : result.status === 'FAILED' || result.status === 'CANCELLED'
            ? 'FAILED'
            : 'UNKNOWN_REQUIRES_RECONCILIATION';
    const records = await this.database.transaction(async (tx) => {
      const out: AuditRecord[] = [];
      const [before] = await tx
        .select()
        .from(refundAttempts)
        .where(eq(refundAttempts.id, attemptId))
        .for('update');
      if (!before) return out;
      if (before.status === 'COMPLETED') return out; // final; nothing to apply twice
      if (before.status === status && before.paypalRefundId === result.refundId) return out; // no change to record
      if (before.status === 'FAILED' && status !== 'COMPLETED') return out; // a late, older status
      if (result.amountMinor !== null && result.amountMinor !== before.amountMinor) {
        throw new AppError(502, 'refund_amount_mismatch', 'PayPal reported a different refund amount.');
      }
      await tx
        .update(refundAttempts)
        .set({
          status,
          paypalRefundId: result.refundId,
          paypalStatus: result.status,
          errorMessage: status === 'FAILED' ? `PayPal reported the refund as ${result.status}.` : null,
          updatedAt: new Date(),
        })
        .where(eq(refundAttempts.id, attemptId));
      if (status === 'COMPLETED') {
        const [txn] = await tx
          .update(transactions)
          .set({
            amountRefundedMinor: sql`${transactions.amountRefundedMinor} + ${before.amountMinor}`,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, before.transactionId))
          .returning();
        if (txn) {
          await tx
            .update(transactions)
            .set({
              paymentStatus: txn.amountRefundedMinor >= txn.originalAmountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            })
            .where(eq(transactions.id, txn.id));
        }
        await tx
          .update(settlementProposals)
          .set({ currentStatus: 'EXECUTED' })
          .where(eq(settlementProposals.id, before.proposalId));
        await tx
          .update(cases)
          .set({ currentStatus: 'RESOLVED', updatedAt: new Date() })
          .where(eq(cases.id, caseId));
      }
      out.push(
        await audit(tx, {
          caseId,
          actorType: 'PAYPAL',
          action: `refund.${status.toLowerCase()}`,
          details: {
            refundId: result.refundId,
            paypalStatus: result.status,
            amount: formatMoney(before.amountMinor, before.currency),
            via,
          },
        }),
      );
      if (status === 'COMPLETED') {
        out.push(
          await audit(tx, {
            caseId,
            actorType: 'SYSTEM',
            action: 'case.resolved',
            details: { reason: 'PayPal confirmed the settlement refund.' },
          }),
        );
      }
      if (status === 'FAILED') {
        out.push(...(await reopenAfterRefusal(tx, caseId, `PayPal reported the refund as ${result.status}`)));
      }
      return out;
    });
    publish(records);
  }

  async latestAttempt(caseId: string) {
    const [row] = await this.database
      .select({ attempt: refundAttempts })
      .from(refundAttempts)
      .innerJoin(settlementProposals, eq(settlementProposals.id, refundAttempts.proposalId))
      .where(eq(settlementProposals.caseId, caseId))
      .orderBy(desc(refundAttempts.createdAt))
      .limit(1);
    return row?.attempt ?? null;
  }

  async refundView(caseId: string) {
    const attempt = await this.latestAttempt(caseId);
    if (!attempt) return null;
    return {
      status: attempt.status,
      paypalRefundId: attempt.paypalRefundId,
      paypalStatus: attempt.paypalStatus,
      amountMinor: attempt.amountMinor,
      currency: attempt.currency,
      isFullRefund: attempt.isFullRefund,
      errorMessage: attempt.errorMessage,
      requestId: attempt.paypalRequestId,
      updatedAt: attempt.updatedAt.toISOString(),
    };
  }
}

/**
 * A send that crashed part-way leaves its attempt in PROCESSING. Longer than the slowest possible
 * call (two token fetches and two POSTs at 20 s each), so a live send is never taken over.
 */
const STALE_PROCESSING_MS = 120_000;

/** Answers that do not prove the request was refused, however they are worded. */
const INCONCLUSIVE_STATUSES = new Set([408, 409, 425, 429]);
/** On a resend, these can mean our own earlier send succeeded (e.g. its idempotency record expired). */
const ALREADY_APPLIED_ISSUES = new Set(['CAPTURE_FULLY_REFUNDED', 'REFUND_AMOUNT_EXCEEDED', 'TOTAL_REFUND_AMOUNT_EXCEEDED']);

/**
 * True only when PayPal itself clearly refused this refund. Marking a refund FAILED reopens the
 * case, and new terms get a new request id, so a wrong FAILED could pay the buyer twice. Anything
 * short of a definite refusal therefore stays "unknown" and is reconciled with the same request id.
 */
function isDefiniteRefusal(error: unknown, sends: number): boolean {
  if (!(error instanceof PayPalError) || error.kind !== 'rejected') return false;
  if (error.status === undefined || INCONCLUSIVE_STATUSES.has(error.status)) return false;
  return !(sends > 1 && error.issue !== undefined && ALREADY_APPLIED_ISSUES.has(error.issue));
}

/**
 * After PayPal definitively refuses an approved refund, no money moved and the approved terms
 * cannot be carried out. Rather than leave the case stuck in "payment processing", it goes back to
 * negotiation with PayPal's reason as context; any new terms need both approvals again (a new
 * proposal version, so the old approvals cannot be reused).
 */
async function reopenAfterRefusal(tx: Tx, caseId: string, reason: string): Promise<AuditRecord[]> {
  const [kase] = await tx.select().from(cases).where(eq(cases.id, caseId)).for('update');
  if (!kase || kase.currentStatus === 'RESOLVED') return [];
  await tx
    .update(cases)
    .set({
      currentStatus: 'IN_NEGOTIATION',
      maxTurns: Math.min(12, kase.maxTurns + 4),
      revisionNotes: [...kase.revisionNotes, `system: PayPal refused the approved refund (${reason})`],
      outcomeSummary: `PayPal refused the approved refund (${reason}). No money moved. The agents can negotiate new terms, which both of you must approve again.`,
      updatedAt: new Date(),
    })
    .where(eq(cases.id, caseId));
  return [
    await audit(tx, {
      caseId,
      actorType: 'SYSTEM',
      action: 'negotiation.resumed',
      details: { reason: 'PayPal refused the approved refund', detail: reason },
    }),
  ];
}

/** Buyer of the case, the case's merchant owner, or (read-only callers check this) the operator. */
export async function assertParty(
  tx: Tx,
  actor: Actor,
  kase: { buyerId: string; merchantId: string },
  options: { allowOperator?: boolean } = {},
): Promise<'BUYER' | 'MERCHANT' | 'OPERATOR'> {
  if (actor.role === 'BUYER' && kase.buyerId === actor.userId) return 'BUYER';
  if (actor.role === 'MERCHANT') {
    const merchant = await tx.query.merchants.findFirst({ where: eq(merchants.id, kase.merchantId) });
    if (merchant?.ownerUserId === actor.userId) return 'MERCHANT';
  }
  if (actor.role === 'OPERATOR' && options.allowOperator) return 'OPERATOR';
  // 404, not 403: a stranger learns nothing about whether the case exists.
  throw notFound('Case not found');
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof PayPalError) {
    const status =
      error.kind === 'not_configured' ? 503 : error.kind === 'auth_failed' ? 502 : error.kind === 'rejected' ? 422 : 502;
    return new AppError(status, `paypal_${error.kind}`, error.message, {
      issue: error.issue,
      debugId: error.debugId,
    });
  }
  return new AppError(500, 'internal_error', 'Something went wrong.');
}
