import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import request from 'supertest';

import { type AppDeps, createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import {
  approvals,
  cases,
  merchants,
  settlementProposals,
  transactions,
  users,
} from '../src/db/schema.js';
import { type PayPalGateway } from "../src/paypal/client.js";
import { termsHash } from '../src/settlement/terms.js';

export { FakePayPal } from "../src/paypal/fake.js";

export async function resetDatabase(): Promise<void> {
  await runMigrations();
  await db().execute(sql`
    TRUNCATE audit_events, webhook_events, refund_attempts, approvals, settlement_proposals,
      negotiation_turns, evidence, cases, transactions, merchants, sessions, users CASCADE`);
}

export async function seedPeople() {
  const database = db();
  const [buyer, merchantUser, operator, otherBuyer] = await database
    .insert(users)
    .values([
      { name: 'Alex Morgan', email: 'alex@buyer.test', role: 'BUYER' },
      { name: 'Jordan Lee', email: 'jordan@northline.test', role: 'MERCHANT' },
      { name: 'Demo Operator', email: 'ops@resolve.test', role: 'OPERATOR' },
      { name: 'Sam Other', email: 'sam@buyer.test', role: 'BUYER' },
    ])
    .returning();
  const [merchant] = await database
    .insert(merchants)
    .values({
      ownerUserId: merchantUser!.id,
      businessName: 'Northline Studio',
      refundPolicy: 'Refunds within 30 days; partial refunds for delivery disputes.',
      defaultRefundLimitMinor: 18000,
      currency: 'USD',
    })
    .returning();
  return { buyer: buyer!, merchantUser: merchantUser!, operator: operator!, otherBuyer: otherBuyer!, merchant: merchant! };
}

export function makeApp(paypal: PayPalGateway, extra: Partial<AppDeps> = {}) {
  return createApp({ database: db(), paypal, ...extra });
}

/** A signed-in supertest agent with the session's CSRF token attached to writes. */
export async function signIn(app: Parameters<typeof request.agent>[0], userId: string) {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ userId }).expect(200);
  const csrf = login.body.csrfToken as string;
  return {
    agent,
    csrf,
    post: (path: string, body?: object) => agent.post(path).set('X-CSRF-Token', csrf).send(body ?? {}),
    get: (path: string) => agent.get(path),
    patch: (path: string) => agent.patch(path),
  };
}

/** A real (fake-PayPal) captured transaction, a case on it, and an approved proposal. */
export async function approvedRefundCase(
  people: Awaited<ReturnType<typeof seedPeople>>,
  options: {
    captureId?: string | null;
    sourceType?: 'PAYPAL_SANDBOX' | 'DEMO_SEED';
    refundMinor?: number;
    approve?: ('BUYER' | 'MERCHANT')[];
    tamperHash?: boolean;
  } = {},
) {
  const database = db();
  const sourceType = options.sourceType ?? 'PAYPAL_SANDBOX';
  const [txn] = await database
    .insert(transactions)
    .values({
      merchantId: people.merchant.id,
      buyerId: people.buyer.id,
      description: 'Everyday Jacket',
      paypalOrderId: sourceType === 'PAYPAL_SANDBOX' ? `ORD-${randomUUID().slice(0, 8)}` : null,
      paypalCaptureId:
        sourceType === 'PAYPAL_SANDBOX' ? (options.captureId ?? `CAP-${randomUUID().slice(0, 8)}`) : null,
      originalAmountMinor: 18000,
      currency: 'USD',
      paymentStatus: 'CAPTURED',
      sourceType,
    })
    .returning();
  const [kase] = await database
    .insert(cases)
    .values({
      reference: `RA-${randomUUID().slice(0, 6)}`,
      transactionId: txn!.id,
      buyerId: people.buyer.id,
      merchantId: people.merchant.id,
      category: 'ITEM_NOT_RECEIVED',
      title: 'Jacket never arrived',
      description: 'Tracking says delivered; buyer did not receive it.',
      buyerDesiredOutcome: 'A refund',
      buyerFloorMinor: 9000,
      merchantPreference: 'Avoid a full refund but keep the customer',
      merchantMaxRefundMinor: 18000,
      currentStatus: 'AWAITING_APPROVAL',
      sourceType,
    })
    .returning();
  const refundMinor = options.refundMinor ?? 9000;
  const type = refundMinor === 18000 ? 'FULL_REFUND' : 'PARTIAL_REFUND';
  const hash = termsHash({
    caseId: kase!.id,
    proposalVersion: 1,
    settlementType: type,
    refundAmountMinor: refundMinor,
    currency: 'USD',
  });
  const approve = options.approve ?? ['BUYER', 'MERCHANT'];
  const [proposal] = await database
    .insert(settlementProposals)
    .values({
      caseId: kase!.id,
      proposalVersion: 1,
      settlementType: type,
      refundAmountMinor: refundMinor,
      currency: 'USD',
      summary: 'Partial refund',
      termsHash: options.tamperHash ? 'tampered' : hash,
      currentStatus: approve.length === 2 ? 'APPROVED' : 'PENDING_APPROVAL',
    })
    .returning();
  for (const role of approve) {
    await database.insert(approvals).values({
      proposalId: proposal!.id,
      approverUserId: role === 'BUYER' ? people.buyer.id : people.merchantUser.id,
      role,
      decision: 'APPROVE',
      approvedTermsHash: hash,
    });
  }
  return { txn: txn!, kase: kase!, proposal: proposal! };
}

/** An RSA key pair standing in for PayPal's signing certificate. */
export function signingKeys() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

// ── Full app (cases, negotiation, settlement) ─────────────────────────────

import { DemoEngine, type TurnEngine } from '../src/negotiation/engines.js';
import { Orchestrator } from '../src/negotiation/orchestrator.js';
import { registerCaseRoutes } from '../src/routes/cases.js';
import { SettlementService } from '../src/settlement/service.js';

/** An engine that returns scripted raw answers (or throws), for testing the orchestrator's gates. */
export class ScriptedEngine implements TurnEngine {
  readonly kind = 'live' as const;
  readonly model = 'scripted-test-model';
  calls = 0;
  constructor(private readonly answers: (string | Error)[]) {}
  async produce(): Promise<string> {
    const next = this.answers[Math.min(this.calls, this.answers.length - 1)];
    this.calls += 1;
    if (next instanceof Error) throw next;
    return next as string;
  }
}

export function makeFullApp(paypal: PayPalGateway, live: TurnEngine | null = null) {
  const database = db();
  return createApp({
    database,
    paypal,
    extend: (app, { payments }) =>
      registerCaseRoutes(app, {
        database,
        paypal,
        payments,
        orchestrator: new Orchestrator(database, { live, demo: new DemoEngine() }),
        settlements: new SettlementService(database, payments),
      }),
  });
}
