import { asc, desc, eq, max } from 'drizzle-orm';

import { type AuditRecord, audit, publish } from '../audit.js';
import { AiError } from '../ai/provider.js';
import { type Db, type Tx } from '../db/index.js';
import {
  cases,
  evidence,
  merchants,
  negotiationTurns,
  settlementProposals,
  transactions,
  users,
} from '../db/schema.js';
import { AppError, conflict, notFound } from '../errors.js';
import { formatMoney } from '../money.js';
import { type Actor, assertParty } from '../payments/service.js';
import { type SettlementType, termsHash } from '../settlement/terms.js';
import type { AgentInput, SharedFacts } from './context.js';
import type { TurnEngine } from './engines.js';
import { type AgentTurn, agentTurnSchema } from './turn.js';

/**
 * The neutral orchestrator. It, not a model, controls the negotiation:
 *
 *   - whose turn it is (buyer agent first, then alternating), and the turn budget (`max_turns`);
 *   - what each agent is shown (shared facts + only its own side's private limits);
 *   - whether a turn is acceptable: the JSON schema, then server checks — evidence codes exist,
 *     the currency is the payment's, a full refund is exactly the refundable amount, a partial
 *     refund is strictly between 0 and it, the merchant agent never exceeds the merchant's limit,
 *     the buyer agent never goes below the buyer's floor, and "accepting" really matches the other
 *     side's latest offer. A rejected turn is retried once with the reason; then the attempt fails
 *     with a recoverable error and NOTHING is invented in its place;
 *   - when it stops: agreement (both sides on the same terms) → a settlement proposal for the two
 *     people to approve; an escalation request → handed to a person; the budget used up → no
 *     agreement, with the gap explained.
 *
 * Agents have no tools and never touch money or approvals. A proposal is only ever a proposal.
 */

export class NegotiationError extends AppError {}

export interface EngineSet {
  live: TurnEngine | null;
  demo: TurnEngine;
}

type CaseRow = typeof cases.$inferSelect;

export class Orchestrator {
  constructor(
    private readonly database: Db,
    private readonly engines: EngineSet,
  ) {}

  async start(actor: Actor, caseId: string, mode: 'live' | 'demo') {
    const engine = mode === 'live' ? this.engines.live : this.engines.demo;
    if (!engine) {
      throw new AppError(
        503,
        'ai_not_configured',
        'Live AI is not configured. Add AI_API_BASE_URL, AI_API_KEY and AI_MODEL to .env, or run the labelled demo negotiator.',
      );
    }
    const records = await this.database.transaction(async (tx) => {
      const [kase] = await tx.select().from(cases).where(eq(cases.id, caseId)).for('update');
      if (!kase) throw notFound('Case not found');
      await assertParty(tx, actor, kase);
      if (kase.currentStatus !== 'OPEN' && kase.currentStatus !== 'NO_AGREEMENT') {
        throw conflict('already_started', 'This negotiation has already started.');
      }
      if (kase.currentStatus === 'NO_AGREEMENT') {
        // A fresh attempt after a deadlock: clear the old turns, keep the audit history.
        await tx.delete(negotiationTurns).where(eq(negotiationTurns.caseId, caseId));
      }
      await tx
        .update(cases)
        .set({ currentStatus: 'IN_NEGOTIATION', negotiationMode: mode, outcomeSummary: null, updatedAt: new Date() })
        .where(eq(cases.id, caseId));
      return [
        await audit(tx, {
          caseId,
          actorType: 'USER',
          actorUserId: actor.userId,
          action: 'negotiation.started',
          details: { mode, model: engine.model },
        }),
      ];
    });
    publish(records);
    return this.history(actor, caseId);
  }

  /** Runs exactly one agent turn (or ends the negotiation). Safe to call concurrently. */
  async advance(actor: Actor, caseId: string) {
    const kase = await this.database.query.cases.findFirst({ where: eq(cases.id, caseId) });
    if (!kase) throw notFound('Case not found');
    await assertParty(this.database, actor, kase);
    if (kase.currentStatus !== 'IN_NEGOTIATION') {
      throw conflict('not_negotiating', 'This case is not in negotiation.');
    }
    const engine = kase.negotiationMode === 'live' ? this.engines.live : this.engines.demo;
    if (!engine) throw new AppError(503, 'ai_not_configured', 'Live AI is not configured.');

    const { input, txn } = await this.buildInput(kase);
    publish([
      await audit(this.database, {
        caseId,
        actorType: 'AGENT',
        action: 'agent.thinking',
        details: { agent: input.agent, turn: input.facts.turnNumber },
      }),
    ]);

    let turn: AgentTurn | null = null;
    let feedback: string | undefined;
    for (let attempt = 1; attempt <= 2 && !turn; attempt += 1) {
      let raw: string;
      try {
        raw = await engine.produce(input, feedback);
      } catch (error) {
        const message = error instanceof AiError ? error.message : 'The AI provider failed.';
        publish([
          await audit(this.database, {
            caseId,
            actorType: 'SYSTEM',
            action: 'agent.failed',
            details: { agent: input.agent, reason: message },
          }),
        ]);
        throw new AppError(502, 'ai_unavailable', `${message} The case is saved; you can retry.`);
      }
      const checked = validateTurn(raw, input, txn.currency);
      if (checked.ok) turn = checked.turn;
      else {
        feedback = checked.problem;
        publish([
          await audit(this.database, {
            caseId,
            actorType: 'SYSTEM',
            action: 'agent.output_rejected',
            details: { agent: input.agent, attempt, problem: checked.problem },
          }),
        ]);
      }
    }
    if (!turn) {
      throw new AppError(
        502,
        'ai_invalid_output',
        `The ${input.agent.toLowerCase()} agent did not produce a valid turn (${feedback}). Nothing was recorded; you can retry.`,
      );
    }

    const records = await this.database.transaction(async (tx) => {
      const out: AuditRecord[] = [];
      const [locked] = await tx.select().from(cases).where(eq(cases.id, caseId)).for('update');
      if (!locked || locked.currentStatus !== 'IN_NEGOTIATION') {
        throw conflict('not_negotiating', 'This case stopped negotiating meanwhile.');
      }
      const [{ value: last } = { value: null }] = await tx
        .select({ value: max(negotiationTurns.turnIndex) })
        .from(negotiationTurns)
        .where(eq(negotiationTurns.caseId, caseId));
      const index = (last ?? 0) + 1;
      if (index !== input.facts.turnNumber) {
        throw conflict('turn_conflict', 'Another turn was recorded meanwhile; refresh to continue.');
      }
      await tx.insert(negotiationTurns).values({
        caseId,
        turnIndex: index,
        agentType: turn.agent,
        structuredOutput: turn,
        provider: engine.kind,
        model: engine.model,
      });
      out.push(
        await audit(tx, {
          caseId,
          actorType: 'AGENT',
          action: turn.acceptsCounterpartOffer ? 'agent.accepted' : turn.proposedAction === 'ESCALATE' ? 'agent.escalated' : index <= 2 ? 'agent.proposal' : 'agent.counteroffer',
          details: {
            agent: turn.agent,
            turn: index,
            action: turn.proposedAction,
            amount: turn.proposedRefundMinorUnits === null ? null : formatMoney(turn.proposedRefundMinorUnits, txn.currency),
            mode: engine.kind,
          },
        }),
      );
      out.push(...(await this.decide(tx, locked, txn, [...input.facts.history, turn], index)));
      return out;
    });
    publish(records);
    return this.history(actor, caseId);
  }

  /** Runs turns until the negotiation stops (bounded by the case's turn budget). */
  async runToEnd(actor: Actor, caseId: string) {
    for (let guard = 0; guard < 12; guard += 1) {
      const kase = await this.database.query.cases.findFirst({ where: eq(cases.id, caseId) });
      if (!kase || kase.currentStatus !== 'IN_NEGOTIATION') break;
      await this.advance(actor, caseId);
    }
    return this.history(actor, caseId);
  }

  /** Deterministic stopping rules, applied after every recorded turn. */
  private async decide(tx: Tx, kase: CaseRow, txn: { currency: string; refundableMinor: number; amountMinor: number }, turns: AgentTurn[], index: number) {
    const out: AuditRecord[] = [];
    const latest = turns.at(-1) as AgentTurn;
    const other = [...turns].reverse().find((t) => t.agent !== latest.agent);
    const sameTerms =
      other !== undefined &&
      other.proposedAction === latest.proposedAction &&
      other.proposedRefundMinorUnits === latest.proposedRefundMinorUnits &&
      other.proposedAction !== 'ESCALATE';

    if (latest.proposedAction === 'ESCALATE' || latest.requiresHumanReview) {
      const summary = `The ${latest.agent.toLowerCase()} agent asked for human review: ${latest.reasoningSummary}`;
      await tx.update(cases).set({ currentStatus: 'ESCALATED', outcomeSummary: summary, updatedAt: new Date() }).where(eq(cases.id, kase.id));
      out.push(await audit(tx, { caseId: kase.id, actorType: 'SYSTEM', action: 'negotiation.escalated', details: { summary } }));
      return out;
    }

    if (sameTerms) {
      const type = latest.proposedAction as SettlementType;
      const amount = latest.proposedRefundMinorUnits ?? 0;
      const [{ value: lastVersion } = { value: null }] = await tx
        .select({ value: max(settlementProposals.proposalVersion) })
        .from(settlementProposals)
        .where(eq(settlementProposals.caseId, kase.id));
      const version = (lastVersion ?? 0) + 1;
      await tx
        .update(settlementProposals)
        .set({ currentStatus: 'SUPERSEDED' })
        .where(eq(settlementProposals.caseId, kase.id));
      const merchant = await tx.query.merchants.findFirst({ where: eq(merchants.id, kase.merchantId) });
      const buyer = await tx.query.users.findFirst({ where: eq(users.id, kase.buyerId) });
      const summary =
        type === 'FULL_REFUND' || type === 'PARTIAL_REFUND'
          ? `${merchant?.businessName ?? 'The merchant'} refunds ${formatMoney(amount, txn.currency)} of ${formatMoney(txn.amountMinor, txn.currency)} to ${buyer?.name ?? 'the buyer'} (${type === 'FULL_REFUND' ? 'full' : 'partial'} refund through PayPal).`
          : type === 'REPLACEMENT'
            ? `${merchant?.businessName ?? 'The merchant'} sends a replacement. No PayPal refund; the merchant must ship it manually.`
            : `Both sides agree to close the case with no refund.`;
      await tx.insert(settlementProposals).values({
        caseId: kase.id,
        proposalVersion: version,
        settlementType: type,
        refundAmountMinor: amount,
        currency: txn.currency,
        summary,
        termsHash: termsHash({ caseId: kase.id, proposalVersion: version, settlementType: type, refundAmountMinor: amount, currency: txn.currency }),
        requiresManualAction: type === 'REPLACEMENT',
      });
      await tx
        .update(cases)
        .set({ currentStatus: 'AWAITING_APPROVAL', outcomeSummary: summary, updatedAt: new Date() })
        .where(eq(cases.id, kase.id));
      out.push(
        await audit(tx, {
          caseId: kase.id,
          actorType: 'SYSTEM',
          action: 'agreement.proposed',
          details: { version, type, amount: formatMoney(amount, txn.currency), turn: index, summary },
        }),
      );
      out.push(await audit(tx, { caseId: kase.id, actorType: 'SYSTEM', action: 'approval.requested', details: { version, from: ['BUYER', 'MERCHANT'] } }));
      return out;
    }

    if (index >= kase.maxTurns) {
      const lastBuyer = [...turns].reverse().find((t) => t.agent === 'BUYER');
      const lastMerchant = [...turns].reverse().find((t) => t.agent === 'MERCHANT');
      const describe = (t: AgentTurn | undefined) =>
        !t ? 'no position' : t.proposedRefundMinorUnits !== null ? `${t.proposedAction.toLowerCase().replace('_', ' ')} of ${formatMoney(t.proposedRefundMinorUnits, txn.currency)}` : t.proposedAction.toLowerCase().replace('_', ' ');
      const summary = `No agreement after ${index} turns. Buyer's last position: ${describe(lastBuyer)}. Merchant's last position: ${describe(lastMerchant)}. No payment was made. Either party can escalate through PayPal's own resolution process.`;
      await tx.update(cases).set({ currentStatus: 'NO_AGREEMENT', outcomeSummary: summary, updatedAt: new Date() }).where(eq(cases.id, kase.id));
      out.push(await audit(tx, { caseId: kase.id, actorType: 'SYSTEM', action: 'negotiation.deadlock', details: { summary } }));
    }
    return out;
  }

  private async buildInput(kase: CaseRow): Promise<{ input: AgentInput; txn: { currency: string; refundableMinor: number; amountMinor: number } }> {
    const database = this.database;
    const txn = await database.query.transactions.findFirst({ where: eq(transactions.id, kase.transactionId) });
    const merchant = await database.query.merchants.findFirst({ where: eq(merchants.id, kase.merchantId) });
    const buyer = await database.query.users.findFirst({ where: eq(users.id, kase.buyerId) });
    if (!txn || !merchant || !buyer) throw notFound('Case data is incomplete');
    const items = await database.select().from(evidence).where(eq(evidence.caseId, kase.id)).orderBy(asc(evidence.code));
    const turns = await database
      .select()
      .from(negotiationTurns)
      .where(eq(negotiationTurns.caseId, kase.id))
      .orderBy(asc(negotiationTurns.turnIndex));
    const history = turns.map((t) => t.structuredOutput as AgentTurn);
    const refundableMinor = txn.originalAmountMinor - txn.amountRefundedMinor;
    const facts: SharedFacts = {
      reference: kase.reference,
      category: kase.category,
      title: kase.title,
      description: kase.description,
      item: txn.description,
      buyerName: buyer.name,
      merchantName: merchant.businessName,
      amountMinor: txn.originalAmountMinor,
      refundableMinor,
      currency: txn.currency,
      paymentVerifiedByPayPal: txn.sourceType === 'PAYPAL_SANDBOX' && Boolean(txn.paypalCaptureId),
      evidence: items.map((e) => ({
        code: e.code,
        sourceParty: e.sourceParty,
        verificationStatus: e.verificationStatus,
        evidenceType: e.evidenceType,
        title: e.title,
        content: e.content,
      })),
      history,
      turnNumber: turns.length + 1,
      maxTurns: kase.maxTurns,
      revisionNotes: kase.revisionNotes,
    };
    const agent: 'BUYER' | 'MERCHANT' = turns.length % 2 === 0 ? 'BUYER' : 'MERCHANT';
    const input: AgentInput =
      agent === 'BUYER'
        ? { agent, facts, own: { desiredOutcome: kase.buyerDesiredOutcome, floorMinor: kase.buyerFloorMinor } }
        : {
            agent,
            facts,
            own: {
              preference: kase.merchantPreference,
              maxRefundMinor: Math.min(kase.merchantMaxRefundMinor, merchant.defaultRefundLimitMinor),
              refundPolicy: merchant.refundPolicy,
            },
          };
    return { input, txn: { currency: txn.currency, refundableMinor, amountMinor: txn.originalAmountMinor } };
  }

  async history(actor: Actor, caseId: string) {
    const kase = await this.database.query.cases.findFirst({ where: eq(cases.id, caseId) });
    if (!kase) throw notFound('Case not found');
    await assertParty(this.database, actor, kase, { allowOperator: true });
    const turns = await this.database
      .select()
      .from(negotiationTurns)
      .where(eq(negotiationTurns.caseId, caseId))
      .orderBy(asc(negotiationTurns.turnIndex));
    const proposal = await this.database.query.settlementProposals.findFirst({
      where: eq(settlementProposals.caseId, caseId),
      orderBy: desc(settlementProposals.proposalVersion),
    });
    return {
      status: kase.currentStatus,
      mode: kase.negotiationMode,
      maxTurns: kase.maxTurns,
      outcomeSummary: kase.outcomeSummary,
      turns: turns.map((t) => ({
        index: t.turnIndex,
        provider: t.provider,
        model: t.model,
        createdAt: t.createdAt.toISOString(),
        ...(t.structuredOutput as AgentTurn),
      })),
      proposal: proposal ?? null,
    };
  }
}

/** Schema + server-side checks for one raw agent answer. */
export function validateTurn(
  raw: string,
  input: AgentInput,
  currency: string,
): { ok: true; turn: AgentTurn } | { ok: false; problem: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, problem: 'the answer was not valid JSON' };
  }
  const parsed = agentTurnSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      problem: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'answer'}: ${i.message}`).join('; '),
    };
  }
  const body = parsed.data;
  const { facts } = input;
  const codes = new Set(facts.evidence.map((e) => e.code));
  const unknown = body.evidenceReferences.filter((code) => !codes.has(code));
  if (unknown.length) return { ok: false, problem: `cites evidence that does not exist: ${unknown.join(', ')}` };
  if (body.currency !== currency) return { ok: false, problem: `currency must be ${currency}` };

  let amount = body.proposedRefundMinorUnits;
  switch (body.proposedAction) {
    case 'FULL_REFUND':
      if (amount !== null && amount !== facts.refundableMinor) {
        return { ok: false, problem: `a FULL_REFUND is exactly ${facts.refundableMinor}` };
      }
      amount = facts.refundableMinor;
      break;
    case 'PARTIAL_REFUND':
      if (amount === null || amount <= 0 || amount >= facts.refundableMinor) {
        return { ok: false, problem: `a PARTIAL_REFUND needs an amount between 1 and ${facts.refundableMinor - 1}` };
      }
      break;
    default:
      amount = null;
  }

  if (input.agent === 'MERCHANT' && amount !== null && amount > input.own.maxRefundMinor) {
    return { ok: false, problem: `the merchant is not authorised to refund more than ${input.own.maxRefundMinor}` };
  }
  if (input.agent === 'BUYER' && amount !== null && input.own.floorMinor !== null && amount < input.own.floorMinor) {
    return { ok: false, problem: `the buyer does not accept less than ${input.own.floorMinor}` };
  }
  if (input.agent === 'BUYER' && input.own.floorMinor === null && amount !== null && amount < facts.refundableMinor) {
    return { ok: false, problem: 'the buyer only accepts a full remedy' };
  }

  if (body.acceptsCounterpartOffer) {
    const theirs = [...facts.history].reverse().find((t) => t.agent !== input.agent);
    if (!theirs || theirs.proposedAction !== body.proposedAction || theirs.proposedRefundMinorUnits !== amount) {
      return { ok: false, problem: 'acceptsCounterpartOffer is true but the action/amount differ from the other side’s latest offer' };
    }
  }

  return { ok: true, turn: { ...body, proposedRefundMinorUnits: amount, agent: input.agent } };
}
