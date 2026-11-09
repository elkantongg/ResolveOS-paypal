import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chainFromEnv, modelFromEnv } from './ai/provider.js';
import { createApp } from './app.js';
import { aiConfigured, config, paypalConfigured } from './config.js';
import { db } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { InjectionGuard, Investigator, Reviewer } from './negotiation/analysts.js';
import { DemoEngine, LiveEngine } from './negotiation/engines.js';
import { Orchestrator } from './negotiation/orchestrator.js';
import { HttpPayPalGateway } from './paypal/client.js';
import { FakePayPal } from './paypal/fake.js';
import { readToolsFromEnv } from './paypal/read-tools.js';
import { registerCaseRoutes } from './routes/cases.js';
import { SettlementService } from './settlement/service.js';

const c = config();
await runMigrations();
const database = db();
const paypal =
  c.PAYPAL_ADAPTER === 'mock' ? new FakePayPal(`${c.FRONTEND_URL}/checkout/return`) : new HttpPayPalGateway();
const live = chainFromEnv(c.AI_MODEL);
const analyst = chainFromEnv(c.AI_MODEL_ANALYST ?? c.AI_MODEL);
const guard = modelFromEnv(c.AI_MODEL_GUARD);
const analysts = analyst
  ? { guard: guard ? new InjectionGuard(guard) : null, investigator: new Investigator(analyst, readToolsFromEnv()), reviewer: new Reviewer(analyst) }
  : null;

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

const { app, payments: paymentService } = createApp({
  database,
  paypal,
  webDist: c.NODE_ENV === 'production' && existsSync(webDist) ? webDist : undefined,
  extend: (application, { payments }) =>
    registerCaseRoutes(application, {
      database,
      paypal,
      payments,
      orchestrator: new Orchestrator(database, { live: live ? new LiveEngine(live) : null, demo: new DemoEngine() }, analysts),
      settlements: new SettlementService(database, payments),
    }),
});

// Webhooks are the fast path; this catches any that never arrive.
setInterval(() => void paymentService.sweepPendingRefunds().catch(() => undefined), 60_000).unref();

app.listen(c.BACKEND_PORT, () => {
  console.log(`ResolveOS API on http://localhost:${c.BACKEND_PORT}`);
  console.log(c.PAYPAL_ADAPTER === 'mock' ? 'PayPal: MOCK adapter (automated tests only, no real PayPal calls).' : paypalConfigured() ? 'PayPal: sandbox credentials found.' : 'PayPal: NOT configured (payments disabled).');
  console.log(aiConfigured() ? `AI: live model ${c.AI_MODEL}.` : 'AI: not configured (only the labelled demo negotiator is available).');
});
