import cookieParser from 'cookie-parser';
import cors from 'cors';
import { asc, desc, eq, or } from 'drizzle-orm';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';

import {
  SESSION_COOKIE,
  createSession,
  csrfGuard,
  destroySession,
  loadSession,
  requireRole,
  requireUser,
  setSessionCookie,
} from './auth.js';
import { aiConfigured, config, paypalConfigured } from './config.js';
import { type Db } from './db/index.js';
import { merchants, transactions, users } from './db/schema.js';
import { AppError, badRequest } from './errors.js';
import { isSupportedCurrency } from './money.js';
import { type PayPalGateway } from './paypal/client.js';
import { type CertFetcher } from './paypal/webhook-verify.js';
import { PaymentService, toAppError } from './payments/service.js';
import { handleWebhook } from './payments/webhooks.js';

export interface AppDeps {
  database: Db;
  paypal: PayPalGateway;
  /** Tests inject a fake certificate source for webhook signatures. */
  getCert?: CertFetcher;
  /** Extra route registrations (cases, negotiation, settlement) added by later modules. */
  extend?: (app: express.Express, services: { payments: PaymentService }) => void;
}

/** Wraps an async handler so thrown errors reach the error middleware. */
export const route =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('invalid_request', 'Some of the request is not valid.', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}

export function createApp(deps: AppDeps) {
  const c = config();
  const app = express();
  const payments = new PaymentService(deps.database, deps.paypal, c.FRONTEND_URL);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: c.FRONTEND_URL, credentials: true }));

  // The webhook needs the exact raw bytes for its signature, so it is registered before JSON parsing.
  app.post(
    '/api/paypal/webhooks',
    express.raw({ type: '*/*', limit: '1mb' }),
    route(async (req, res) => {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const outcome = await handleWebhook(
        deps.database,
        payments,
        body,
        req.headers,
        config().PAYPAL_WEBHOOK_ID,
        deps.getCert,
      );
      res.status(outcome.status).json({ result: outcome.result });
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(loadSession(deps.database));
  app.use(csrfGuard);

  const paymentLimiter = rateLimit({
    windowMs: 60_000,
    limit: c.NODE_ENV === 'test' ? 1000 : 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many payment requests. Wait a minute.' } },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ── Auth (seeded demo people; a switch is a real sign-out and sign-in) ─────

  app.get(
    '/api/auth/demo-accounts',
    route(async (_req, res) => {
      const rows = await deps.database
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .orderBy(asc(users.role), asc(users.name));
      res.json({ accounts: rows });
    }),
  );

  app.post(
    '/api/auth/login',
    route(async (req, res) => {
      const { userId } = parse(z.object({ userId: z.string().uuid() }), req.body);
      const user = await deps.database.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) throw new AppError(401, 'unknown_account', 'That demo account does not exist.');
      await destroySession(deps.database, req.cookies?.[SESSION_COOKIE] as string | undefined);
      const session = await createSession(deps.database, user.id);
      setSessionCookie(res, session.token, c.NODE_ENV === 'production');
      res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        csrfToken: session.csrfToken,
      });
    }),
  );

  app.post(
    '/api/auth/logout',
    route(async (req, res) => {
      await destroySession(deps.database, req.cookies?.[SESSION_COOKIE] as string | undefined);
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.status(204).end();
    }),
  );

  app.get(
    '/api/auth/me',
    route(async (req, res) => {
      const user = requireUser(req);
      const merchant =
        user.role === 'MERCHANT'
          ? await deps.database.query.merchants.findFirst({ where: eq(merchants.ownerUserId, user.id) })
          : null;
      res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        merchant: merchant ? { id: merchant.id, businessName: merchant.businessName } : null,
        csrfToken: user.csrfToken,
      });
    }),
  );

  // ── PayPal ────────────────────────────────────────────────────────────────

  app.get(
    '/api/paypal/status',
    route(async (_req, res) => {
      const configured = paypalConfigured();
      let connected = false;
      let problem: string | null = configured ? null : 'PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set.';
      if (configured) {
        try {
          await deps.paypal.checkCredentials();
          connected = true;
        } catch (error) {
          problem = toAppError(error).message;
        }
      }
      res.json({
        environment: 'sandbox',
        adapter: config().PAYPAL_ADAPTER === 'mock' ? 'mock' : 'paypal-sandbox',
        configured,
        connected,
        webhookConfigured: Boolean(config().PAYPAL_WEBHOOK_ID),
        aiConfigured: aiConfigured(),
        aiMode: config().AI_MODE,
        problem,
      });
    }),
  );

  app.get(
    '/api/merchants',
    route(async (req, res) => {
      requireUser(req);
      const rows = await deps.database
        .select({ id: merchants.id, businessName: merchants.businessName, currency: merchants.currency })
        .from(merchants)
        .orderBy(asc(merchants.businessName));
      res.json({ merchants: rows });
    }),
  );

  app.post(
    '/api/paypal/orders',
    paymentLimiter,
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER');
      const body = parse(
        z.object({
          merchantId: z.string().uuid(),
          amountMinor: z.number().int().min(100).max(1_000_000),
          currency: z.string().length(3).refine(isSupportedCurrency, 'Unsupported currency'),
          description: z.string().trim().min(3).max(120),
        }),
        req.body,
      );
      const order = await payments.createSandboxOrder({ userId: user.id, role: user.role }, body);
      res.status(201).json(order);
    }),
  );

  app.post(
    '/api/paypal/orders/:orderId/capture',
    paymentLimiter,
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER');
      const orderId = parse(z.string().regex(/^[A-Z0-9]{5,40}$/), req.params.orderId);
      const txn = await payments.captureSandboxOrder({ userId: user.id, role: user.role }, orderId);
      res.json({ transaction: txn });
    }),
  );

  app.get(
    '/api/transactions',
    route(async (req, res) => {
      const user = requireUser(req);
      const mine =
        user.role === 'BUYER'
          ? eq(transactions.buyerId, user.id)
          : user.role === 'MERCHANT'
            ? or(
                ...(
                  await deps.database
                    .select({ id: merchants.id })
                    .from(merchants)
                    .where(eq(merchants.ownerUserId, user.id))
                ).map((m) => eq(transactions.merchantId, m.id)),
                eq(transactions.id, '00000000-0000-0000-0000-000000000000'),
              )
            : undefined;
      const rows = await deps.database
        .select()
        .from(transactions)
        .where(mine)
        .orderBy(desc(transactions.createdAt))
        .limit(50);
      res.json({ transactions: rows });
    }),
  );

  app.post(
    '/api/paypal/refunds/execute',
    paymentLimiter,
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER', 'MERCHANT');
      // Only the case id: amount, capture and currency are loaded from the approved settlement.
      const { caseId } = parse(z.object({ caseId: z.string().uuid() }).strict(), req.body);
      const refund = await payments.executeApprovedRefund({ userId: user.id, role: user.role }, caseId);
      res.json({ refund });
    }),
  );

  app.post(
    '/api/paypal/refunds/reconcile',
    paymentLimiter,
    route(async (req, res) => {
      const user = requireRole(req, 'BUYER', 'MERCHANT');
      const { caseId } = parse(z.object({ caseId: z.string().uuid() }).strict(), req.body);
      const refund = await payments.reconcileRefund({ userId: user.id, role: user.role }, caseId);
      res.json({ refund });
    }),
  );

  deps.extend?.(app, { payments });

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'not_found', 'No such endpoint.')));

  // One error shape; internal details stay in the server log, never in the response.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const appError = toAppError(error);
    if (appError.status >= 500 && !(error instanceof AppError)) {
      console.error('[error]', error instanceof Error ? error.stack : error);
    }
    res.status(appError.status).json({
      error: { code: appError.code, message: appError.message, details: appError.details },
    });
  });

  return { app, payments };
}
