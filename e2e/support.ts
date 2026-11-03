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

/** Reset the demo data through the API (any signed-in person may in non-production). */
export async function resetDemo(page: Page) {
  await page.goto('/signin');
  const accounts = await page.request.get('/api/auth/demo-accounts');
  const { accounts: list } = (await accounts.json()) as { accounts: { id: string; name: string }[] };
  const alex = list.find((a) => a.name === 'Alex Morgan');
  if (!alex) return;
  const login = await page.request.post('/api/auth/login', { data: { userId: alex.id } });
  const { csrfToken } = (await login.json()) as { csrfToken: string };
  await page.request.post('/api/demo/reset', { headers: { 'X-CSRF-Token': csrfToken } });
}
