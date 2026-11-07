import { type Page, expect } from '@playwright/test';

/** Sign in as a seeded demo person from the sign-in screen. */
export async function signInAs(page: Page, name: string) {
  await page.goto('/signin');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Switch person through the header menu (a real sign-out + sign-in). */
export async function switchTo(page: Page, name: string) {
  await page.locator('header button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  await expect(page.locator('header')).toContainText(name);
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
