import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `pnpm eval [--engines=baseline,ai] [--reps=1]`
 *
 * Runs each scripted scenario through the SAME orchestrator and server guardrails with two
 * negotiators: the rules-based baseline (the deterministic demo engine) and the live AI agents.
 * Uses its own database (EVAL_DATABASE_URL, default resolve_ai_eval), never the demo data.
 * Writes raw results to apps/server/eval-results/<timestamp>.json and prints a table.
 */

process.env.DATABASE_URL = process.env.EVAL_DATABASE_URL ?? 'postgres://localhost:5432/resolve_ai_eval';

const { asc, eq } = await import('drizzle-orm');
const { liveProviderFromEnv } = await import('../ai/provider.js');
const { closeDb, db } = await import('../db/index.js');
const { runMigrations } = await import('../db/migrate.js');
const { auditEvents, cases, evidence, merchants, negotiationTurns, transactions, users } = await import('../db/schema.js');
const { DEMO, resetDemoData } = await import('../db/seed.js');
const { DemoEngine, LiveEngine } = await import('../negotiation/engines.js');
const { Orchestrator } = await import('../negotiation/orchestrator.js');
const { SCENARIOS } = await import('./scenarios.js');
type Outcome = import('./scenarios.js').Outcome;
type Scenario = import('./scenarios.js').Scenario;

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const engines = arg('engines', 'baseline,ai').split(',') as ('baseline' | 'ai')[];
const reps = Number(arg('reps', '1'));
const only = arg('only', '');

interface RunResult {
  scenario: string;
  engine: 'baseline' | 'ai';
  rep: number;
  outcome: Outcome | { kind: 'ERROR'; message: string };
  acceptable: boolean;
  withinBothLimits: boolean | null;
  turns: number;
  seconds: number;
  guardrailRejections: number;
  uncertaintiesStated: number;
  injectionFollowed: boolean;
}

async function setUp(scenario: Scenario) {
  const database = db();
  await resetDemoData(database);
  const buyer = await database.query.users.findFirst({ where: eq(users.email, DEMO.buyer.email) });
  const merchant = await database.query.merchants.findFirst();
  if (!buyer || !merchant) throw new Error('demo data missing');
  await database
    .update(merchants)
    .set({ refundPolicy: scenario.merchantPolicy, defaultRefundLimitMinor: scenario.amountMinor })
    .where(eq(merchants.id, merchant.id));
  const [txn] = await database
    .insert(transactions)
    .values({
      merchantId: merchant.id,
      buyerId: buyer.id,
      description: scenario.item,
      originalAmountMinor: scenario.amountMinor,
      currency: 'USD',
      paymentStatus: 'CAPTURED',
      sourceType: 'DEMO_SEED',
    })
    .returning();
  const [kase] = await database
    .insert(cases)
    .values({
      reference: `EV-${scenario.id}`,
      transactionId: txn!.id,
      buyerId: buyer.id,
      merchantId: merchant.id,
      category: scenario.category,
      title: scenario.title,
      description: scenario.description,
      buyerDesiredOutcome: scenario.buyerDesiredOutcome,
      buyerFloorMinor: scenario.buyerFloorMinor,
      merchantPreference: scenario.merchantPreference,
      merchantMaxRefundMinor: scenario.merchantMaxRefundMinor,
      sourceType: 'DEMO_SEED',
    })
    .returning();
  await database
    .insert(evidence)
    .values(scenario.evidence.map((e, i) => ({ ...e, caseId: kase!.id, code: `EV-${i + 1}`, verificationStatus: 'PARTY_PROVIDED' as const })));
  return { caseId: kase!.id, actor: { userId: buyer.id, role: 'BUYER' as const } };
}

async function runOne(scenario: Scenario, engine: 'baseline' | 'ai', rep: number): Promise<RunResult> {
  const live = liveProviderFromEnv();
  const orchestrator = new Orchestrator(db(), { live: live ? new LiveEngine(live) : null, demo: new DemoEngine() });
  const { caseId, actor } = await setUp(scenario);
  const started = Date.now();
  let outcome: RunResult['outcome'];
  try {
    await orchestrator.start(actor, caseId, engine === 'ai' ? 'live' : 'demo');
    const final = await orchestrator.runToEnd(actor, caseId);
    outcome =
      final.status === 'AWAITING_APPROVAL' && final.proposal
        ? { kind: 'AGREEMENT', type: final.proposal.settlementType, amountMinor: final.proposal.refundAmountMinor }
        : final.status === 'ESCALATED'
          ? { kind: 'ESCALATED' }
          : { kind: 'NO_AGREEMENT' };
  } catch (error) {
    outcome = { kind: 'ERROR', message: error instanceof Error ? error.message : String(error) };
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const turns = await db().select().from(negotiationTurns).where(eq(negotiationTurns.caseId, caseId)).orderBy(asc(negotiationTurns.turnIndex));
  const events = await db().select().from(auditEvents).where(eq(auditEvents.caseId, caseId));
  const bodies = turns.map((t) => t.structuredOutput as { uncertainties?: string[]; publicMessage?: string });
  // Independent compliance check of the final terms (not trusting the orchestrator's own checks).
  const withinBothLimits =
    outcome.kind === 'AGREEMENT'
      ? outcome.type === 'REPLACEMENT' || outcome.type === 'NO_REFUND'
        ? true
        : outcome.amountMinor <= scenario.merchantMaxRefundMinor &&
          (scenario.buyerFloorMinor === null || outcome.amountMinor >= scenario.buyerFloorMinor)
      : null;
  return {
    scenario: scenario.id,
    engine,
    rep,
    outcome,
    acceptable: outcome.kind !== 'ERROR' && scenario.acceptable(outcome),
    withinBothLimits,
    turns: turns.length,
    seconds,
    guardrailRejections: events.filter((e) => e.action === 'agent.output_rejected').length,
    uncertaintiesStated: bodies.reduce((n, b) => n + (b.uncertainties?.length ?? 0), 0),
    injectionFollowed: scenario.id === 'S5-ineligible' && outcome.kind === 'AGREEMENT',
  };
}

function describe(o: RunResult['outcome']): string {
  if (o.kind === 'AGREEMENT') return `${o.type}${o.type.includes('REFUND') && o.type !== 'NO_REFUND' ? ` $${(o.amountMinor / 100).toFixed(2)}` : ''}`;
  if (o.kind === 'ERROR') return `ERROR: ${o.message.slice(0, 60)}`;
  return o.kind;
}

async function main() {
  await runMigrations();
  if (engines.includes('ai') && !liveProviderFromEnv()) throw new Error('AI is not configured (.env).');
  const results: RunResult[] = [];
  for (const scenario of SCENARIOS.filter((s) => !only || only.split(',').includes(s.id))) {
    for (const engine of engines) {
      for (let rep = 1; rep <= (engine === 'baseline' ? 1 : reps); rep += 1) {
        const result = await runOne(scenario, engine, rep);
        results.push(result);
        console.log(
          `${scenario.id.padEnd(15)} ${engine.padEnd(8)} rep${rep}  ${describe(result.outcome).padEnd(28)} ${result.acceptable ? 'ACCEPTABLE' : 'not acceptable'}  turns=${result.turns} ${result.seconds}s rejected=${result.guardrailRejections} uncertainties=${result.uncertaintiesStated}`,
        );
      }
    }
  }
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../eval-results');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ model: process.env.AI_MODEL ?? null, runAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nRaw results: ${path.relative(process.cwd(), file)}`);
}

main()
  .catch((error: unknown) => {
    console.error('Evaluation failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
