import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetConfig } from '../src/config.js';
import { closeDb, db } from '../src/db/index.js';
import { cases, merchants, negotiationTurns, transactions, users } from '../src/db/schema.js';
import { DEMO, seedDemo } from '../src/db/seed.js';
import { runMigrations } from '../src/db/migrate.js';
import { validateTurn } from '../src/negotiation/orchestrator.js';
import type { AgentInput } from '../src/negotiation/context.js';
import { FakePayPal, ScriptedEngine, makeFullApp, signIn } from './helpers.js';

let paypal: FakePayPal;
let ids: { alex: string; priya: string; jordan: string; operator: string; jacket: string; lamp: string };

async function idOf(email: string) {
  const row = await db().query.users.findFirst({ where: eq(users.email, email) });
  return row!.id;
}
async function caseId(reference: string) {
  const row = await db().query.cases.findFirst({ where: eq(cases.reference, reference) });
  return row!.id;
}

beforeEach(async () => {
  resetConfig();
  await runMigrations();
  await seedDemo(db());
  paypal = new FakePayPal();
  ids = {
    alex: await idOf(DEMO.buyer.email),
    priya: await idOf(DEMO.secondBuyer.email),
    jordan: await idOf(DEMO.merchant.email),
    operator: await idOf(DEMO.operator.email),
    jacket: await caseId('RA-1042'),
    lamp: await caseId('RA-1043'),
  };
});

afterAll(async () => {
  await closeDb();
});

const json = (body: object) => JSON.stringify(body);
const turnJson = (overrides: Record<string, unknown> = {}) =>
  json({
    reasoningSummary: 'Delivery is recorded (EV-2) but not signed for.',
    evidenceReferences: ['EV-2'],
    uncertainties: [],
    proposedAction: 'PARTIAL_REFUND',
    proposedRefundMinorUnits: 9000,
    currency: 'USD',
    publicMessage: 'We propose a partial refund.',
    acceptsCounterpartOffer: false,
    requiresHumanReview: false,
    ...overrides,
  });

describe('negotiation (deterministic demo engine)', () => {
  it('the jacket case reaches an agreement that both people must then approve', async () => {
    const { app } = makeFullApp(paypal);
    const alex = await signIn(app, ids.alex);
    await alex.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'demo' }).expect(200);
    const res = await alex.post(`/api/cases/${ids.jacket}/negotiate/run`).expect(200);
    expect(res.body.status).toBe('AWAITING_APPROVAL');
    expect(res.body.turns.length).toBeLessThanOrEqual(6);
    expect(res.body.turns[0].agent).toBe('BUYER');
    expect(res.body.turns.every((t: { provider: string }) => t.provider === 'demo')).toBe(true);
    expect(res.body.proposal).toMatchObject({ proposalVersion: 1, currentStatus: 'PENDING_APPROVAL', currency: 'USD' });
    // Within both sides' limits: buyer floor $80, merchant ceiling $120.
    expect(res.body.proposal.refundAmountMinor).toBeGreaterThanOrEqual(8000);
    expect(res.body.proposal.refundAmountMinor).toBeLessThanOrEqual(12000);
  });

  it('different limits give a different result, not a fixed script', async () => {
    await db().update(cases).set({ buyerFloorMinor: 15000 }).where(eq(cases.id, ids.jacket));
    const { app } = makeFullApp(paypal);
    const alex = await signIn(app, ids.alex);
    await alex.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'demo' }).expect(200);
    const res = await alex.post(`/api/cases/${ids.jacket}/negotiate/run`).expect(200);
    expect(['ESCALATED', 'NO_AGREEMENT']).toContain(res.body.status);
    expect(res.body.proposal).toBeNull();
  });

  it('the lamp case ends without a settlement and without any payment', async () => {
    const { app } = makeFullApp(paypal);
    const priya = await signIn(app, ids.priya);
    await priya.post(`/api/cases/${ids.lamp}/negotiate/start`, { mode: 'demo' }).expect(200);
    const res = await priya.post(`/api/cases/${ids.lamp}/negotiate/run`).expect(200);
    expect(['ESCALATED', 'NO_AGREEMENT']).toContain(res.body.status);
    expect(res.body.outcomeSummary).toBeTruthy();
    expect(paypal.refundCalls).toHaveLength(0);
  });

  it('refuses live mode when no AI is configured, instead of faking it', async () => {
    const { app } = makeFullApp(paypal, null);
    const alex = await signIn(app, ids.alex);
    const res = await alex.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'live' }).expect(503);
    expect(res.body.error.code).toBe('ai_not_configured');
  });

  it('a stranger cannot start or read another person’s negotiation', async () => {
    const { app } = makeFullApp(paypal);
    const priya = await signIn(app, ids.priya);
    await priya.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'demo' }).expect(404);
    await priya.get(`/api/cases/${ids.jacket}`).expect(404);
  });

  it('each side’s private limit is hidden from the other side', async () => {
    const { app } = makeFullApp(paypal);
    const alex = await signIn(app, ids.alex);
    const asBuyer = await alex.get(`/api/cases/${ids.jacket}`).expect(200);
    expect(asBuyer.body.case.merchantMaxRefundMinor).toBeNull();
    expect(asBuyer.body.case.buyerFloorMinor).toBe(8000);
    const jordan = await signIn(app, ids.jordan);
    const asMerchant = await jordan.get(`/api/cases/${ids.jacket}`).expect(200);
    expect(asMerchant.body.case.buyerFloorMinor).toBeNull();
    expect(asMerchant.body.case.merchantMaxRefundMinor).toBe(12000);
  });
});

describe('the orchestrator’s gates on model output', () => {
  it('rejects bad output twice, records nothing, and reports a recoverable error', async () => {
    const engine = new ScriptedEngine(['not json', turnJson({ evidenceReferences: ['EV-99'] })]);
    const { app } = makeFullApp(paypal, engine);
    const alex = await signIn(app, ids.alex);
    await alex.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'live' }).expect(200);
    const res = await alex.post(`/api/cases/${ids.jacket}/negotiate/advance`).expect(502);
    expect(res.body.error.code).toBe('ai_invalid_output');
    expect(engine.calls).toBe(2);
    const turns = await db().select().from(negotiationTurns).where(eq(negotiationTurns.caseId, ids.jacket));
    expect(turns).toHaveLength(0);
    const kase = await db().query.cases.findFirst({ where: eq(cases.id, ids.jacket) });
    expect(kase?.currentStatus).toBe('IN_NEGOTIATION');
  });

  it('a provider failure keeps the case and never invents a turn', async () => {
    const engine = new ScriptedEngine([new Error('down')]);
    const { app } = makeFullApp(paypal, engine);
    const alex = await signIn(app, ids.alex);
    await alex.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'live' }).expect(200);
    const res = await alex.post(`/api/cases/${ids.jacket}/negotiate/advance`).expect(502);
    expect(res.body.error.code).toBe('ai_unavailable');
    const turns = await db().select().from(negotiationTurns).where(eq(negotiationTurns.caseId, ids.jacket));
    expect(turns).toHaveLength(0);
  });

  it('a second, valid answer after a rejected one is accepted', async () => {
    const engine = new ScriptedEngine([turnJson({ proposedAction: 'FULL_REFUND', proposedRefundMinorUnits: 5 }), turnJson({ proposedAction: 'FULL_REFUND', proposedRefundMinorUnits: 18000 })]);
    const { app } = makeFullApp(paypal, engine);
    const alex = await signIn(app, ids.alex);
    await alex.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'live' }).expect(200);
    const res = await alex.post(`/api/cases/${ids.jacket}/negotiate/advance`).expect(200);
    expect(res.body.turns).toHaveLength(1);
    expect(res.body.turns[0]).toMatchObject({ agent: 'BUYER', proposedAction: 'FULL_REFUND', proposedRefundMinorUnits: 18000 });
  });

  const facts = {
    reference: 'RA-1',
    category: 'ITEM_NOT_RECEIVED',
    title: 't',
    description: 'd',
    item: 'i',
    buyerName: 'B',
    merchantName: 'M',
    amountMinor: 18000,
    refundableMinor: 18000,
    currency: 'USD',
    paymentVerifiedByPayPal: true,
    evidence: [{ code: 'EV-2', sourceParty: 'MERCHANT' as const, verificationStatus: 'PARTY_PROVIDED' as const, evidenceType: 'T', title: 't', content: 'c' }],
    history: [],
    turnNumber: 1,
    maxTurns: 6,
    revisionNotes: [],
  };
  const merchantInput: AgentInput = { agent: 'MERCHANT', facts, own: { preference: 'p', maxRefundMinor: 12000, refundPolicy: 'r' } };
  const buyerInput: AgentInput = { agent: 'BUYER', facts, own: { desiredOutcome: 'd', floorMinor: 8000 } };

  it.each([
    ['the merchant agent exceeding the merchant limit', merchantInput, turnJson({ proposedRefundMinorUnits: 12001 }), 'not authorised'],
    ['the buyer agent going below the buyer floor', buyerInput, turnJson({ proposedRefundMinorUnits: 7999 }), 'does not accept'],
    ['a wrong currency', buyerInput, turnJson({ currency: 'EUR' }), 'currency'],
    ['a "partial" refund of the whole amount', buyerInput, turnJson({ proposedRefundMinorUnits: 18000 }), 'PARTIAL_REFUND'],
    ['an invented evidence code', buyerInput, turnJson({ evidenceReferences: ['EV-7'] }), 'does not exist'],
    ['accepting an offer that was never made', buyerInput, turnJson({ acceptsCounterpartOffer: true }), 'acceptsCounterpartOffer'],
    ['extra keys smuggled into the answer', buyerInput, turnJson({ executeRefund: true }), 'answer'],
  ])('rejects %s', (_label, input, raw, problem) => {
    const result = validateTurn(raw, input, 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain(problem);
  });

  it('normalises amounts the server owns (full refund = refundable; non-money actions = null)', () => {
    const full = validateTurn(turnJson({ proposedAction: 'FULL_REFUND', proposedRefundMinorUnits: null }), buyerInput, 'USD');
    expect(full.ok && full.turn.proposedRefundMinorUnits).toBe(18000);
    const replace = validateTurn(turnJson({ proposedAction: 'REPLACEMENT', proposedRefundMinorUnits: 4000 }), merchantInput, 'USD');
    expect(replace.ok && replace.turn.proposedRefundMinorUnits).toBeNull();
  });
});

describe('human approval', () => {
  async function agreed(app: Parameters<typeof signIn>[0]) {
    const alex = await signIn(app, ids.alex);
    await alex.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'demo' }).expect(200);
    const run = await alex.post(`/api/cases/${ids.jacket}/negotiate/run`).expect(200);
    return { alex, version: run.body.proposal.proposalVersion as number };
  }

  it('on seeded data both approvals are recorded but no PayPal refund is attempted', async () => {
    const { app } = makeFullApp(paypal);
    const { alex, version } = await agreed(app);
    const jordan = await signIn(app, ids.jordan);
    await alex.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version }).expect(200);
    const res = await jordan.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version }).expect(200);
    expect(res.body.proposal.currentStatus).toBe('APPROVED');
    expect(res.body.refund).toBeNull();
    expect(paypal.refundCalls).toHaveLength(0);
  });

  it('on a real captured payment, the second approval runs exactly the approved refund', async () => {
    // Turn the jacket case's payment into a (fake-PayPal) captured sandbox payment.
    const kase = await db().query.cases.findFirst({ where: eq(cases.id, ids.jacket) });
    await db().update(transactions).set({ sourceType: 'PAYPAL_SANDBOX', paypalOrderId: 'ORDREAL1', paypalCaptureId: 'CAPREAL1' }).where(eq(transactions.id, kase!.transactionId));
    await db().update(cases).set({ sourceType: 'PAYPAL_SANDBOX' }).where(eq(cases.id, ids.jacket));
    const { app } = makeFullApp(paypal);
    const { alex, version } = await agreed(app);
    const jordan = await signIn(app, ids.jordan);
    await alex.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version }).expect(200);
    expect(paypal.refundCalls).toHaveLength(0); // one approval is not enough
    const res = await jordan.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version }).expect(200);
    expect(res.body.refund.status).toBe('COMPLETED');
    expect(paypal.refundCalls).toEqual([expect.objectContaining({ captureId: 'CAPREAL1', amountMinor: res.body.proposal.refundAmountMinor })]);
    const receipt = await alex.get(`/api/cases/${ids.jacket}/receipt`).expect(200);
    expect(receipt.body.status).toBe('RESOLVED');
    expect(receipt.body.refund.verifiedByPayPal).toBe(true);
  });

  it('nobody can decide twice, decide on an old version, or decide for someone else', async () => {
    const { app } = makeFullApp(paypal);
    const { alex, version } = await agreed(app);
    await alex.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version }).expect(200);
    const twice = await alex.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version }).expect(409);
    expect(twice.body.error.code).toBe('already_decided');
    const jordan = await signIn(app, ids.jordan);
    const stale = await jordan.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version + 1 }).expect(409);
    expect(stale.body.error.code).toBe('stale_version');
    const operator = await signIn(app, ids.operator);
    await operator.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version }).expect(403);
  });

  it('a revision request reopens negotiation, and the new agreement needs fresh approvals', async () => {
    const { app } = makeFullApp(paypal);
    const { alex, version } = await agreed(app);
    await alex.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: version }).expect(200);
    const jordan = await signIn(app, ids.jordan);
    await jordan.post(`/api/cases/${ids.jacket}/settlement/revise`, { proposalVersion: version, note: 'Please consider a replacement' }).expect(200);
    const resumed = await alex.get(`/api/cases/${ids.jacket}/negotiate/history`).expect(200);
    expect(resumed.body.status).toBe('IN_NEGOTIATION');
    const again = await alex.post(`/api/cases/${ids.jacket}/negotiate/run`).expect(200);
    if (again.body.status === 'AWAITING_APPROVAL') {
      expect(again.body.proposal.proposalVersion).toBe(version + 1);
      const view = await alex.get(`/api/cases/${ids.jacket}/settlement`).expect(200);
      expect(view.body.approvals).toHaveLength(0); // Alex's approval was for the old terms
    }
  });

  it('a rejection ends the case with no payment', async () => {
    const { app } = makeFullApp(paypal);
    const { version } = await agreed(app);
    const jordan = await signIn(app, ids.jordan);
    const res = await jordan.post(`/api/cases/${ids.jacket}/settlement/reject`, { proposalVersion: version }).expect(200);
    expect(res.body.caseStatus).toBe('NO_AGREEMENT');
    expect(paypal.refundCalls).toHaveLength(0);
  });
});

describe('dashboard', () => {
  it('counts are computed from stored cases, scoped to the viewer', async () => {
    const { app } = makeFullApp(paypal);
    const jordan = await signIn(app, ids.jordan);
    const merchantView = await jordan.get('/api/dashboard/summary').expect(200);
    expect(merchantView.body.totalCases).toBe(2);
    const alex = await signIn(app, ids.alex);
    const buyerView = await alex.get('/api/dashboard/summary').expect(200);
    expect(buyerView.body.totalCases).toBe(1);
    const merchantCount = await db().select().from(merchants);
    expect(merchantCount).toHaveLength(1);
  });
});
