import { expect, test } from '@playwright/test';

import { resetDemo, signInAs, switchTo } from './support';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test('purchase → report → agents agree → both approve → refund → receipt', async ({ page }) => {
  // 1. The buyer makes a (mock-PayPal) purchase and comes back captured.
  await signInAs(page, 'Alex Morgan');
  await expect(page.locator('header')).toContainText('Mock PayPal');
  await page.getByRole('link', { name: 'Sandbox purchase' }).click();
  await page.getByRole('button', { name: 'Pay with PayPal sandbox' }).click();
  await expect(page.getByRole('heading', { name: 'Payment captured by PayPal sandbox' })).toBeVisible();
  await expect(page.getByText('$180.00').first()).toBeVisible();

  // 2. Report the problem.
  await page.getByRole('link', { name: 'Report a problem with this order' }).click();
  await page.getByRole('button', { name: /missing jacket/ }).click();
  await page.getByRole('button', { name: 'Open case' }).click();
  await expect(page.getByRole('heading', { name: /The missing jacket/ })).toBeVisible();
  await expect(page.getByText('Verified from PayPal')).toBeVisible();

  // 3. The merchant adds a tracking record and sets a private limit.
  await switchTo(page, 'Jordan Ellis');
  await page.getByRole('button', { name: 'Add evidence' }).click();
  await page.getByRole('button', { name: 'Demo tracking record' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Carrier tracking TRK-102').first()).toBeVisible();
  await page.getByLabel('Most we would refund (USD)').fill('120.00');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  // 4. Negotiate with the deterministic demo engine until it stops.
  await page.getByRole('link', { name: 'Open Negotiation Room' }).click();
  await expect(page.getByRole('radio', { name: 'Demo engine' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Start negotiation' }).click();
  await expect(page.getByLabel('Turn 1, buyer agent')).toBeVisible();
  await page.getByRole('button', { name: 'Run to a result' }).click();
  await expect(page.getByText(/Agreement proposed · version 1/)).toBeVisible({ timeout: 20_000 });

  // 5. One approval is not enough; the second one runs the refund.
  await page.getByRole('button', { name: /Review & approve/ }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Your decision is recorded')).toBeVisible();
  await expect(page.getByText(/Runs automatically once both parties have approved/)).toBeVisible();

  await switchTo(page, 'Alex Morgan');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Refund completed by PayPal')).toBeVisible({ timeout: 20_000 });

  // 6. Receipt with the refund id.
  await page.getByRole('link', { name: /View receipt/ }).click();
  await expect(page.getByText('Settlement receipt')).toBeVisible();
  await expect(page.getByText(/^REF\d+FAKE$/)).toBeVisible();
  await expect(page.getByText('COMPLETED')).toBeVisible();

  // 7. Persisted: a reload shows the same resolved state.
  await page.reload();
  await expect(page.getByText(/^REF\d+FAKE$/)).toBeVisible();
});

test('insufficient evidence ends with no agreement and no payment', async ({ page }) => {
  await signInAs(page, 'Priya Nair');
  await page.getByRole('link', { name: /RA-1043/ }).click();
  await page.getByRole('link', { name: 'Open Negotiation Room' }).click();
  await page.getByRole('button', { name: 'Start negotiation' }).click();
  await expect(page.getByLabel('Turn 1, buyer agent')).toBeVisible();
  await page.getByRole('button', { name: 'Run to a result' }).click();
  await expect(page.getByText(/No agreement reached|Escalated to a person/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('No money moved.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Review & approve/ })).toHaveCount(0);
});

test('the demo operator can watch but cannot act for either party', async ({ page }) => {
  await signInAs(page, 'Demo Operator');
  await page.getByRole('link', { name: /RA-1042/ }).click();
  await page.getByRole('link', { name: 'Open Negotiation Room' }).click();
  await expect(page.getByText('The demo operator can watch but not act')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start negotiation' })).toHaveCount(0);
});

test('seeded demo data never pretends to refund', async ({ page }) => {
  await signInAs(page, 'Alex Morgan');
  await page.getByRole('link', { name: /RA-1042/ }).click();
  await expect(page.getByText('Demo data').first()).toBeVisible();
  await expect(page.getByText(/Seeded demo data: negotiation works, but no real refund can run on it/)).toBeVisible();
});
