import { createSign } from 'node:crypto';
import { crc32 } from 'node:zlib';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetConfig } from '../src/config.js';
import { closeDb, db } from '../src/db/index.js';
import { cases, refundAttempts, transactions, webhookEvents } from '../src/db/schema.js';
import { subscribe } from '../src/audit.js';
import { assertCertCurrent } from '../src/paypal/webhook-verify.js';
import { fromPayPalValue, toPayPalValue } from '../src/money.js';
import {
  FakePayPal,
  approvedRefundCase,
  makeApp,
  makeFullApp,
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

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIICqjCCAZICCQDFNH/+0hOorzANBgkqhkiG9w0BAQsFADAXMRUwEwYDVQQDDAx3
ZWJob29rLXRlc3QwHhcNMjYxMTA5MTc0ODM1WhcNMzYxMTA2MTc0ODM1WjAXMRUw
EwYDVQQDDAx3ZWJob29rLXRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDVvf+8aT+GfY6lnlwjcaTZtixS+oztIvTdBIHu+ErAe2tkdhAQiSukM/mc
4THXVdiBPsbaKXcI4KSabcipcCdmefWgK3CLJT9XCSW8AzmoxjgmhoGYhasrmav9
0uecskaejsKS2WZWstp1h6+SKVXIF1hFPu8vzdFMPOUcIDX4aUXubClDengm5zJJ
WCdjHduQP73foe2ngyxwIZirhzvlo8sW6q/KGUQXUq1/RBTB4Y0XgMO93tkwMGGQ
KJAv1Gsuwruv7mntdEvYBGEgAgo7jbH3XYAa+M+jNHcgZPbZWGjhXViqGcsg6kgQ
zr7VGHhRqSX/JOSYsV24IrZSWVK1AgMBAAEwDQYJKoZIhvcNAQELBQADggEBAA5L
OEbvFQllKeFvRJB3Vl7/2oI5+UbKStFFBU/nlYzl27I7eh7pQkYc2k0+JoDNuGbx
iD+ba6zHyWynHu2SLCKblxqWgCM6nGAvfK3f1RznQZcPfZ4n180fubJGFahNKeXt
W6ygwg81fBfrWjwy4K/IPxIP1WK86NbZ5fCUIgXkp5ajLyNIMQTZX6IbsPO2oY0D
RMsYCdkPCNVSgaea9hkqEr5SXx2DG3q+8mn8euXLOyrATMp2H4dSmhLmGFuEv9xy
Wao3JiMv08+n3H+kzjoTfd3kgw5F7XVi1ExdfbcK+O8+Hgd/qmUwbly2anI0MELH
bK4yAKJNDRuMgbZ22Y0=
-----END CERTIFICATE-----`;

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

  async function deliver(app: Parameters<typeof request>[0], event: object) {
    const { raw, headers } = signed(event, 'WH-TEST');
    return request(app).post('/api/paypal/webhooks').set(headers).send(raw.toString('utf8'));
  }
  const statusOf = async (id: string) => (await db().query.cases.findFirst({ where: eq(cases.id, id) }))?.currentStatus;
  const useWebhook = () => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    resetConfig();
  };

  it('takes the outcome from PayPal, not from what the event claims', async () => {
    useWebhook();
    const { app, kase, refundId } = await pendingRefund();
    paypal.lookupStatus = 'PENDING';
    const res = await deliver(app, { id: 'WH-CLAIM', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId, status: 'COMPLETED' } });
    expect(res.body.result).toBe('processed');
    expect(await statusOf(kase.id)).toBe('PAYMENT_PROCESSING');
    paypal.lookupStatus = 'COMPLETED';
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('asks for redelivery when PayPal cannot confirm, then applies it', async () => {
    useWebhook();
    const { app, kase, refundId } = await pendingRefund();
    const event = { id: 'WH-RETRY', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId } };
    paypal.lookupFails = true;
    expect((await deliver(app, event)).status).toBe(503);
    expect(await statusOf(kase.id)).toBe('PAYMENT_PROCESSING');
    paypal.lookupFails = false;
    expect((await deliver(app, event)).body.result).toBe('processed');
    expect(await statusOf(kase.id)).toBe('RESOLVED');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('out-of-order and repeated events never move a refund backwards or pay twice', async () => {
    useWebhook();
    const { app, kase, txn, refundId } = await pendingRefund();
    await deliver(app, { id: 'WH-O1', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId } });
    paypal.lookupStatus = 'PENDING';
    await deliver(app, { id: 'WH-O2', event_type: 'PAYMENT.REFUND.PENDING', resource: { id: refundId } });
    paypal.lookupStatus = 'COMPLETED';
    await deliver(app, { id: 'WH-O3', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId } });
    expect(await statusOf(kase.id)).toBe('RESOLVED');
    const after = await db().query.transactions.findFirst({ where: eq(transactions.id, txn.id) });
    expect(after?.amountRefundedMinor).toBe(9000);
    expect(paypal.refundCalls).toHaveLength(1);
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('a failed refund reopens the case once and a late pending event changes nothing', async () => {
    useWebhook();
    const { app, kase, refundId } = await pendingRefund();
    paypal.lookupStatus = 'FAILED';
    await deliver(app, { id: 'WH-F1', event_type: 'PAYMENT.REFUND.FAILED', resource: { id: refundId } });
    const reopened = await statusOf(kase.id);
    expect(reopened).not.toBe('PAYMENT_PROCESSING');
    await deliver(app, { id: 'WH-F2', event_type: 'PAYMENT.REFUND.DENIED', resource: { id: refundId } });
    paypal.lookupStatus = 'PENDING';
    await deliver(app, { id: 'WH-F3', event_type: 'PAYMENT.REFUND.PENDING', resource: { id: refundId } });
    paypal.lookupStatus = 'COMPLETED';
    expect(await statusOf(kase.id)).toBe(reopened);
    const attempt = await db().query.refundAttempts.findFirst({ where: eq(refundAttempts.paypalRefundId, refundId) });
    expect(attempt?.status).toBe('FAILED');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('settles a refund whose PayPal response never reached the server', async () => {
    useWebhook();
    const made = await approvedRefundCase(people);
    paypal.refundMode = 'timeout';
    const { app } = makeApp(paypal, { getCert: async () => keys.publicKey });
    const merchant = await signIn(app, people.merchantUser.id);
    await merchant.post('/api/paypal/refunds/execute', { caseId: made.kase.id });
    const attempt = (await db().select().from(refundAttempts))[0]!;
    expect(attempt.paypalRefundId).toBeNull();
    const original = await paypal.refundCapture({ captureId: 'x', amountMinor: null, requestId: attempt.paypalRequestId });
    const invoice = `${made.kase.reference}-v${attempt.proposalId.slice(0, 8)}`;
    const res = await deliver(app, { id: 'WH-LOST', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: original.refundId, invoice_id: invoice } });
    expect(res.body.result).toBe('processed');
    expect(await statusOf(made.kase.id)).toBe('RESOLVED');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  const v2Refund = (id: string, captureId: string, overrides: object = {}) => ({
    id,
    status: 'COMPLETED',
    invoice_id: 'RA-1-v12345678',
    amount: { value: '90.00', currency_code: 'USD' },
    links: [
      { rel: 'self', method: 'GET', href: `https://api.sandbox.paypal.com/v2/payments/refunds/${id}` },
      { rel: 'up', method: 'GET', href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}` },
    ],
    ...overrides,
  });

  it.each(['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.REFUND.PENDING', 'PAYMENT.REFUND.FAILED', 'PAYMENT.REFUND.DENIED', 'PAYMENT.REFUND.CANCELLED'])(
    '%s with a refund resource resolves from the PayPal lookup and sends nothing',
    async (eventType) => {
      useWebhook();
      const { app, kase, txn, refundId } = await pendingRefund();
      const res = await deliver(app, { id: `WH-${eventType}`, event_type: eventType, resource: v2Refund(refundId, txn.paypalCaptureId as string) });
      expect(res.body.result).toBe('processed');
      expect(await statusOf(kase.id)).toBe('RESOLVED');
      expect(paypal.refundCalls).toHaveLength(1);
      delete process.env.PAYPAL_WEBHOOK_ID;
    },
  );

  it('PAYMENT.REFUND.COMPLETED, a non-referenced credit, changes nothing', async () => {
    useWebhook();
    const { app, kase, txn, refundId } = await pendingRefund();
    const res = await deliver(app, { id: 'WH-CREDIT', event_type: 'PAYMENT.REFUND.COMPLETED', resource: v2Refund(refundId, txn.paypalCaptureId as string) });
    expect(res.body.result).toBe('ignored');
    expect(await statusOf(kase.id)).toBe('PAYMENT_PROCESSING');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('an event naming the capture looks up our own refund, in either payload shape', async () => {
    useWebhook();
    const first = await pendingRefund();
    const capture = first.txn.paypalCaptureId as string;
    paypal.lookupStatus = 'PENDING';
    await deliver(first.app, { id: 'WH-CAP-V1', event_type: 'PAYMENT.REFUND.PENDING', resource: { id: 'V1REFUND', state: 'pending', sale_id: capture } });
    expect(await statusOf(first.kase.id)).toBe('PAYMENT_PROCESSING');
    paypal.lookupStatus = 'COMPLETED';
    const res = await deliver(first.app, { id: 'WH-CAP', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: capture, status: 'REFUNDED' } });
    expect(res.body.result).toBe('processed');
    expect(await statusOf(first.kase.id)).toBe('RESOLVED');
    expect(paypal.refundCalls).toHaveLength(1);
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it.each([
    ['amount', { amountMinor: 1 }],
    ['currency', { currency: 'EUR' }],
    ['missing amount', { amountMinor: null }],
    ['payment', { captureId: 'SOMEONEELSE' }],
    ['refund id', { refundId: 'OTHERREFUND' }],
  ])('never completes a refund when PayPal reports a different %s', async (_name, patch) => {
    useWebhook();
    const { app, kase, txn, refundId } = await pendingRefund();
    paypal.lookupPatch = patch;
    const res = await deliver(app, { id: 'WH-BAD', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: v2Refund(refundId, txn.paypalCaptureId as string) });
    paypal.lookupPatch = {};
    expect(res.status).toBe(200);
    expect(await statusOf(kase.id)).toBe('PAYMENT_PROCESSING');
    const after = await db().query.transactions.findFirst({ where: eq(transactions.id, txn.id) });
    expect(after?.amountRefundedMinor).toBe(0);
    const row = await db().query.webhookEvents.findFirst({ where: eq(webhookEvents.paypalEventId, 'WH-BAD') });
    expect(row?.processingStatus).toBe('REJECTED_MISMATCH');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('a completed refund cannot be moved back by a later lookup', async () => {
    useWebhook();
    const { app, kase, refundId } = await pendingRefund();
    await deliver(app, { id: 'WH-D1', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId } });
    paypal.lookupStatus = 'FAILED';
    await deliver(app, { id: 'WH-D2', event_type: 'PAYMENT.REFUND.FAILED', resource: { id: refundId } });
    paypal.lookupStatus = 'COMPLETED';
    expect(await statusOf(kase.id)).toBe('RESOLVED');
    expect((await db().query.refundAttempts.findFirst({ where: eq(refundAttempts.paypalRefundId, refundId) }))?.status).toBe('COMPLETED');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it.each([
    ['no resource', {}],
    ['a numeric id', { resource: { id: 12345 } }],
    ['an object id', { resource: { id: { a: 1 }, links: 'nope' } }],
    ['no id', { resource: { status: 'COMPLETED' } }],
  ])('a signed refund event with %s changes nothing', async (name, fields) => {
    useWebhook();
    const { app, kase } = await pendingRefund();
    const res = await deliver(app, { id: `WH-M-${name}`, event_type: 'PAYMENT.CAPTURE.REFUNDED', ...fields });
    expect(res.status).toBe(200);
    expect(await statusOf(kase.id)).toBe('PAYMENT_PROCESSING');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('malformed link and dispute fields do not break a signed event', async () => {
    useWebhook();
    const { app } = await pendingRefund();
    expect((await deliver(app, { id: 'WH-M5', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'NOTOURS', links: [null, 5], invoice_id: 7 } })).body.result).toBe('ignored');
    expect((await deliver(app, { id: 'WH-M6', event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { disputed_transactions: 'x' } })).body.result).toBe('ignored');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('ignores a verified refund that ResolveOS did not start', async () => {
    useWebhook();
    const { app } = await pendingRefund();
    const res = await deliver(app, { id: 'WH-OTHER', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'NOT-OURS' } });
    expect(res.body.result).toBe('ignored');
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('a PayPal dispute escalates the case and blocks the settlement', async () => {
    useWebhook();
    const made = await approvedRefundCase(people);
    const { app } = makeApp(paypal, { getCert: async () => keys.publicKey });
    await db().update(cases).set({ currentStatus: 'AWAITING_APPROVAL' }).where(eq(cases.id, made.kase.id));
    const res = await deliver(app, {
      id: 'WH-DISPUTE',
      event_type: 'CUSTOMER.DISPUTE.CREATED',
      resource: { dispute_id: 'PP-D-1', disputed_transactions: [{ seller_transaction_id: made.txn.paypalCaptureId }] },
    });
    expect(res.body.result).toBe('processed');
    expect(await statusOf(made.kase.id)).toBe('ESCALATED');
    const merchant = await signIn(app, people.merchantUser.id);
    await merchant.post('/api/paypal/refunds/execute', { caseId: made.kase.id }).expect(409);
    expect(paypal.refundCalls).toHaveLength(0);
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('streams a confirmed refund to a connected browser', async () => {
    useWebhook();
    const { app, kase, refundId } = await pendingRefund();
    const server = makeFullApp(paypal).app.listen(0);
    const base = `http://localhost:${(server.address() as { port: number }).port}/api`;
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: people.buyer.id }),
    });
    const abort = new AbortController();
    const stream = await fetch(`${base}/cases/${kase.id}/events`, {
      headers: { cookie: login.headers.get('set-cookie')!.split(';')[0]! },
      signal: abort.signal,
    });
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const reader = stream.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    const until = async (needle: string) => {
      while (!text.includes(needle)) text += (await reader.read()).value ?? '';
    };
    await until('event: ready');
    await deliver(app, { id: 'WH-SSE', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId } });
    await until('case.resolved');
    expect(text).toContain('refund.completed');
    abort.abort();
    server.closeAllConnections();
    server.close();
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('publishes a confirmed refund to live listeners', async () => {
    useWebhook();
    const { app, kase, refundId } = await pendingRefund();
    const seen: string[] = [];
    const stop = subscribe(kase.id, (record) => seen.push(record.action));
    await deliver(app, { id: 'WH-LIVE', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: refundId } });
    stop();
    expect(seen).toEqual(expect.arrayContaining(['refund.completed', 'case.resolved']));
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('the sweep settles a pending refund when no webhook arrives, without sending anything', async () => {
    const { kase, refundId } = await pendingRefund();
    const { payments } = makeApp(paypal, {});
    paypal.lookupStatus = 'PENDING';
    await payments.sweepPendingRefunds();
    expect(await statusOf(kase.id)).toBe('PAYMENT_PROCESSING');
    paypal.lookupStatus = 'COMPLETED';
    await payments.sweepPendingRefunds();
    expect(await statusOf(kase.id)).toBe('RESOLVED');
    expect(paypal.refundCalls).toHaveLength(1);
    expect(refundId).toBeTruthy();
  });

  it('keeps only identifiers from an unverified delivery', async () => {
    useWebhook();
    const { app } = await pendingRefund();
    const { raw, headers } = signed({ id: 'WH-BIG', event_type: 'X', resource: { id: 'y', filler: 'z'.repeat(5000) } }, 'WH-TEST', signingKeys().privateKey);
    await request(app).post('/api/paypal/webhooks').set(headers).send(raw.toString('utf8')).expect(400);
    const row = (await db().select().from(webhookEvents)).find((e) => e.processingStatus === 'QUARANTINED');
    expect(JSON.stringify(row?.payload).length).toBeLessThan(200);
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('refuses an event id that is not text', async () => {
    useWebhook();
    const { app } = await pendingRefund();
    const res = await deliver(app, { id: { a: 1 }, event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'x' } });
    expect(res.status).toBe(400);
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  it('refuses a certificate outside its validity dates, or text that is not one', () => {
    expect(assertCertCurrent(TEST_CERT)).toBe(TEST_CERT);
    expect(() => assertCertCurrent(TEST_CERT, Date.parse('2100-01-01'))).toThrow();
    expect(() => assertCertCurrent('not a certificate')).toThrow();
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
