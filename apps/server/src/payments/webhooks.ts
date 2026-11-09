import { randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { type AuditRecord, audit, publish } from '../audit.js';
import { type Db } from '../db/index.js';
import { cases, settlementProposals, transactions, webhookEvents } from '../db/schema.js';
import { type CertFetcher, verifyWebhook } from '../paypal/webhook-verify.js';
import { type PaymentService } from './service.js';

/**
 * PayPal webhook handling. Order of operations:
 *   1. Verify the signature against the raw bytes. Unverified events are quarantined under a random
 *      id (never the id they claim) for inspection, and never change any payment state.
 *   2. Deduplicate on PayPal's event id (unique column): a redelivery of a processed event is
 *      acknowledged, not re-run; one that was recorded but never finished is applied.
 *   3. Apply only events that match a payment ResolveOS knows about, and take the outcome from a
 *      fresh PayPal lookup, not from the event. If PayPal cannot be reached the event stays open and
 *      the 503 makes PayPal deliver it again. Lookups are by id, so order of arrival does not matter.
 */

interface WebhookEnvelope {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    invoice_id?: string;
    dispute_id?: string;
    disputed_transactions?: { seller_transaction_id?: string }[];
  };
}

export type WebhookOutcome =
  | { status: 200; result: 'processed' | 'duplicate' | 'ignored' }
  | { status: 503; result: 'retry' }
  | { status: 400; result: 'unverified' | 'malformed' };

export const REFUND_EVENT_TYPES = [
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.REFUND.COMPLETED',
  'PAYMENT.REFUND.PENDING',
  'PAYMENT.REFUND.FAILED',
  'PAYMENT.REFUND.DENIED',
  'PAYMENT.REFUND.CANCELLED',
];
const REFUND_EVENTS = new Set(REFUND_EVENT_TYPES);

/** The events a ResolveOS webhook subscribes to. */
export const WEBHOOK_EVENT_TYPES = [...REFUND_EVENT_TYPES, 'PAYMENT.CAPTURE.COMPLETED', 'CUSTOMER.DISPUTE.CREATED'];

/**
 * A formal PayPal dispute takes over: an unfinished case stops and any settlement not yet executed
 * can no longer be approved or paid. It only ever stops money moving, so the signed event is enough.
 */
async function escalateDisputedCases(database: Db, captureIds: string[], disputeId: string | undefined): Promise<number> {
  const records = await database.transaction(async (tx) => {
    const out: AuditRecord[] = [];
    const active = await tx
      .select({ id: cases.id })
      .from(cases)
      .innerJoin(transactions, eq(cases.transactionId, transactions.id))
      .where(
        and(
          inArray(transactions.paypalCaptureId, captureIds),
          inArray(cases.currentStatus, ['OPEN', 'IN_NEGOTIATION', 'AWAITING_APPROVAL']),
        ),
      )
      .for('update', { of: cases });
    for (const { id } of active) {
      const summary = 'A formal PayPal dispute was opened on this payment, so PayPal’s process now decides it.';
      await tx.update(cases).set({ currentStatus: 'ESCALATED', outcomeSummary: summary, updatedAt: new Date() }).where(eq(cases.id, id));
      await tx
        .update(settlementProposals)
        .set({ currentStatus: 'REJECTED' })
        .where(and(eq(settlementProposals.caseId, id), inArray(settlementProposals.currentStatus, ['PENDING_APPROVAL', 'APPROVED'])));
      out.push(await audit(tx, { caseId: id, actorType: 'PAYPAL', action: 'negotiation.escalated', details: { summary, disputeId } }));
    }
    return out;
  });
  publish(records);
  return records.length;
}

export async function handleWebhook(
  database: Db,
  payments: PaymentService,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  webhookId: string | undefined,
  getCert?: CertFetcher,
): Promise<WebhookOutcome> {
  let event: WebhookEnvelope;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as WebhookEnvelope;
  } catch {
    return { status: 400, result: 'malformed' };
  }
  if (typeof event?.id !== 'string' || typeof event.event_type !== 'string') return { status: 400, result: 'malformed' };

  const verdict = await verifyWebhook(rawBody, headers, webhookId, getCert);
  if (!verdict.ok) {
    // With no webhook configured nothing can be verified, so there is nothing worth keeping.
    if (verdict.reason === 'not_configured') return { status: 400, result: 'unverified' };
    // Kept for inspection under its own id. An unverified request must never occupy (squat) the
    // event id it claims, or the genuine delivery with that id would later be dropped as a duplicate.
    await database.insert(webhookEvents).values({
      paypalEventId: `unverified:${randomUUID()}`,
      eventType: event.event_type.slice(0, 120),
      resourceId: null,
      verificationStatus: `REJECTED:${verdict.reason}`,
      processingStatus: 'QUARANTINED',
      // Identifiers only: this route is public, and must not let anyone fill the database.
      payload: { claimedEventId: event.id.slice(0, 120) },
    });
    return { status: 400, result: 'unverified' };
  }
  const inserted = await database
    .insert(webhookEvents)
    .values({
      paypalEventId: event.id,
      eventType: event.event_type,
      resourceId: event.resource?.id ?? null,
      verificationStatus: 'VERIFIED',
      processingStatus: 'RECEIVED',
      payload: event,
    })
    .onConflictDoNothing({ target: webhookEvents.paypalEventId })
    .returning();
  if (inserted.length === 0) {
    // Seen before. Only a delivery whose processing finished is a duplicate; one still RECEIVED
    // (the server stopped part-way) is applied now. Applying is idempotent, so a race is harmless.
    const seen = await database.query.webhookEvents.findFirst({
      where: eq(webhookEvents.paypalEventId, event.id),
    });
    if (seen && seen.processingStatus !== 'RECEIVED') return { status: 200, result: 'duplicate' };
  }

  const markProcessed = (processingStatus: string) =>
    database
      .update(webhookEvents)
      .set({ processingStatus, processedAt: new Date() })
      .where(eq(webhookEvents.paypalEventId, event.id as string));

  // Leaves the event RECEIVED and answers 503, so PayPal delivers it again.
  const retryLater = async (): Promise<WebhookOutcome> => {
    publish([
      await audit(database, {
        caseId: null,
        actorType: 'SYSTEM',
        action: 'paypal.webhook_retry',
        details: { eventId: event.id, eventType: event.event_type },
      }),
    ]);
    return { status: 503, result: 'retry' };
  };

  if (REFUND_EVENTS.has(event.event_type) && event.resource?.id) {
    let ours: boolean;
    try {
      ours = await payments.applyRefundEvent(event.resource.id, event.resource.invoice_id);
    } catch {
      return retryLater();
    }
    await markProcessed(ours ? 'PROCESSED' : 'IGNORED_UNKNOWN_REFUND');
    return { status: 200, result: ours ? 'processed' : 'ignored' };
  }

  if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') {
    const captureIds = (event.resource?.disputed_transactions ?? [])
      .map((t) => t.seller_transaction_id)
      .filter((id): id is string => typeof id === 'string');
    const escalated = captureIds.length ? await escalateDisputedCases(database, captureIds, event.resource?.dispute_id) : 0;
    await markProcessed(escalated ? 'PROCESSED' : 'IGNORED_NO_ACTIVE_CASE');
    return { status: 200, result: escalated ? 'processed' : 'ignored' };
  }

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && event.resource?.id) {
    const txn = await database.query.transactions.findFirst({
      where: eq(transactions.paypalCaptureId, event.resource.id),
    });
    if (!txn) {
      await markProcessed('IGNORED_UNKNOWN_CAPTURE');
      return { status: 200, result: 'ignored' };
    }
    if (txn.paymentStatus === 'CREATED') {
      let capture: Awaited<ReturnType<PaymentService['captureDetails']>>;
      try {
        capture = await payments.captureDetails(event.resource.id);
      } catch {
        return retryLater();
      }
      if (capture.status !== 'COMPLETED' || capture.amountMinor !== txn.originalAmountMinor) {
        await markProcessed('IGNORED_NOT_CONFIRMED');
        return { status: 200, result: 'ignored' };
      }
    }
    const records = await database.transaction(async (tx) => {
      if (txn.paymentStatus === 'CREATED') {
        await tx
          .update(transactions)
          .set({ paymentStatus: 'CAPTURED', capturedAt: new Date(), updatedAt: new Date() })
          .where(eq(transactions.id, txn.id));
      }
      return [
        await audit(tx, {
          caseId: null,
          actorType: 'PAYPAL',
          action: 'paypal.capture_completed_webhook',
          details: { transactionId: txn.id, captureId: event.resource?.id },
        }),
      ];
    });
    publish(records);
    await markProcessed('PROCESSED');
    return { status: 200, result: 'processed' };
  }

  await markProcessed('IGNORED_EVENT_TYPE');
  return { status: 200, result: 'ignored' };
}
