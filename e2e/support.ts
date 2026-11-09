import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Page, expect } from '@playwright/test';

/** Sign in as a seeded demo person from the sign-in screen. */
export async function signInAs(page: Page, name: string) {
  await page.goto('/signin');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Switch person through the header menu (a real sign-out + sign-in). */
export async function switchTo(page: Page, name: string) {
  await page.getByRole('banner').locator('button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  await expect(page.getByRole('banner')).toContainText(name);
}

/** Reset the demo data through the API, as the demo operator (the only role allowed to). */
export async function resetDemo(page: Page) {
  await page.goto('/signin');
  const accounts = await page.request.get('/api/auth/demo-accounts');
  const { accounts: list } = (await accounts.json()) as { accounts: { id: string; name: string }[] };
  const operator = list.find((a) => a.name === 'Demo Operator');
  if (!operator) return;
  const login = await page.request.post('/api/auth/login', { data: { userId: operator.id } });
  const { csrfToken } = (await login.json()) as { csrfToken: string };
  await page.request.post('/api/demo/reset', { headers: { 'X-CSRF-Token': csrfToken }, data: { confirm: 'RESET' } });
}

/** Opens a case the signed-in person can see, by its reference. */
export async function openCase(page: Page, reference: string) {
  const res = await page.request.get('/api/cases');
  const { cases } = (await res.json()) as { cases: { id: string; reference: string }[] };
  const found = cases.find((c) => c.reference === reference);
  expect(found, `case ${reference} is visible to this person`).toBeTruthy();
  await page.goto(`/cases/${found!.id}`);
  return found!.id;
}

/** Makes the mock PayPal's next refund behave this way (it is the only way a test reaches inside it). */
export function nextRefund(mode: 'timeout' | 'rejected' | 'pending') {
  writeFileSync(join(tmpdir(), 'resolve-e2e-paypal-mode'), mode);
}

/** Mock purchase → case → merchant evidence and limit. Leaves the merchant signed in on the case page. */
export async function purchaseAndPrepareCase(page: Page, limit = '120.00') {
  await signInAs(page, 'Alex Morgan');
  await expect(page.getByRole('banner')).toContainText('Mock PayPal');
  await page.getByRole('link', { name: 'Sandbox purchase' }).click();
  await page.getByRole('button', { name: 'Pay with PayPal sandbox' }).click();
  await expect(page.getByRole('heading', { name: 'Payment captured by PayPal sandbox' })).toBeVisible();
  await expect(page.getByText('$180.00').first()).toBeVisible();

  await page.getByRole('link', { name: 'Report a problem with this order' }).click();
  await page.getByRole('button', { name: /missing jacket/ }).click();
  await page.getByRole('button', { name: 'Open case' }).click();
  await expect(page.getByRole('heading', { name: /The missing jacket/ })).toBeVisible();
  await expect(page.getByText('Verified from PayPal').first()).toBeVisible();
  const url = page.url();

  await switchTo(page, 'Jordan Ellis');
  await page.goto(url);
  await page.getByRole('button', { name: 'Add evidence' }).click();
  await page.getByRole('button', { name: 'Demo tracking record' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Carrier tracking TRK-102').first()).toBeVisible();
  await page.getByLabel('Most we would refund (USD)').fill(limit);
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  return url;
}

/** From a case page, run the demo engine until it stops. */
export async function negotiateToEnd(page: Page) {
  await page.goto(`${page.url().replace(/\/(negotiate|settlement|receipt)$/, '')}/negotiate`);
  await expect(page.getByRole('radio', { name: 'Demo engine' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Start negotiation' }).click();
  await expect(page.getByLabel('Turn 1, buyer agent')).toBeVisible();
  await page.getByRole('button', { name: 'Run to a result' }).click();
}

/** The merchant approves, then the buyer does; the second approval runs the refund. */
export async function bothApprove(page: Page, caseUrl: string) {
  await page.goto(`${caseUrl}/settlement`);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Your decision is recorded')).toBeVisible();
  await switchTo(page, 'Alex Morgan');
  await page.goto(`${caseUrl}/settlement`);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
}
