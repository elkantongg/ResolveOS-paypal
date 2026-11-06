import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * ResolveOS's schema. Money columns are integers of minor units (`*_minor`). Every table that can
 * hold seeded demonstration data has a `source_type`, so a seeded record is never mistaken for a
 * verified PayPal sandbox record.
 */

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum('user_role', ['BUYER', 'MERCHANT', 'OPERATOR']);
export const sourceType = pgEnum('source_type', ['PAYPAL_SANDBOX', 'DEMO_SEED']);
export const paymentStatus = pgEnum('payment_status', [
  'CREATED', // order exists, buyer has not approved/captured yet
  'CAPTURED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
]);
export const caseStatus = pgEnum('case_status', [
  'OPEN',
  'IN_NEGOTIATION',
  'AWAITING_APPROVAL',
  'PAYMENT_PROCESSING',
  'RESOLVED',
  'NO_AGREEMENT',
  'ESCALATED',
]);
export const caseCategory = pgEnum('case_category', [
  'ITEM_NOT_RECEIVED',
  'NOT_AS_DESCRIBED',
  'DAMAGED',
  'DUPLICATE_CHARGE',
  'OTHER',
]);
export const evidenceSource = pgEnum('evidence_source', ['BUYER', 'MERCHANT', 'PAYPAL', 'SYSTEM']);
export const verificationStatus = pgEnum('verification_status', [
  'VERIFIED_PAYPAL', // read from PayPal's API by the server
  'PARTY_PROVIDED', // supplied by the buyer or merchant, not independently checked
  'UNVERIFIED',
]);
export const agentType = pgEnum('agent_type', ['BUYER', 'MERCHANT']);
export const settlementType = pgEnum('settlement_type', [
  'FULL_REFUND',
  'PARTIAL_REFUND',
  'NO_REFUND',
  'REPLACEMENT',
]);
export const proposalStatus = pgEnum('proposal_status', [
  'PENDING_APPROVAL',
  'APPROVED', // both parties approved this exact version
  'REJECTED',
  'REVISION_REQUESTED',
  'SUPERSEDED',
  'EXECUTED',
]);
export const decision = pgEnum('approval_decision', ['APPROVE', 'REJECT', 'REQUEST_REVISION']);
export const refundStatus = pgEnum('refund_status', [
  'NOT_STARTED',
  'AUTHORIZED',
  'PROCESSING',
  'PENDING',
  'COMPLETED',
  'FAILED',
  'UNKNOWN_REQUIRES_RECONCILIATION',
]);
export const actorType = pgEnum('actor_type', ['USER', 'AGENT', 'SYSTEM', 'PAYPAL']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: userRole('role').notNull(),
  createdAt: created(),
});

/** Server-side sessions. `id` is the SHA-256 of the cookie token, so a DB leak is not a login. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: created(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  businessName: text('business_name').notNull(),
  refundPolicy: text('refund_policy').notNull(),
  /** The most the merchant's agent may ever offer on one case, in the merchant's currency. */
  defaultRefundLimitMinor: integer('default_refund_limit_minor').notNull(),
  currency: text('currency').notNull().default('USD'),
  createdAt: created(),
});

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => users.id),
    description: text('description').notNull(),
    paypalOrderId: text('paypal_order_id').unique(),
    paypalCaptureId: text('paypal_capture_id').unique(),
    originalAmountMinor: integer('original_amount_minor').notNull(),
    currency: text('currency').notNull(),
    amountRefundedMinor: integer('amount_refunded_minor').notNull().default(0),
    paymentStatus: paymentStatus('payment_status').notNull(),
    sourceType: sourceType('source_type').notNull(),
    payerEmail: text('payer_email'),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check('transactions_amount_positive', sql`${t.originalAmountMinor} > 0`),
    check(
      'transactions_refund_within_amount',
      sql`${t.amountRefundedMinor} >= 0 AND ${t.amountRefundedMinor} <= ${t.originalAmountMinor}`,
    ),
    // A seeded transaction can never carry PayPal identifiers, and a refundable sandbox one must.
    check(
      'transactions_seed_has_no_paypal_ids',
      sql`${t.sourceType} = 'PAYPAL_SANDBOX' OR (${t.paypalOrderId} IS NULL AND ${t.paypalCaptureId} IS NULL)`,
    ),
  ],
);

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => users.id),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    category: caseCategory('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    /** What the buyer says they want, in their words. */
    buyerDesiredOutcome: text('buyer_desired_outcome').notNull(),
    /** The least refund the buyer says they would accept; null = only a full remedy. */
    buyerFloorMinor: integer('buyer_floor_minor'),
    merchantPreference: text('merchant_preference').notNull(),
    /** The merchant's ceiling for this case (≤ the merchant's default limit and the payment). */
    merchantMaxRefundMinor: integer('merchant_max_refund_minor').notNull(),
    maxTurns: integer('max_turns').notNull().default(6),
    /** Set when negotiation starts: `live` (real model) or `demo` (deterministic negotiator). */
    negotiationMode: text('negotiation_mode'),
    /** Notes from a person who asked to revise an agreement; shown to both agents. */
    revisionNotes: jsonb('revision_notes').$type<string[]>().notNull().default([]),
    currentStatus: caseStatus('current_status').notNull().default('OPEN'),
    sourceType: sourceType('source_type').notNull(),
    outcomeSummary: text('outcome_summary'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('cases_merchant_idx').on(t.merchantId),
    index('cases_buyer_idx').on(t.buyerId),
    check('cases_max_turns_range', sql`${t.maxTurns} BETWEEN 2 AND 12`),
  ],
);

export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    /** Short citation code shown in the UI and used by agents, e.g. "EV-2". */
    code: text('code').notNull(),
    sourceParty: evidenceSource('source_party').notNull(),
    evidenceType: text('evidence_type').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    verificationStatus: verificationStatus('verification_status').notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex('evidence_case_code_uq').on(t.caseId, t.code)],
);

export const negotiationTurns = pgTable(
  'negotiation_turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    turnIndex: integer('turn_index').notNull(),
    agentType: agentType('agent_type').notNull(),
    structuredOutput: jsonb('structured_output').notNull(),
    /** `live` = a real model call; `demo` = the labelled deterministic negotiator. */
    provider: text('provider').notNull(),
    model: text('model'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('turns_case_index_uq').on(t.caseId, t.turnIndex)],
);

export const settlementProposals = pgTable(
  'settlement_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    proposalVersion: integer('proposal_version').notNull(),
    settlementType: settlementType('settlement_type').notNull(),
    refundAmountMinor: integer('refund_amount_minor').notNull(),
    currency: text('currency').notNull(),
    summary: text('summary').notNull(),
    /** SHA-256 of the material terms; an approval is only valid for the hash it approved. */
    termsHash: text('terms_hash').notNull(),
    requiresManualAction: boolean('requires_manual_action').notNull().default(false),
    currentStatus: proposalStatus('current_status').notNull().default('PENDING_APPROVAL'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('proposals_case_version_uq').on(t.caseId, t.proposalVersion),
    check('proposals_amount_non_negative', sql`${t.refundAmountMinor} >= 0`),
  ],
);

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => settlementProposals.id, { onDelete: 'cascade' }),
    approverUserId: uuid('approver_user_id')
      .notNull()
      .references(() => users.id),
    role: userRole('role').notNull(),
    decision: decision('decision').notNull(),
    approvedTermsHash: text('approved_terms_hash').notNull(),
    note: text('note'),
    createdAt: created(),
  },
  // One decision per party per proposal version.
  (t) => [uniqueIndex('approvals_proposal_role_uq').on(t.proposalId, t.role)],
);

export const refundAttempts = pgTable(
  'refund_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // One logical refund per approved proposal: the uniqueness is the duplicate-refund guard.
    proposalId: uuid('proposal_id')
      .notNull()
      .unique()
      .references(() => settlementProposals.id),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id),
    paypalRequestId: text('paypal_request_id').notNull().unique(),
    paypalRefundId: text('paypal_refund_id').unique(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    isFullRefund: boolean('is_full_refund').notNull(),
    status: refundStatus('status').notNull().default('NOT_STARTED'),
    paypalStatus: text('paypal_status'),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [check('refund_amount_positive', sql`${t.amountMinor} > 0`)],
);

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  paypalEventId: text('paypal_event_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  resourceId: text('resource_id'),
  verificationStatus: text('verification_status').notNull(),
  processingStatus: text('processing_status').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

/** Append-only history of a case (and of payments), also the source of live negotiation events. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
    actorType: actorType('actor_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    details: jsonb('details').notNull().default({}),
    createdAt: created(),
  },
  (t) => [index('audit_case_created_idx').on(t.caseId, t.createdAt)],
);
