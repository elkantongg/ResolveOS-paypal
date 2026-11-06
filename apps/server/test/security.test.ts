import { createSign } from 'node:crypto';
import { crc32 } from 'node:zlib';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetConfig } from '../src/config.js';
import { closeDb, db } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { cases, negotiationTurns, refundAttempts, transactions, users } from '../src/db/schema.js';
import { DEMO, resetDemoData } from '../src/db/seed.js';
import { FakePayPal, ScriptedEngine, approvedRefundCase, makeApp, makeFullApp, resetDatabase, seedPeople, signIn, signingKeys } from './helpers.js';

afterAll(async () => {
  await closeDb();
});

describe('webhook races', () => {
  let people: Awaited<ReturnType<typeof seedPeople>>;
  beforeEach(async () => {
    resetConfig();
    await resetDatabase();
    people = await seedPeople();
  });

  it('the same verified refund event delivered concurrently is applied exactly once', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-RACE';
    resetConfig();
    const keys = signingKeys();
    const paypal = new FakePayPal();
    const { kase, txn } = await approvedRefundCase(people);
    paypal.refundMode = 'pending';
    const { app } = makeApp(paypal, { getCert: async () => keys.publicKey });
    const merchant = await signIn(app, people.merchantUser.id);
    const refund = await merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(200);
    const raw = JSON.stringify({ id: 'WH-RACE-1', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refund.body.refund.paypalRefundId, status: 'COMPLETED' } });
    const send = () => {
      const id = `t-${Math.random()}`;
      const time = new Date().toISOString();
      const signer = createSign('SHA256');
      signer.update(`${id}|${time}|WH-RACE|${crc32(Buffer.from(raw))}`);
      return request(app)
        .post('/api/paypal/webhooks')
        .set({
          'paypal-transmission-id': id,
          'paypal-transmission-time': time,
          'paypal-transmission-sig': signer.sign(keys.privateKey, 'base64'),
          'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/C',
          'content-type': 'application/json',
        })
        .send(raw);
    };
    const responses = await Promise.all([send(), send(), send()]);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    const after = await db().query.transactions.findFirst({ where: eq(transactions.id, txn.id) });
    expect(after?.amountRefundedMinor).toBe(9000); // once, not 3 × 9000
    delete process.env.PAYPAL_WEBHOOK_ID;
  });
});

describe('concurrency and cross-user access on cases', () => {
  let ids: { alex: string; priya: string; jordan: string; operator: string; jacket: string };
  const idOf = async (email: string) => (await db().query.users.findFirst({ where: eq(users.email, email) }))!.id;

  beforeEach(async () => {
    resetConfig();
    await runMigrations();
    await resetDemoData(db());
    ids = {
      alex: await idOf(DEMO.buyer.email),
      priya: await idOf(DEMO.secondBuyer.email),
      jordan: await idOf(DEMO.merchant.email),
      operator: await idOf(DEMO.operator.email),
      jacket: (await db().query.cases.findFirst({ where: eq(cases.reference, 'RA-1042') }))!.id,
    };
  });

  it('two simultaneous "next turn" requests record exactly one turn', async () => {
    const answer = JSON.stringify({
      reasoningSummary: 'Delivery recorded (EV-2), no signature.',
      evidenceReferences: ['EV-2'],
      uncertainties: [],
      proposedAction: 'FULL_REFUND',
      proposedRefundMinorUnits: 18000,
      currency: 'USD',
      publicMessage: 'We ask for a full refund.',
      acceptsCounterpartOffer: false,
      requiresHumanReview: false,
    });
    const { app } = makeFullApp(new FakePayPal(), new ScriptedEngine([answer]));
    const alex = await signIn(app, ids.alex);
    await db().update(cases).set({ currentStatus: 'IN_NEGOTIATION', negotiationMode: 'live' }).where(eq(cases.id, ids.jacket));
    const [a, b] = await Promise.all([
      alex.post(`/api/cases/${ids.jacket}/negotiate/advance`),
      alex.post(`/api/cases/${ids.jacket}/negotiate/advance`),
    ]);
    expect([a!.status, b!.status].sort()).toEqual([200, 409]);
    const turns = await db().select().from(negotiationTurns).where(eq(negotiationTurns.caseId, ids.jacket));
    expect(turns).toHaveLength(1);
  });

  it('settlement terms cannot be changed once negotiation has started', async () => {
    const { app } = makeFullApp(new FakePayPal());
    const jordan = await signIn(app, ids.jordan);
    const alex = await signIn(app, ids.alex);
    await alex.post(`/api/cases/${ids.jacket}/negotiate/start`, { mode: 'demo' }).expect(200);
    const res = await jordan.patch(`/api/cases/${ids.jacket}/merchant-terms`).set('X-CSRF-Token', jordan.csrf).send({ maxRefundMinor: 18000, preference: 'x x x' }).expect(409);
    expect(res.body.error.code).toBe('terms_locked');
  });

  it('a different buyer cannot read or act on someone else’s case anywhere', async () => {
    const { app } = makeFullApp(new FakePayPal());
    const priya = await signIn(app, ids.priya);
    for (const path of ['', '/settlement', '/receipt', '/negotiate/history', '/events']) {
      await priya.get(`/api/cases/${ids.jacket}${path}`).expect(404);
    }
    await priya.post(`/api/cases/${ids.jacket}/evidence`, { evidenceType: 'OTHER', title: 'spoof', content: 'spoofed evidence' }).expect(404);
    await priya.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: 1 }).expect(404);
    await priya.post('/api/paypal/refunds/execute', { caseId: ids.jacket }).expect(404);
  });

  it('roles are enforced: a buyer cannot set merchant limits, the operator cannot add evidence or approve', async () => {
    const { app } = makeFullApp(new FakePayPal());
    const alex = await signIn(app, ids.alex);
    await alex.patch(`/api/cases/${ids.jacket}/merchant-terms`).set('X-CSRF-Token', alex.csrf).send({ maxRefundMinor: 18000, preference: 'mine now' }).expect(403);
    const operator = await signIn(app, ids.operator);
    await operator.post(`/api/cases/${ids.jacket}/evidence`, { evidenceType: 'OTHER', title: 'x x x', content: 'operator text' }).expect(403);
    await operator.post(`/api/cases/${ids.jacket}/settlement/approve`, { proposalVersion: 1 }).expect(403);
    expect(await db().select().from(refundAttempts)).toHaveLength(0);
  });
});
