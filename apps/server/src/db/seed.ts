import { eq, sql } from 'drizzle-orm';

import { isMain } from '../is-main.js';
import { closeDb, db, type Db } from './index.js';
import { runMigrations } from './migrate.js';
import { auditEvents, cases, evidence, merchants, transactions, users } from './schema.js';

/**
 * Demo people and two seeded cases. Everything seeded is `DEMO_SEED`: it can be explored and
 * negotiated, but it carries no PayPal ids, so no refund can ever run on it. A real refund needs
 * a real sandbox purchase (Dashboard → "Create sandbox transaction").
 */

export const DEMO = {
  buyer: { name: 'Alex Morgan', email: 'alex.morgan@demo.resolve' },
  secondBuyer: { name: 'Priya Nair', email: 'priya.nair@demo.resolve' },
  merchant: { name: 'Jordan Ellis', email: 'jordan@northline.demo.resolve' },
  operator: { name: 'Demo Operator', email: 'operator@demo.resolve' },
} as const;

export const JACKET_EVIDENCE = {
  tracking: {
    sourceParty: 'MERCHANT' as const,
    evidenceType: 'TRACKING',
    title: 'Carrier tracking TRK-102',
    content:
      'Carrier: Parcelline. Tracking TRK-102. Status: Delivered, 28 Oct, 14:12, "left at front door". No recipient signature was requested or captured. No delivery photo.',
    verificationStatus: 'PARTY_PROVIDED' as const,
  },
  orderRecord: {
    sourceParty: 'MERCHANT' as const,
    evidenceType: 'ORDER_RECORD',
    title: 'Order record NS-4471',
    content:
      'Everyday Jacket, size M, charcoal. Shipped 25 Oct to the address on the order. Packed by J. Ellis. Ship-to address matches the buyer’s PayPal shipping address.',
    verificationStatus: 'PARTY_PROVIDED' as const,
  },
  policy: {
    sourceParty: 'MERCHANT' as const,
    evidenceType: 'REFUND_POLICY',
    title: 'Northline refund policy',
    content:
      'Refunds within 30 days of delivery. For items marked delivered but reported missing, we offer a partial refund or a replacement after the buyer has checked with neighbours and building reception.',
    verificationStatus: 'PARTY_PROVIDED' as const,
  },
  complaint: {
    sourceParty: 'BUYER' as const,
    evidenceType: 'COMPLAINT',
    title: 'Buyer statement',
    content:
      'I was home most of 28 Oct and never saw a parcel. I checked with two neighbours and the building’s mailroom; nobody has it. I would like a full refund, but I would accept a fair partial refund since I like the shop.',
    verificationStatus: 'PARTY_PROVIDED' as const,
  },
};

export async function seedDemo(database: Db): Promise<void> {
  await database.execute(sql`
    TRUNCATE audit_events, webhook_events, refund_attempts, approvals, settlement_proposals,
      negotiation_turns, evidence, cases, transactions, merchants, sessions, users CASCADE`);

  const [alex, priya, jordan] = await database
    .insert(users)
    .values([
      { ...DEMO.buyer, role: 'BUYER' },
      { ...DEMO.secondBuyer, role: 'BUYER' },
      { ...DEMO.merchant, role: 'MERCHANT' },
      { ...DEMO.operator, role: 'OPERATOR' },
    ])
    .returning();
  if (!alex || !priya || !jordan) throw new Error('seed users failed');

  const [northline] = await database
    .insert(merchants)
    .values({
      ownerUserId: jordan.id,
      businessName: 'Northline Studio',
      refundPolicy: JACKET_EVIDENCE.policy.content,
      defaultRefundLimitMinor: 18000,
      currency: 'USD',
    })
    .returning();
  if (!northline) throw new Error('seed merchant failed');

  // Case 1: the missing jacket (seeded data, so negotiation works but no refund can run).
  const [jacketTxn] = await database
    .insert(transactions)
    .values({
      merchantId: northline.id,
      buyerId: alex.id,
      description: 'Everyday Jacket (M, charcoal)',
      originalAmountMinor: 18000,
      currency: 'USD',
      paymentStatus: 'CAPTURED',
      sourceType: 'DEMO_SEED',
    })
    .returning();
  const [jacketCase] = await database
    .insert(cases)
    .values({
      reference: 'RA-1042',
      transactionId: jacketTxn!.id,
      buyerId: alex.id,
      merchantId: northline.id,
      category: 'ITEM_NOT_RECEIVED',
      title: 'The missing jacket',
      description: 'Tracking says the jacket was delivered on 28 Oct. Alex says it never arrived.',
      buyerDesiredOutcome: 'A full refund, or a fair partial refund',
      buyerFloorMinor: 8000,
      merchantPreference: 'Avoid an unnecessary full refund, but keep the customer',
      merchantMaxRefundMinor: 12000,
      sourceType: 'DEMO_SEED',
    })
    .returning();
  await database.insert(evidence).values(
    [JACKET_EVIDENCE.complaint, JACKET_EVIDENCE.tracking, JACKET_EVIDENCE.orderRecord, JACKET_EVIDENCE.policy].map(
      (item, index) => ({ ...item, caseId: jacketCase!.id, code: `EV-${index + 1}` }),
    ),
  );

  // Case 2: not enough evidence on either side; the agents should not force a settlement.
  const [lampTxn] = await database
    .insert(transactions)
    .values({
      merchantId: northline.id,
      buyerId: priya.id,
      description: 'Linen Table Lamp',
      originalAmountMinor: 9500,
      currency: 'USD',
      paymentStatus: 'CAPTURED',
      sourceType: 'DEMO_SEED',
    })
    .returning();
  const [lampCase] = await database
    .insert(cases)
    .values({
      reference: 'RA-1043',
      transactionId: lampTxn!.id,
      buyerId: priya.id,
      merchantId: northline.id,
      category: 'NOT_AS_DESCRIBED',
      title: 'Lamp “not as described”',
      description: 'Priya says the lamp is a different colour than shown. No photos either way.',
      buyerDesiredOutcome: 'A full refund and nothing less',
      buyerFloorMinor: 9500,
      merchantPreference: 'No refund without photos; a return for exchange is fine',
      merchantMaxRefundMinor: 2000,
      sourceType: 'DEMO_SEED',
    })
    .returning();
  await database.insert(evidence).values([
    {
      caseId: lampCase!.id,
      code: 'EV-1',
      sourceParty: 'BUYER',
      evidenceType: 'COMPLAINT',
      title: 'Buyer statement',
      content: 'The lamp looks more grey than the sand colour in the listing. I want my money back.',
      verificationStatus: 'PARTY_PROVIDED',
    },
    {
      caseId: lampCase!.id,
      code: 'EV-2',
      sourceParty: 'MERCHANT',
      evidenceType: 'LISTING',
      title: 'Product listing',
      content: 'Colour: “Sand (may vary by screen)”. Returns for exchange within 14 days, unused.',
      verificationStatus: 'PARTY_PROVIDED',
    },
  ]);

  await database.insert(auditEvents).values(
    [jacketCase!, lampCase!].map((kase) => ({
      caseId: kase.id,
      actorType: 'SYSTEM' as const,
      action: 'case.opened',
      details: { reference: kase.reference, seeded: true },
    })),
  );
}

export async function demoUsers(database: Db) {
  return database.select().from(users).where(eq(users.email, DEMO.buyer.email));
}

if (isMain(import.meta.url)) {
  runMigrations()
    .then(() => seedDemo(db()))
    .then(() => console.log('Seeded demo people and 2 demo cases (RA-1042, RA-1043).'))
    .catch((error: unknown) => {
      console.error('Seed failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
