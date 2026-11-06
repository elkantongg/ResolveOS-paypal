import { createSign } from 'node:crypto';
import { crc32 } from 'node:zlib';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetConfig } from '../src/config.js';
import { closeDb, db } from '../src/db/index.js';
import { cases, refundAttempts, transactions, webhookEvents } from '../src/db/schema.js';
import { fromPayPalValue, toPayPalValue } from '../src/money.js';
import {
  FakePayPal,
  approvedRefundCase,
  makeApp,
  resetDatabase,
  seedPeople,
  signIn,
  signingKeys,
} from './helpers.js';

let people: Awaited<ReturnType<typeof seedPeople>>;
let paypal: FakePayPal;

beforeEach(async () => {
  resetConfig();
  await resetDatabase();
  people = await seedPeople();
  paypal = new FakePayPal();
});

afterAll(async () => {
  await closeDb();
});

describe('money', () => {
  it('converts minor units to PayPal strings and back without floating point', () => {
    expect(toPayPalValue(18000, 'USD')).toBe('180.00');
    expect(toPayPalValue(5, 'USD')).toBe('0.05');
    expect(toPayPalValue(500, 'JPY')).toBe('500');
    expect(fromPayPalValue('90.10', 'USD')).toBe(9010);
    expect(fromPayPalValue('0.1', 'USD')).toBe(10);
    expect(() => fromPayPalValue('1.234', 'USD')).toThrow();
    expect(() => toPayPalValue(1.5, 'USD')).toThrow();
  });
});

describe('sandbox purchase', () => {
  it('creates an order and stores the capture id and amount PayPal returned', async () => {
    const { app } = makeApp(paypal);
    const buyer = await signIn(app, people.buyer.id);
    const order = await buyer
      .post('/api/paypal/orders', {
        merchantId: people.merchant.id,
        amountMinor: 18000,
        currency: 'USD',
        description: 'Everyday Jacket',
      })
      .expect(201);
    const captured = await buyer.post(`/api/paypal/orders/${order.body.orderId}/capture`).expect(200);
    expect(captured.body.transaction.paymentStatus).toBe('CAPTURED');
    expect(captured.body.transaction.paypalCaptureId).toMatch(/^CAP/);
    expect(captured.body.transaction.sourceType).toBe('PAYPAL_SANDBOX');
    // Capturing again is idempotent.
    await buyer.post(`/api/paypal/orders/${order.body.orderId}/capture`).expect(200);
  });

  it('refuses payments when PayPal is not configured, rather than pretending', async () => {
    paypal.configured = false;
    const { app } = makeApp(paypal);
    const buyer = await signIn(app, people.buyer.id);
    const res = await buyer
      .post('/api/paypal/orders', {
        merchantId: people.merchant.id,
        amountMinor: 18000,
        currency: 'USD',
        description: 'Everyday Jacket',
      })
      .expect(503);
    expect(res.body.error.code).toBe('paypal_not_configured');
  });

  it('only a buyer can purchase, and another buyer cannot capture someone else’s order', async () => {
    const { app } = makeApp(paypal);
    const merchant = await signIn(app, people.merchantUser.id);
    await merchant
      .post('/api/paypal/orders', { merchantId: people.merchant.id, amountMinor: 18000, currency: 'USD', description: 'x x x' })
      .expect(403);
    const buyer = await signIn(app, people.buyer.id);
    const order = await buyer
      .post('/api/paypal/orders', { merchantId: people.merchant.id, amountMinor: 18000, currency: 'USD', description: 'Jacket' })
      .expect(201);
    const other = await signIn(app, people.otherBuyer.id);
    await other.post(`/api/paypal/orders/${order.body.orderId}/capture`).expect(404);
  });
});

describe('approved refund', () => {
  it('refunds exactly the approved amount once, resolves the case and updates the payment', async () => {
    const { kase, txn } = await approvedRefundCase(people);
    const { app } = makeApp(paypal);
    const merchant = await signIn(app, people.merchantUser.id);
    const res = await merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(200);
    expect(res.body.refund.status).toBe('COMPLETED');
    expect(res.body.refund.paypalRefundId).toMatch(/^REF/);
    expect(paypal.refundCalls).toHaveLength(1);
    expect(paypal.refundCalls[0]).toMatchObject({ captureId: txn.paypalCaptureId, amountMinor: 9000 });
    const after = await db().query.transactions.findFirst({ where: eq(transactions.id, txn.id) });
    expect(after).toMatchObject({ amountRefundedMinor: 9000, paymentStatus: 'PARTIALLY_REFUNDED' });
    const kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).toBe('RESOLVED');
  });

  it('sends a full refund with no amount (PayPal’s full-refund semantics)', async () => {
    const { kase } = await approvedRefundCase(people, { refundMinor: 18000 });
    const { app } = makeApp(paypal);
    const buyer = await signIn(app, people.buyer.id);
    await buyer.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(200);
    expect(paypal.refundCalls[0]?.amountMinor).toBeNull();
  });

  it('never refunds twice when the button is pressed repeatedly and concurrently', async () => {
    const { kase, txn } = await approvedRefundCase(people);
    const { app } = makeApp(paypal);
    const merchant = await signIn(app, people.merchantUser.id);
    const buyer = await signIn(app, people.buyer.id);
    await Promise.all([
      merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }),
      merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }),
      buyer.post('/api/paypal/refunds/execute', { caseId: kase.id }),
    ]);
    await merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(200);
    expect(paypal.refundCalls).toHaveLength(1);
    const attempts = await db().select().from(refundAttempts);
    expect(attempts).toHaveLength(1);
    const after = await db().query.transactions.findFirst({ where: eq(transactions.id, txn.id) });
    expect(after?.amountRefundedMinor).toBe(9000);
  });

  it('refuses without both approvals of this exact version', async () => {
    const { kase } = await approvedRefundCase(people, { approve: ['BUYER'] });
    const { app } = makeApp(paypal);
    const buyer = await signIn(app, people.buyer.id);
    const res = await buyer.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(409);
    expect(res.body.error.code).toBe('not_approved');
    expect(paypal.refundCalls).toHaveLength(0);
  });

  it('refuses when the stored terms no longer match what was approved', async () => {
    const { kase } = await approvedRefundCase(people, { tamperHash: true });
    const { app } = makeApp(paypal);
    const buyer = await signIn(app, people.buyer.id);
    const res = await buyer.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(409);
    expect(res.body.error.code).toBe('terms_tampered');
  });

  it('never runs a refund on seeded demo data', async () => {
    const { kase } = await approvedRefundCase(people, { sourceType: 'DEMO_SEED' });
    const { app } = makeApp(paypal);
    const buyer = await signIn(app, people.buyer.id);
    const res = await buyer.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(409);
    expect(res.body.error.code).toBe('not_a_real_capture');
    expect(paypal.refundCalls).toHaveLength(0);
  });

  it('refuses more than is still refundable', async () => {
    const { kase, txn } = await approvedRefundCase(people);
    await db().update(transactions).set({ amountRefundedMinor: 15000, paymentStatus: 'PARTIALLY_REFUNDED' }).where(eq(transactions.id, txn.id));
    const { app } = makeApp(paypal);
    const buyer = await signIn(app, people.buyer.id);
    const res = await buyer.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(409);
    expect(res.body.error.code).toBe('amount_exceeds_refundable');
  });

  it('does not accept an amount or capture id from the caller', async () => {
    const { kase } = await approvedRefundCase(people);
    const { app } = makeApp(paypal);
    const buyer = await signIn(app, people.buyer.id);
    await buyer
      .post('/api/paypal/refunds/execute', { caseId: kase.id, amountMinor: 18000, captureId: 'X' })
      .expect(400);
    expect(paypal.refundCalls).toHaveLength(0);
  });

  it('a stranger cannot refund someone else’s case, and the operator cannot either', async () => {
    const { kase } = await approvedRefundCase(people);
    const { app } = makeApp(paypal);
    const other = await signIn(app, people.otherBuyer.id);
    await other.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(404);
    const operator = await signIn(app, people.operator.id);
    await operator.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(403);
    expect(paypal.refundCalls).toHaveLength(0);
  });

  it('a timeout is "unknown", and reconciling reuses the same request id (no second refund)', async () => {
    const { kase, txn } = await approvedRefundCase(people);
    paypal.refundMode = 'timeout';
    const { app } = makeApp(paypal);
    const merchant = await signIn(app, people.merchantUser.id);
    const first = await merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(200);
    expect(first.body.refund.status).toBe('UNKNOWN_REQUIRES_RECONCILIATION');
    let after = await db().query.transactions.findFirst({ where: eq(transactions.id, txn.id) });
    expect(after?.amountRefundedMinor).toBe(0);

    const second = await merchant.post('/api/paypal/refunds/reconcile', { caseId: kase.id }).expect(200);
    expect(second.body.refund.status).toBe('COMPLETED');
    expect(paypal.refundCalls).toHaveLength(2);
    expect(paypal.refundCalls[0]?.requestId).toBe(paypal.refundCalls[1]?.requestId);
    after = await db().query.transactions.findFirst({ where: eq(transactions.id, txn.id) });
    expect(after?.amountRefundedMinor).toBe(9000);
  });

  it('a PayPal refusal is a failure, shown with PayPal’s reason', async () => {
    const { kase } = await approvedRefundCase(people);
    paypal.refundMode = 'rejected';
    const { app } = makeApp(paypal);
    const merchant = await signIn(app, people.merchantUser.id);
    const res = await merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(200);
    expect(res.body.refund.status).toBe('FAILED');
    expect(res.body.refund.errorMessage).toContain('REFUND_AMOUNT_EXCEEDED');
    const kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).not.toBe('RESOLVED');
  });

  it('after PayPal refuses a refund, the case reopens for a new agreement instead of getting stuck', async () => {
    const { kase } = await approvedRefundCase(people);
    paypal.refundMode = 'rejected';
    const { app } = makeApp(paypal);
    const merchant = await signIn(app, people.merchantUser.id);
    await merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(200);
    const kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).toBe('IN_NEGOTIATION');
    expect(kaseAfter?.revisionNotes.join(' ')).toContain('REFUND_AMOUNT_EXCEEDED');
    expect(kaseAfter?.outcomeSummary).toContain('No money moved');
  });

  it('a pending refund leaves the case unresolved until PayPal confirms it', async () => {
    const { kase } = await approvedRefundCase(people);
    paypal.refundMode = 'pending';
    const { app } = makeApp(paypal);
    const merchant = await signIn(app, people.merchantUser.id);
    const res = await merchant.post('/api/paypal/refunds/execute', { caseId: kase.id }).expect(200);
    expect(res.body.refund.status).toBe('PENDING');
    let kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).toBe('PAYMENT_PROCESSING');
    await merchant.post('/api/paypal/refunds/reconcile', { caseId: kase.id }).expect(200);
    kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).toBe('RESOLVED');
  });
});

describe('sessions', () => {
  it('rejects a write without the CSRF token', async () => {
    const { kase } = await approvedRefundCase(people);
    const { app } = makeApp(paypal);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ userId: people.merchantUser.id }).expect(200);
    const res = await agent.post('/api/paypal/refunds/execute').send({ caseId: kase.id }).expect(403);
    expect(res.body.error.code).toBe('csrf_failed');
  });

  it('rejects unauthenticated requests', async () => {
    const { app } = makeApp(paypal);
    await request(app).get('/api/auth/me').expect(401);
    await request(app).post('/api/paypal/refunds/execute').send({ caseId: people.buyer.id }).expect(401);
  });
});

describe('webhooks', () => {
  const keys = signingKeys();
  const certUrl = 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1';

  function signed(body: object, webhookId: string, privateKey = keys.privateKey) {
    const raw = Buffer.from(JSON.stringify(body));
    const id = `tx-${Math.random()}`;
    const time = new Date().toISOString();
    const signer = createSign('SHA256');
    signer.update(`${id}|${time}|${webhookId}|${crc32(raw)}`);
    return {
      raw,
      headers: {
        'paypal-transmission-id': id,
        'paypal-transmission-time': time,
        'paypal-transmission-sig': signer.sign(privateKey, 'base64'),
        'paypal-cert-url': certUrl,
        'paypal-auth-algo': 'SHA256withRSA',
        'content-type': 'application/json',
      },
    };
  }

  async function pendingRefund() {
    const made = await approvedRefundCase(people);
    paypal.refundMode = 'pending';
    const { app } = makeApp(paypal, { getCert: async () => keys.publicKey });
    const merchant = await signIn(app, people.merchantUser.id);
    const res = await merchant.post('/api/paypal/refunds/execute', { caseId: made.kase.id }).expect(200);
    return { ...made, app, refundId: res.body.refund.paypalRefundId as string };
  }

  it('applies a verified refund webhook once and acknowledges redelivery', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    resetConfig();
    const { app, kase, refundId } = await pendingRefund();
    const event = {
      id: 'WH-EVT-1',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: refundId, status: 'COMPLETED', amount: { value: '90.00', currency_code: 'USD' } },
    };
    const { raw, headers } = signed(event, 'WH-TEST');
    const first = await request(app).post('/api/paypal/webhooks').set(headers).send(raw.toString('utf8')).expect(200);
    expect(first.body.result).toBe('processed');
    const again = await request(app).post('/api/paypal/webhooks').set(headers).send(raw.toString('utf8')).expect(200);
    expect(again.body.result).toBe('duplicate');
    const kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).toBe('RESOLVED');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('quarantines a webhook with a bad signature and changes nothing', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    resetConfig();
    const { app, kase, refundId } = await pendingRefund();
    const forger = signingKeys();
    const event = { id: 'WH-EVT-2', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId, status: 'COMPLETED' } };
    const { raw, headers } = signed(event, 'WH-TEST', forger.privateKey);
    const res = await request(app).post('/api/paypal/webhooks').set(headers).send(raw.toString('utf8')).expect(400);
    expect(res.body.result).toBe('unverified');
    // Not stored under the id it claimed (so it cannot block the real event), but kept for inspection.
    expect(await db().query.webhookEvents.findFirst({ where: eq(webhookEvents.paypalEventId, 'WH-EVT-2') })).toBeUndefined();
    const quarantined = (await db().select().from(webhookEvents)).filter((e) => e.processingStatus === 'QUARANTINED');
    expect(quarantined.map((e) => (e.payload as { claimedEventId?: string }).claimedEventId)).toContain('WH-EVT-2');
    const kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).toBe('PAYMENT_PROCESSING');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('refuses a certificate URL that is not PayPal’s', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    resetConfig();
    const { app } = await pendingRefund();
    const { raw, headers } = signed({ id: 'WH-EVT-3', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'x' } }, 'WH-TEST');
    headers['paypal-cert-url'] = 'https://evil.example.com/cert.pem';
    const res = await request(app).post('/api/paypal/webhooks').set(headers).send(raw.toString('utf8')).expect(400);
    expect(res.body.result).toBe('unverified');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('a forged event cannot squat a real event id and block the genuine delivery', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    resetConfig();
    const { app, kase, refundId } = await pendingRefund();
    const event = { id: 'WH-EVT-SQUAT', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId, status: 'COMPLETED' } };
    const forged = signed(event, 'WH-TEST', signingKeys().privateKey);
    await request(app).post('/api/paypal/webhooks').set(forged.headers).send(forged.raw.toString('utf8')).expect(400);
    const real = signed(event, 'WH-TEST');
    const res = await request(app).post('/api/paypal/webhooks').set(real.headers).send(real.raw.toString('utf8')).expect(200);
    expect(res.body.result).toBe('processed');
    const kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).toBe('RESOLVED');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('a verified event whose processing never finished is processed on redelivery', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    resetConfig();
    const { app, kase, refundId } = await pendingRefund();
    const event = { id: 'WH-EVT-CRASH', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId, status: 'COMPLETED' } };
    // As if the server crashed after recording the event but before applying it.
    await db().insert(webhookEvents).values({ paypalEventId: event.id, eventType: event.event_type, resourceId: refundId, verificationStatus: 'VERIFIED', processingStatus: 'RECEIVED', payload: event });
    const { raw, headers } = signed(event, 'WH-TEST');
    const res = await request(app).post('/api/paypal/webhooks').set(headers).send(raw.toString('utf8')).expect(200);
    expect(res.body.result).toBe('processed');
    const kaseAfter = await db().query.cases.findFirst({ where: eq(cases.id, kase.id) });
    expect(kaseAfter?.currentStatus).toBe('RESOLVED');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });
});
