import { isMain } from '../is-main.js';
import { closeDb, db } from './index.js';
import { runMigrations } from './migrate.js';
import { resetDemoData, rowCounts } from './seed.js';

/**
 * `pnpm db:reset --yes` — the ONLY command-line way to wipe the database. Without `--yes` it just
 * shows what would be deleted. Refused when NODE_ENV=production. PayPal itself is never touched:
 * sandbox payments and refunds stay in PayPal; only this app's records of them are deleted.
 */
async function main() {
  await runMigrations();
  const database = db();
  const counts = await rowCounts(database);
  const target = new URL(process.env.DATABASE_URL ?? 'postgres://unknown').pathname.slice(1) || 'unknown';
  const summary = `database "${target}": ${counts.users} people, ${counts.cases} cases, ${counts.transactions} transactions (${counts.sandboxTransactions} real PayPal sandbox payments), ${counts.refundAttempts} refund records`;
  if (!process.argv.includes('--yes')) {
    console.log(`This would DELETE everything in ${summary}, then re-create the demo data.`);
    console.log('Nothing was changed. To go ahead, run: pnpm db:reset --yes');
    return;
  }
  await resetDemoData(database);
  console.log(`Deleted everything in ${summary}. Demo data re-created (RA-1042, RA-1043).`);
}

if (isMain(import.meta.url)) {
  main()
    .catch((error: unknown) => {
      console.error('Reset failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
