import { and, asc, count, desc, eq, ilike, inArray, or, sql, sum } from 'drizzle-orm';
import type express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { parse, route } from '../app.js';
import { audit, publish, subscribe } from '../audit.js';
import { requireRole, requireUser, type SessionUser } from '../auth.js';
import { config } from '../config.js';
import { type Db } from '../db/index.js';
import {
  auditEvents,
  cases,
  evidence,
  merchants,
  refundAttempts,
  settlementProposals,
  transactions,
  users,
} from '../db/schema.js';
import { resetDemoData } from '../db/seed.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { formatMoney } from '../money.js';
import { PAYPAL_INQUIRY_WINDOW_DAYS, caseMetrics, median } from '../metrics.js';
import { type Orchestrator } from '../negotiation/orchestrator.js';
import { type PayPalGateway } from '../paypal/client.js';
import { type Actor, type PaymentService, assertParty } from '../payments/service.js';
import { type SettlementService } from '../settlement/service.js';

/**
 * Cases, evidence, negotiation, settlement, receipts, dashboard and demo routes. Every route loads
 * the case and checks the signed-in person is its buyer or its merchant (the operator may read);
 * a stranger gets 404.
 */

const actorOf = (user: SessionUser): Actor => ({ userId: user.id, role: user.role });

const CATEGORY = z.enum(['ITEM_NOT_RECEIVED', 'NOT_AS_DESCRIBED', 'DAMAGED', 'DUPLICATE_CHARGE', 'OTHER']);

async function merchantIdsOf(database: Db, user: SessionUser): Promise<string[]> {
  if (user.role !== 'MERCHANT') return [];
  const rows = await database.select({ id: merchants.id }).from(merchants).where(eq(merchants.ownerUserId, user.id));
  return rows.map((r) => r.id);
}

/** The WHERE clause limiting cases to what this person may see. */
async function visibleCases(database: Db, user: SessionUser) {
  if (user.role === 'OPERATOR') return undefined;
  if (user.role === 'BUYER') return eq(cases.buyerId, user.id);
  const ids = await merchantIdsOf(database, user);
  return ids.length ? inArray(cases.merchantId, ids) : sql`false`;
}

export function registerCaseRoutes(
  app: express.Express,
  deps: {
    database: Db;
    paypal: PayPalGateway;
    payments: PaymentService;
    orchestrator: Orchestrator;
    settlements: SettlementService;
  },
) {
  const { database, orchestrator, settlements, payments } = deps;
  const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: config().RATE_LIMIT_MAX ?? (config().NODE_ENV === 'test' ? 1000 : 30),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many negotiation requests. Wait a minute.' } },
  });

  async function loadCase(user: SessionUser, id: string) {
    const caseId = parse(z.string().uuid(), id);
    const kase = await database.query.cases.findFirst({ where: eq(cases.id, caseId) });
    if (!kase) throw notFound('Case not found');
    const role = await assertParty(database, actorOf(user), kase, { allowOperator: true });
    return { kase, role };
  }

  // ── Cases ────────────────────────────────────────────────────────────────

  app.get(
    '/api/cases',
    route(async (req, res) => {
      const user = requireUser(req);
      const query = parse(
        z.object({ status: z.string().optional(), q: z.string().trim().max(80).optional() }),
        req.query,
      );
      const filters = [await visibleCases(database, user)];
      if (query.status && query.status !== 'ALL') {
        filters.push(eq(cases.currentStatus, parse(z.enum(['OPEN', 'IN_NEGOTIATION', 'AWAITING_APPROVAL', 'PAYMENT_PROCESSING', 'RESOLVED', 'NO_AGREEMENT', 'ESCALATED']), query.status)));
      }
      if (query.q) filters.push(or(ilike(cases.title, `%${query.q}%`), ilike(cases.reference, `%${query.q}%`)));
      const rows = await database
        .select({
          id: cases.id,
          reference: cases.reference,
          title: cases.title,
          category: cases.category,
          status: cases.currentStatus,
          sourceType: cases.sourceType,
          updatedAt: cases.updatedAt,
          amountMinor: transactions.originalAmountMinor,
          refundedMinor: transactions.amountRefundedMinor,
          currency: transactions.currency,
          buyerName: users.name,
          merchantName: merchants.businessName,
        })
        .from(cases)
        .innerJoin(transactions, eq(transactions.id, cases.transactionId))
        .innerJoin(users, eq(users.id, cases.buyerId))
        .innerJoin(merchants, eq(merchants.id, cases.merchantId))
        .where(and(...filters))
        .orderBy(desc(cases.updatedAt))
        .limit(100);
      res.json({ cases: rows });
    }),
  );

  app.post(
    '/api/cases',
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER');
      const body = parse(
        z
          .object({
            transactionId: z.string().uuid(),
            category: CATEGORY,
            title: z.string().trim().min(4).max(80),
            description: z.string().trim().min(10).max(1000),
            desiredOutcome: z.string().trim().min(3).max(200),
            floorMinor: z.number().int().min(0).nullable(),
          })
          .strict(),
        req.body,
      );
      const txn = await database.query.transactions.findFirst({ where: eq(transactions.id, body.transactionId) });
      if (!txn || txn.buyerId !== user.id) throw notFound('Transaction not found');
      if (txn.paymentStatus !== 'CAPTURED' && txn.paymentStatus !== 'PARTIALLY_REFUNDED') {
        throw conflict('not_captured', 'You can only open a case on a completed payment.');
      }
      const refundable = txn.originalAmountMinor - txn.amountRefundedMinor;
      if (body.floorMinor !== null && body.floorMinor > refundable) {
        throw conflict('floor_too_high', 'Your minimum cannot be more than the refundable amount.');
      }
      const open = await database.query.cases.findFirst({
        where: and(eq(cases.transactionId, txn.id), inArray(cases.currentStatus, ['OPEN', 'IN_NEGOTIATION', 'AWAITING_APPROVAL', 'PAYMENT_PROCESSING'])),
      });
      if (open) throw conflict('case_exists', `There is already an open case (${open.reference}) for this payment.`);
      const merchant = await database.query.merchants.findFirst({ where: eq(merchants.id, txn.merchantId) });
      if (!merchant) throw notFound('Merchant not found');

      // Verified facts come from PayPal itself, read now by the server.
      let verified: string | null = null;
      if (txn.sourceType === 'PAYPAL_SANDBOX' && txn.paypalCaptureId && deps.paypal.isConfigured()) {
        try {
          const capture = await deps.paypal.getCapture(txn.paypalCaptureId);
          verified = `PayPal sandbox capture ${capture.captureId}: ${formatMoney(capture.amountMinor, capture.currency)}, status ${capture.status}${txn.capturedAt ? `, captured ${txn.capturedAt.toISOString().slice(0, 10)}` : ''}${txn.payerEmail ? `, paid by ${txn.payerEmail}` : ''}.`;
        } catch {
          verified = null;
        }
      }

      // References are "RA-<next number>". Two cases opened at once can pick the same number; the
      // unique index refuses the second, which then retries with the next one instead of failing.
      const insertCase = async (attempt: number) => {
        const [{ value: highest } = { value: null }] = await database
          .select({ value: sql<number | null>`max(cast(substring(${cases.reference} from 4) as integer))` })
          .from(cases)
          .where(sql`${cases.reference} ~ '^RA-[0-9]+$'`);
        return database.transaction(async (tx) => {
        const [kase] = await tx
          .insert(cases)
          .values({
            reference: `RA-${Math.max(1099, Number(highest ?? 0)) + 1 + attempt}`,
            transactionId: txn.id,
            buyerId: user.id,
            merchantId: merchant.id,
            category: body.category,
            title: body.title,
            description: body.description,
            buyerDesiredOutcome: body.desiredOutcome,
            buyerFloorMinor: body.floorMinor,
            merchantPreference: 'Resolve fairly within policy; keep the customer where reasonable',
            merchantMaxRefundMinor: Math.min(merchant.defaultRefundLimitMinor, refundable),
            sourceType: txn.sourceType,
          })
          .returning();
        if (!kase) throw new Error('case insert failed');
        const items = [
          ...(verified
            ? [{ sourceParty: 'PAYPAL' as const, evidenceType: 'PAYMENT', title: 'PayPal capture (verified)', content: verified, verificationStatus: 'VERIFIED_PAYPAL' as const }]
            : []),
          { sourceParty: 'BUYER' as const, evidenceType: 'COMPLAINT', title: 'Buyer statement', content: body.description, verificationStatus: 'PARTY_PROVIDED' as const },
        ];
        await tx.insert(evidence).values(items.map((item, i) => ({ ...item, caseId: kase.id, code: `EV-${i + 1}` })));
        const record = await audit(tx, { caseId: kase.id, actorType: 'USER', actorUserId: user.id, action: 'case.opened', details: { reference: kase.reference } });
        return { kase, record };
        });
      };
      let created: Awaited<ReturnType<typeof insertCase>> | null = null;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        try {
          created = await insertCase(attempt);
        } catch (error) {
          const code = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
          if (code !== '23505' || attempt === 4) throw error; // only a reference clash is retried
        }
      }
      if (!created) throw new Error('case insert failed');
      publish([created.record]);
      // The buyer who opened the case must not learn the merchant's default limit from the response.
      res.status(201).json({ case: { ...created.kase, merchantMaxRefundMinor: null, merchantPreference: null } });
    }),
  );

  app.get(
    '/api/cases/:id',
    route(async (req, res) => {
      const user = requireUser(req);
      const { kase, role } = await loadCase(user, req.params.id as string);
      const txn = await database.query.transactions.findFirst({ where: eq(transactions.id, kase.transactionId) });
      const merchant = await database.query.merchants.findFirst({ where: eq(merchants.id, kase.merchantId) });
      const buyer = await database.query.users.findFirst({ where: eq(users.id, kase.buyerId) });
      const timeline = await database
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.caseId, kase.id))
        .orderBy(asc(auditEvents.createdAt))
        .limit(300);
      const items = await database.select().from(evidence).where(eq(evidence.caseId, kase.id)).orderBy(asc(evidence.createdAt));
      res.json({
        viewerRole: role,
        case: {
          ...kase,
          // Each side's private limit is shown only to that side (and the operator).
          buyerFloorMinor: role === 'MERCHANT' ? null : kase.buyerFloorMinor,
          merchantMaxRefundMinor: role === 'BUYER' ? null : kase.merchantMaxRefundMinor,
          merchantPreference: role === 'BUYER' ? null : kase.merchantPreference,
        },
        transaction: txn,
        merchant: merchant ? { id: merchant.id, businessName: merchant.businessName, refundPolicy: merchant.refundPolicy } : null,
        buyer: buyer ? { id: buyer.id, name: buyer.name } : null,
        evidence: items,
        timeline,
      });
    }),
  );

  app.post(
    '/api/cases/:id/evidence',
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER', 'MERCHANT');
      const { kase, role } = await loadCase(user, req.params.id as string);
      if (!['OPEN', 'NO_AGREEMENT'].includes(kase.currentStatus)) {
        throw conflict('evidence_locked', 'Evidence can be added before negotiation starts.');
      }
      const body = parse(
        z.object({
          evidenceType: z.enum(['TRACKING', 'ORDER_RECORD', 'PHOTO_DESCRIPTION', 'MESSAGE', 'POLICY', 'OTHER']),
          title: z.string().trim().min(3).max(80),
          content: z.string().trim().min(5).max(1500),
        }),
        req.body,
      );
      const created = await database.transaction(async (tx) => {
        const [{ value: n } = { value: 0 }] = await tx.select({ value: count() }).from(evidence).where(eq(evidence.caseId, kase.id));
        const [row] = await tx
          .insert(evidence)
          .values({
            caseId: kase.id,
            code: `EV-${Number(n) + 1}`,
            sourceParty: role === 'MERCHANT' ? 'MERCHANT' : 'BUYER',
            evidenceType: body.evidenceType,
            title: body.title,
            content: body.content,
            verificationStatus: 'PARTY_PROVIDED',
          })
          .returning();
        const record = await audit(tx, { caseId: kase.id, actorType: 'USER', actorUserId: user.id, action: 'evidence.added', details: { code: row?.code, title: body.title, by: role } });
        return { row, record };
      });
      publish([created.record]);
      res.status(201).json({ evidence: created.row });
    }),
  );

  app.patch(
    '/api/cases/:id/merchant-terms',
    route(async (req, res) => {
      const user = requireRole(req, 'MERCHANT');
      const { kase } = await loadCase(user, req.params.id as string);
      if (!['OPEN', 'NO_AGREEMENT'].includes(kase.currentStatus)) {
        throw conflict('terms_locked', 'Limits can be changed before negotiation starts.');
      }
      const txn = await database.query.transactions.findFirst({ where: eq(transactions.id, kase.transactionId) });
      const merchant = await database.query.merchants.findFirst({ where: eq(merchants.id, kase.merchantId) });
      const refundable = (txn?.originalAmountMinor ?? 0) - (txn?.amountRefundedMinor ?? 0);
      const body = parse(
        z.object({
          maxRefundMinor: z.number().int().min(0).max(Math.min(refundable, merchant?.defaultRefundLimitMinor ?? 0)),
          preference: z.string().trim().min(3).max(200),
        }),
        req.body,
      );
      const record = await database.transaction(async (tx) => {
        await tx.update(cases).set({ merchantMaxRefundMinor: body.maxRefundMinor, merchantPreference: body.preference, merchantConfirmedAt: new Date(), updatedAt: new Date() }).where(eq(cases.id, kase.id));
        return audit(tx, { caseId: kase.id, actorType: 'USER', actorUserId: user.id, action: 'merchant.limits_confirmed', details: {} });
      });
      publish([record]);
      res.status(204).end();
    }),
  );

  // ── Negotiation ──────────────────────────────────────────────────────────

  app.post(
    '/api/cases/:id/negotiate/start',
    aiLimiter,
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER', 'MERCHANT');
      const { mode } = parse(z.object({ mode: z.enum(['live', 'demo']).default(config().AI_MODE) }), req.body ?? {});
      res.json(await orchestrator.start(actorOf(user), parse(z.string().uuid(), req.params.id), mode));
    }),
  );

  app.post(
    '/api/cases/:id/negotiate/advance',
    aiLimiter,
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER', 'MERCHANT');
      res.json(await orchestrator.advance(actorOf(user), parse(z.string().uuid(), req.params.id)));
    }),
  );

  app.post(
    '/api/cases/:id/negotiate/run',
    aiLimiter,
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER', 'MERCHANT');
      res.json(await orchestrator.runToEnd(actorOf(user), parse(z.string().uuid(), req.params.id)));
    }),
  );

  app.get(
    '/api/cases/:id/negotiate/history',
    route(async (req, res) => {
      const user = requireUser(req);
      res.json(await orchestrator.history(actorOf(user), parse(z.string().uuid(), req.params.id)));
    }),
  );

  /** Live events for one case (Server-Sent Events). Past events come from GET /api/cases/:id. */
  app.get(
    '/api/cases/:id/events',
    route(async (req, res) => {
      const user = requireUser(req);
      const { kase } = await loadCase(user, req.params.id as string);
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      res.write(`event: ready\ndata: {}\n\n`);
      const unsubscribe = subscribe(kase.id, (record) => {
        res.write(`event: audit\ndata: ${JSON.stringify(record)}\n\n`);
      });
      const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        unsubscribe();
      });
    }),
  );

  // ── Settlement ───────────────────────────────────────────────────────────

  app.get(
    '/api/cases/:id/settlement',
    route(async (req, res) => {
      const user = requireUser(req);
      res.json(await settlements.view(actorOf(user), parse(z.string().uuid(), req.params.id)));
    }),
  );

  for (const [path, decision] of [
    ['approve', 'APPROVE'],
    ['reject', 'REJECT'],
    ['revise', 'REQUEST_REVISION'],
  ] as const) {
    app.post(
      `/api/cases/:id/settlement/${path}`,
      route(async (req, res) => {
        const user = requireRole(req, 'BUYER', 'MERCHANT');
        const body = parse(z.object({ proposalVersion: z.number().int().min(1), note: z.string().trim().max(300).optional() }), req.body);
        res.json(await settlements.decide(actorOf(user), parse(z.string().uuid(), req.params.id), { ...body, decision }));
      }),
    );
  }

  app.get(
    '/api/cases/:id/receipt',
    route(async (req, res) => {
      const user = requireUser(req);
      const { kase } = await loadCase(user, req.params.id as string);
      const view = await settlements.view(actorOf(user), kase.id);
      const attempt = await payments.latestAttempt(kase.id);
      const timeline = await database.select().from(auditEvents).where(eq(auditEvents.caseId, kase.id)).orderBy(asc(auditEvents.createdAt));
      const merchant = await database.query.merchants.findFirst({ where: eq(merchants.id, kase.merchantId) });
      const buyer = await database.query.users.findFirst({ where: eq(users.id, kase.buyerId) });
      res.json({
        reference: kase.reference,
        status: kase.currentStatus,
        outcomeSummary: kase.outcomeSummary,
        proposal: view.proposal,
        approvals: view.approvals,
        transaction: view.transaction,
        refund: attempt
          ? {
              status: attempt.status,
              paypalRefundId: attempt.paypalRefundId,
              paypalStatus: attempt.paypalStatus,
              amountMinor: attempt.amountMinor,
              currency: attempt.currency,
              requestId: attempt.paypalRequestId,
              errorMessage: attempt.errorMessage,
              createdAt: attempt.createdAt.toISOString(),
              updatedAt: attempt.updatedAt.toISOString(),
              // Only a PayPal-confirmed refund is called successful.
              verifiedByPayPal: attempt.status === 'COMPLETED' && Boolean(attempt.paypalRefundId),
            }
          : null,
        parties: { buyer: buyer?.name ?? null, merchant: merchant?.businessName ?? null },
        metrics: caseMetrics(timeline),
        comparison: { paypalInquiryWindowDays: PAYPAL_INQUIRY_WINDOW_DAYS, source: 'https://developer.paypal.com/disputes/disputes-lifecycle' },
        timeline,
      });
    }),
  );

  // ── Dashboard ────────────────────────────────────────────────────────────

  /** Resolution times and guardrail activity across the cases this person can see, from the audit log. */
  async function measured(scope: Awaited<ReturnType<typeof visibleCases>>) {
    const rows = await database
      .select({ caseId: auditEvents.caseId, action: auditEvents.action, createdAt: auditEvents.createdAt })
      .from(auditEvents)
      .innerJoin(cases, eq(cases.id, auditEvents.caseId))
      .where(scope)
      .orderBy(asc(auditEvents.createdAt));
    const byCase = new Map<string, { action: string; createdAt: Date }[]>();
    for (const row of rows) {
      if (!row.caseId) continue;
      const list = byCase.get(row.caseId) ?? [];
      list.push(row);
      byCase.set(row.caseId, list);
    }
    const all = [...byCase.values()].map((events) => caseMetrics(events));
    const resolved = all.map((m) => m.totalSeconds).filter((s): s is number => s !== null);
    const negotiations = all.map((m) => m.negotiationSeconds).filter((s): s is number => s !== null);
    return {
      resolvedCasesMeasured: resolved.length,
      medianResolutionSeconds: median(resolved),
      medianNegotiationSeconds: median(negotiations),
      agentTurns: all.reduce((a, m) => a + m.agentTurns, 0),
      guardrailRejections: all.reduce((a, m) => a + m.guardrailRejections, 0),
      paypalInquiryWindowDays: PAYPAL_INQUIRY_WINDOW_DAYS,
    };
  }

  app.get(
    '/api/dashboard/summary',
    route(async (req, res) => {
      const user = requireUser(req);
      const scope = await visibleCases(database, user);
      const byStatus = await database
        .select({ status: cases.currentStatus, n: count() })
        .from(cases)
        .where(scope)
        .groupBy(cases.currentStatus);
      const n = (s: string[]) => byStatus.filter((r) => s.includes(r.status)).reduce((a, r) => a + Number(r.n), 0);
      const refunded = await database
        .select({ currency: refundAttempts.currency, total: sum(refundAttempts.amountMinor) })
        .from(refundAttempts)
        .innerJoin(settlementProposals, eq(settlementProposals.id, refundAttempts.proposalId))
        .innerJoin(cases, eq(cases.id, settlementProposals.caseId))
        .where(and(scope, eq(refundAttempts.status, 'COMPLETED')))
        .groupBy(refundAttempts.currency);
      const days = await database
        .select({
          day: sql<string>`to_char(date_trunc('day', ${auditEvents.createdAt}), 'YYYY-MM-DD')`,
          resolved: sql<number>`count(*) filter (where ${auditEvents.action} = 'case.resolved')`,
          opened: sql<number>`count(*) filter (where ${auditEvents.action} = 'case.opened')`,
        })
        .from(auditEvents)
        .innerJoin(cases, eq(cases.id, auditEvents.caseId))
        .where(and(scope, sql`${auditEvents.createdAt} > now() - interval '14 days'`))
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      res.json({
        totalCases: n(['OPEN', 'IN_NEGOTIATION', 'AWAITING_APPROVAL', 'PAYMENT_PROCESSING', 'RESOLVED', 'NO_AGREEMENT', 'ESCALATED']),
        openCases: n(['OPEN', 'IN_NEGOTIATION']),
        awaitingApproval: n(['AWAITING_APPROVAL', 'PAYMENT_PROCESSING']),
        resolved: n(['RESOLVED']),
        notAgreed: n(['NO_AGREEMENT', 'ESCALATED']),
        refundedTotals: refunded.map((r) => ({ currency: r.currency, totalMinor: Number(r.total ?? 0) })),
        activity: days.map((d) => ({ day: d.day, resolved: Number(d.resolved), opened: Number(d.opened) })),
        measured: await measured(scope),
      });
    }),
  );

  app.get(
    '/api/dashboard/activity',
    route(async (req, res) => {
      const user = requireUser(req);
      const scope = await visibleCases(database, user);
      const rows = await database
        .select({ event: auditEvents, reference: cases.reference, title: cases.title })
        .from(auditEvents)
        .innerJoin(cases, eq(cases.id, auditEvents.caseId))
        .where(and(scope, sql`${auditEvents.action} <> 'agent.thinking'`))
        .orderBy(desc(auditEvents.createdAt))
        .limit(20);
      res.json({ activity: rows.map((r) => ({ ...r.event, reference: r.reference, title: r.title })) });
    }),
  );

  // ── Demo ────────────────────────────────────────────────────────────────

  app.post(
    '/api/demo/reset',
    route(async (req, res) => {
      // Wipes every case and transaction record in this app (PayPal itself is untouched). Explicit
      // on purpose: the demo operator only, never in production, and only with { confirm: 'RESET' }.
      const user = requireUser(req);
      if (user.role !== 'OPERATOR') throw forbidden('Only the demo operator can reset the demo.');
      if (config().NODE_ENV === 'production') throw forbidden('The demo cannot be reset in production.');
      const { confirm } = parse(z.object({ confirm: z.string().optional() }), req.body ?? {});
      if (confirm !== 'RESET') {
        throw badRequest('confirmation_required', 'Resetting deletes every case and payment record in this app. Send { "confirm": "RESET" } to go ahead.');
      }
      const deleted = await resetDemoData(database);
      res.clearCookie('resolve_session', { path: '/' });
      res.json({ ok: true, deleted, note: 'Demo data reset. Everyone has been signed out. PayPal sandbox records were not touched.' });
    }),
  );
}
