import { and, desc, eq } from 'drizzle-orm';

import { type AuditRecord, audit, publish } from '../audit.js';
import { type Db } from '../db/index.js';
import { approvals, cases, settlementProposals, transactions } from '../db/schema.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { type Actor, type PaymentService, assertParty } from '../payments/service.js';
import { movesMoney } from './terms.js';

/**
 * Human approval of a proposed settlement. Each party records its own decision (the role comes from
 * the session, so the buyer can never approve for the merchant), and every decision stores the
 * terms hash it was made on. A decision on an older version, or after the terms changed, is refused.
 *
 * When both parties have approved:
 *   - a refund on a real captured sandbox payment is executed by the payment service, exactly as
 *     approved (and only there);
 *   - a refund on seeded demo data is NOT executed: it is marked approved and labelled as demo;
 *   - "no refund" closes the case; "replacement" closes it as needing the merchant's manual action.
 */
export class SettlementService {
  constructor(
    private readonly database: Db,
    private readonly payments: PaymentService,
  ) {}

  async view(actor: Actor, caseId: string) {
    const kase = await this.database.query.cases.findFirst({ where: eq(cases.id, caseId) });
    if (!kase) throw notFound('Case not found');
    await assertParty(this.database, actor, kase, { allowOperator: true });
    const proposal = await this.database.query.settlementProposals.findFirst({
      where: eq(settlementProposals.caseId, caseId),
      orderBy: desc(settlementProposals.proposalVersion),
    });
    const decisions = proposal
      ? await this.database.select().from(approvals).where(eq(approvals.proposalId, proposal.id))
      : [];
    const txn = await this.database.query.transactions.findFirst({ where: eq(transactions.id, kase.transactionId) });
    return {
      caseStatus: kase.currentStatus,
      proposal,
      approvals: decisions.map((d) => ({
        role: d.role,
        decision: d.decision,
        note: d.note,
        createdAt: d.createdAt.toISOString(),
        validForCurrentTerms: proposal ? d.approvedTermsHash === proposal.termsHash : false,
      })),
      transaction: txn
        ? {
            amountMinor: txn.originalAmountMinor,
            refundedMinor: txn.amountRefundedMinor,
            currency: txn.currency,
            sourceType: txn.sourceType,
            paypalCaptureId: txn.paypalCaptureId,
            paymentStatus: txn.paymentStatus,
          }
        : null,
      refund: await this.payments.refundView(caseId),
    };
  }

  async decide(
    actor: Actor,
    caseId: string,
    input: { proposalVersion: number; decision: 'APPROVE' | 'REJECT' | 'REQUEST_REVISION'; note?: string },
  ) {
    if (actor.role === 'OPERATOR') throw forbidden('The demo operator cannot approve on anyone’s behalf.');
    let bothApproved = false;
    let movesRealMoney = false;
    const records = await this.database.transaction(async (tx) => {
      const out: AuditRecord[] = [];
      const [kase] = await tx.select().from(cases).where(eq(cases.id, caseId)).for('update');
      if (!kase) throw notFound('Case not found');
      const role = await assertParty(tx, actor, kase);
      if (role === 'OPERATOR') throw forbidden();
      const [proposal] = await tx
        .select()
        .from(settlementProposals)
        .where(eq(settlementProposals.caseId, caseId))
        .orderBy(desc(settlementProposals.proposalVersion))
        .limit(1)
        .for('update');
      if (!proposal) throw conflict('no_proposal', 'There is no settlement to decide on.');
      if (proposal.proposalVersion !== input.proposalVersion) {
        throw conflict('stale_version', `These terms were replaced by version ${proposal.proposalVersion}. Review the new terms.`);
      }
      if (proposal.currentStatus !== 'PENDING_APPROVAL') {
        throw conflict('not_pending', `This settlement is already ${proposal.currentStatus.toLowerCase().replace('_', ' ')}.`);
      }
      const existing = await tx.query.approvals.findFirst({
        where: and(eq(approvals.proposalId, proposal.id), eq(approvals.role, role)),
      });
      if (existing) throw conflict('already_decided', 'You have already recorded your decision on these terms.');

      await tx.insert(approvals).values({
        proposalId: proposal.id,
        approverUserId: actor.userId,
        role,
        decision: input.decision,
        approvedTermsHash: proposal.termsHash,
        note: input.note?.trim() || null,
      });
      out.push(
        await audit(tx, {
          caseId,
          actorType: 'USER',
          actorUserId: actor.userId,
          action: `approval.${input.decision.toLowerCase()}`,
          details: { role, version: proposal.proposalVersion, note: input.note?.trim() || undefined },
        }),
      );

      if (input.decision === 'REJECT') {
        await tx.update(settlementProposals).set({ currentStatus: 'REJECTED' }).where(eq(settlementProposals.id, proposal.id));
        const summary = `The ${role.toLowerCase()} rejected the proposed settlement. No payment was made. Either party can escalate through PayPal's own resolution process.`;
        await tx.update(cases).set({ currentStatus: 'NO_AGREEMENT', outcomeSummary: summary, updatedAt: new Date() }).where(eq(cases.id, caseId));
        out.push(await audit(tx, { caseId, actorType: 'SYSTEM', action: 'settlement.rejected', details: { summary } }));
        return out;
      }
      if (input.decision === 'REQUEST_REVISION') {
        await tx.update(settlementProposals).set({ currentStatus: 'REVISION_REQUESTED' }).where(eq(settlementProposals.id, proposal.id));
        await tx
          .update(cases)
          .set({
            currentStatus: 'IN_NEGOTIATION',
            maxTurns: Math.min(12, kase.maxTurns + 4),
            revisionNotes: [...kase.revisionNotes, `${role.toLowerCase()}: ${input.note?.trim() || 'please revise'}`],
            updatedAt: new Date(),
          })
          .where(eq(cases.id, caseId));
        out.push(await audit(tx, { caseId, actorType: 'SYSTEM', action: 'negotiation.resumed', details: { reason: 'revision requested', by: role } }));
        return out;
      }

      const decisions = await tx.select().from(approvals).where(eq(approvals.proposalId, proposal.id));
      bothApproved = (['BUYER', 'MERCHANT'] as const).every((r) =>
        decisions.some((d) => d.role === r && d.decision === 'APPROVE' && d.approvedTermsHash === proposal.termsHash),
      );
      if (!bothApproved) return out;

      await tx.update(settlementProposals).set({ currentStatus: 'APPROVED' }).where(eq(settlementProposals.id, proposal.id));
      out.push(await audit(tx, { caseId, actorType: 'SYSTEM', action: 'settlement.approved', details: { version: proposal.proposalVersion } }));
      const txn = await tx.query.transactions.findFirst({ where: eq(transactions.id, kase.transactionId) });
      const real = txn?.sourceType === 'PAYPAL_SANDBOX' && Boolean(txn.paypalCaptureId);
      if (movesMoney(proposal.settlementType)) {
        movesRealMoney = real;
        if (!real) {
          const summary = `${proposal.summary} Both parties approved. This case uses seeded demo data, so no PayPal refund was made.`;
          await tx.update(cases).set({ outcomeSummary: summary, updatedAt: new Date() }).where(eq(cases.id, caseId));
          out.push(await audit(tx, { caseId, actorType: 'SYSTEM', action: 'refund.not_possible_demo_data', details: { summary } }));
        }
      } else {
        await tx.update(settlementProposals).set({ currentStatus: 'EXECUTED' }).where(eq(settlementProposals.id, proposal.id));
        await tx.update(cases).set({ currentStatus: 'RESOLVED', updatedAt: new Date() }).where(eq(cases.id, caseId));
        out.push(
          await audit(tx, {
            caseId,
            actorType: 'SYSTEM',
            action: 'case.resolved',
            details: {
              reason: proposal.requiresManualAction
                ? 'Agreed replacement: the merchant must ship it manually. No PayPal refund.'
                : 'Agreed to close with no refund.',
            },
          }),
        );
      }
      return out;
    });
    publish(records);
    if (bothApproved && movesRealMoney) {
      // Separate step, separate transaction: the payment service re-checks everything itself.
      await this.payments.executeApprovedRefund(actor, caseId);
    }
    return this.view(actor, caseId);
  }
}
