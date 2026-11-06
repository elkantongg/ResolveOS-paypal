import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetConfig } from '../src/config.js';
import { closeDb, db } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { cases, merchants, transactions, users } from '../src/db/schema.js';
import { DEMO, resetDemoData, seedIfEmpty } from '../src/db/seed.js';
import { FakePayPal, makeFullApp, signIn } from './helpers.js';

beforeEach(async () => {
  resetConfig();
  await runMigrations();
  await resetDemoData(db());
});

afterAll(async () => {
  await closeDb();
});

describe('seeding never destroys data', () => {
  it('db:seed on a database that already has data changes nothing', async () => {
    const merchant = await db().query.merchants.findFirst();
    const buyer = await db().query.users.findFirst({ where: eq(users.email, DEMO.buyer.email) });
    const [real] = await db()
      .insert(transactions)
      .values({
        merchantId: merchant!.id,
        buyerId: buyer!.id,
        description: 'A real sandbox payment',
        paypalOrderId: 'ORDKEEP1',
        paypalCaptureId: 'CAPKEEP1',
        originalAmountMinor: 18000,
        currency: 'USD',
        paymentStatus: 'CAPTURED',
        sourceType: 'PAYPAL_SANDBOX',
      })
      .returning();
    const result = await seedIfEmpty(db());
    expect(result.seeded).toBe(false);
    expect(await db().query.transactions.findFirst({ where: eq(transactions.id, real!.id) })).toBeTruthy();
  });

  it('db:seed fills an empty database', async () => {
    await db().delete(cases);
    await db().delete(transactions);
    await db().delete(merchants);
    await db().delete(users);
    const result = await seedIfEmpty(db());
    expect(result.seeded).toBe(true);
    expect(await db().query.cases.findFirst({ where: eq(cases.reference, 'RA-1042') })).toBeTruthy();
  });
});

describe('the in-app demo reset is explicit', () => {
  it('requires the operator AND an explicit confirmation, and reports what it deleted', async () => {
    const { app } = makeFullApp(new FakePayPal());
    const operatorId = (await db().query.users.findFirst({ where: eq(users.email, DEMO.operator.email) }))!.id;
    const operator = await signIn(app, operatorId);
    const missing = await operator.post('/api/demo/reset', {}).expect(400);
    expect(missing.body.error.code).toBe('confirmation_required');
    const done = await operator.post('/api/demo/reset', { confirm: 'RESET' }).expect(200);
    expect(done.body.deleted).toMatchObject({ cases: 2 });
  });
});
