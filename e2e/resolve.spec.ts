import { expect, test } from '@playwright/test';

import {
  bothApprove,
  negotiateToEnd,
  nextRefund,
  openCase,
  purchaseAndPrepareCase,
  resetDemo,
  signInAs,
  switchTo,
} from './support';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

const AGREED = /Agreement proposed · version 1/;

test('purchase → report → agents agree → both approve → refund → receipt, and it survives a reload', async ({ page }) => {
  const caseUrl = await purchaseAndPrepareCase(page);
  await page.goto(caseUrl);
  await negotiateToEnd(page);
  await expect(page.getByText(AGREED)).toBeVisible({ timeout: 20_000 });

  // One approval is not enough.
  await page.getByRole('button', { name: /Review & approve/ }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Your decision is recorded')).toBeVisible();
  await expect(page.getByText(/Runs automatically once both parties have approved/)).toBeVisible();

  await switchTo(page, 'Alex Morgan');
  await page.goto(`${caseUrl}/settlement`);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Refund completed by PayPal')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('link', { name: /View receipt/ }).click();
  await expect(page.getByText('Settlement receipt')).toBeVisible();
  await expect(page.getByText(/^REF\d+FAKE$/)).toBeVisible();
  await expect(page.getByText('COMPLETED')).toBeVisible();

  await page.reload();
  await expect(page.getByText(/^REF\d+FAKE$/)).toBeVisible();
});

test('insufficient evidence ends with no agreement and no payment', async ({ page }) => {
  await signInAs(page, 'Priya Nair');
  await openCase(page, 'RA-1043');
  await negotiateToEnd(page);
  await expect(page.getByText(/No agreement reached|Escalated to a person/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('No money moved.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Review & approve/ })).toHaveCount(0);
});

test('the demo operator can watch but cannot act for either party', async ({ page }) => {
  await signInAs(page, 'Demo Operator');
  const id = await openCase(page, 'RA-1042');
  await page.goto(`/cases/${id}/negotiate`);
  await expect(page.getByText('The demo operator can watch but not act')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start negotiation' })).toHaveCount(0);
});

test('seeded demo data never pretends to refund', async ({ page }) => {
  await signInAs(page, 'Alex Morgan');
  const id = await openCase(page, 'RA-1042');
  await expect(page.getByText('Demo data').first()).toBeVisible();
  await negotiateToEnd(page);
  await expect(page.getByText(AGREED)).toBeVisible({ timeout: 20_000 });
  await page.goto(`/cases/${id}/settlement`);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await switchTo(page, 'Jordan Ellis');
  await page.goto(`/cases/${id}/settlement`);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText(/Your decision is recorded|approved/i).first()).toBeVisible();
  await expect(page.getByText('Refund completed by PayPal')).toHaveCount(0);
  const receipt = await (await page.request.get(`/api/cases/${id}/receipt`)).json();
  expect(receipt.refund).toBeNull();
});

test('a rejection ends the negotiation with no money moved', async ({ page }) => {
  await signInAs(page, 'Alex Morgan');
  const id = await openCase(page, 'RA-1042');
  await negotiateToEnd(page);
  await expect(page.getByText(AGREED)).toBeVisible({ timeout: 20_000 });
  await page.goto(`/cases/${id}/settlement`);
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('button', { name: 'Confirm reject' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/cases/${id}/settlement`)).json()).caseStatus).toBe('NO_AGREEMENT');
});

test('a revision request reopens the negotiation and needs fresh approval of new terms', async ({ page }) => {
  await signInAs(page, 'Alex Morgan');
  const id = await openCase(page, 'RA-1042');
  await negotiateToEnd(page);
  await expect(page.getByText(AGREED)).toBeVisible({ timeout: 20_000 });
  await page.goto(`/cases/${id}/settlement`);
  await page.getByRole('button', { name: 'Request revision' }).click();
  await page.getByLabel(/note|why|what/i).fill('Please reconsider the amount.');
  await page.getByRole('button', { name: 'Send revision request' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/cases/${id}/settlement`)).json()).caseStatus).toBe('IN_NEGOTIATION');
  await page.goto(`/cases/${id}/negotiate`);
  await page.getByRole('button', { name: 'Run to a result' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/cases/${id}/settlement`)).json()).proposal?.proposalVersion, { timeout: 20_000 }).toBe(2);
  const after = await (await page.request.get(`/api/cases/${id}/settlement`)).json();
  expect(after.approvals.filter((a: { validForCurrentTerms: boolean; decision: string }) => a.decision === 'APPROVE')).toHaveLength(0);
});

test('negotiation waits for the merchant, whose limit then binds the result and stays private', async ({ page }) => {
  await signInAs(page, 'Alex Morgan');
  await page.getByRole('link', { name: 'Sandbox purchase' }).click();
  await page.getByRole('button', { name: 'Pay with PayPal sandbox' }).click();
  await expect(page.getByRole('heading', { name: 'Payment captured by PayPal sandbox' })).toBeVisible();
  await page.getByRole('link', { name: 'Report a problem with this order' }).click();
  await page.getByRole('button', { name: /missing jacket/ }).click();
  await page.getByRole('button', { name: 'Open case' }).click();
  await expect(page.getByRole('heading', { name: /The missing jacket/ })).toBeVisible();
  const caseUrl = page.url();
  const id = caseUrl.split('/').at(-1) as string;

  // Too early: the merchant has not confirmed anything.
  await page.goto(`${caseUrl}/negotiate`);
  await page.getByRole('button', { name: 'Start negotiation' }).click();
  await expect(page.getByText(/merchant has not confirmed/i)).toBeVisible();

  // The buyer never sees the merchant's limit, in the page or in the API.
  await page.goto(caseUrl);
  await expect(page.getByText('Most we would refund')).toHaveCount(0);
  const asBuyer = await (await page.request.get(`/api/cases/${id}`)).json();
  expect(asBuyer.case.merchantMaxRefundMinor).toBeNull();

  await switchTo(page, 'Jordan Ellis');
  await page.goto(caseUrl);
  await page.getByLabel('Most we would refund (USD)').fill('100.00');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  const asMerchant = await (await page.request.get(`/api/cases/${id}`)).json();
  expect(asMerchant.case.buyerFloorMinor).toBeNull();

  await negotiateToEnd(page);
  await expect(page.getByText(/Agreement proposed|No agreement reached|Escalated to a person/).first()).toBeVisible({ timeout: 20_000 });
  const settlement = await (await page.request.get(`/api/cases/${id}/settlement`)).json();
  if (settlement.proposal) expect(settlement.proposal.refundAmountMinor).toBeLessThanOrEqual(10000);
});

test('repeating the capture return or the refund request never pays twice', async ({ page }) => {
  await signInAs(page, 'Alex Morgan');
  await page.getByRole('link', { name: 'Sandbox purchase' }).click();
  await page.getByRole('button', { name: 'Pay with PayPal sandbox' }).click();
  await expect(page.getByRole('heading', { name: 'Payment captured by PayPal sandbox' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Payment captured by PayPal sandbox' })).toBeVisible();
  const { transactions } = await (await page.request.get('/api/transactions')).json();
  expect(transactions.filter((t: { sourceType: string }) => t.sourceType === 'PAYPAL_SANDBOX')).toHaveLength(1);
  await switchTo(page, 'Demo Operator');
  await resetDemo(page);

  const caseUrl = await purchaseAndPrepareCase(page);
  const id = caseUrl.split('/').at(-1) as string;
  await page.goto(caseUrl);
  await negotiateToEnd(page);
  await expect(page.getByText(AGREED)).toBeVisible({ timeout: 20_000 });
  await bothApprove(page, caseUrl);
  await expect(page.getByText('Refund completed by PayPal')).toBeVisible({ timeout: 20_000 });

  const before = await (await page.request.get(`/api/cases/${id}/settlement`)).json();
  const me = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'X-CSRF-Token': me.csrfToken as string };
  await Promise.all([1, 2, 3].map(() => page.request.post('/api/paypal/refunds/execute', { headers, data: { caseId: id } })));
  const after = await (await page.request.get(`/api/cases/${id}/settlement`)).json();
  expect(after.transaction.refundedMinor).toBe(before.transaction.refundedMinor);
  expect(after.refund.paypalRefundId).toBe(before.refund.paypalRefundId);
});

test('a PayPal timeout is shown as unconfirmed, then reconciled without a second refund', async ({ page }) => {
  const caseUrl = await purchaseAndPrepareCase(page);
  const id = caseUrl.split('/').at(-1) as string;
  await page.goto(caseUrl);
  await negotiateToEnd(page);
  await expect(page.getByText(AGREED)).toBeVisible({ timeout: 20_000 });
  nextRefund('timeout');
  await bothApprove(page, caseUrl);
  const check = page.getByRole('button', { name: 'Check with PayPal' });
  await expect(check).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Refund completed by PayPal')).toHaveCount(0);
  const unknown = await (await page.request.get(`/api/cases/${id}/settlement`)).json();
  expect(unknown.refund.status).toBe('UNKNOWN_REQUIRES_RECONCILIATION');
  expect(unknown.transaction.refundedMinor).toBe(0);

  await check.click();
  await expect(page.getByText('Refund completed by PayPal')).toBeVisible({ timeout: 20_000 });
  const done = await (await page.request.get(`/api/cases/${id}/settlement`)).json();
  expect(done.transaction.refundedMinor).toBe(unknown.refund.amountMinor);
});

test('a pending refund is never shown as completed', async ({ page }) => {
  const caseUrl = await purchaseAndPrepareCase(page);
  const id = caseUrl.split('/').at(-1) as string;
  await page.goto(caseUrl);
  await negotiateToEnd(page);
  await expect(page.getByText(AGREED)).toBeVisible({ timeout: 20_000 });
  nextRefund('pending');
  await bothApprove(page, caseUrl);
  await expect(page.getByRole('button', { name: 'Check with PayPal' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Refund completed by PayPal')).toHaveCount(0);
  const receipt = await (await page.request.get(`/api/cases/${id}/receipt`)).json();
  expect(receipt.refund.status).toBe('PENDING');
  expect(receipt.refund.verifiedByPayPal).toBe(false);
});

test('when PayPal refuses a refund the case reopens and no money is recorded', async ({ page }) => {
  const caseUrl = await purchaseAndPrepareCase(page);
  const id = caseUrl.split('/').at(-1) as string;
  await page.goto(caseUrl);
  await negotiateToEnd(page);
  await expect(page.getByText(AGREED)).toBeVisible({ timeout: 20_000 });
  nextRefund('rejected');
  await bothApprove(page, caseUrl);
  await expect.poll(async () => (await (await page.request.get(`/api/cases/${id}/settlement`)).json()).caseStatus, { timeout: 20_000 }).toBe('IN_NEGOTIATION');
  const after = await (await page.request.get(`/api/cases/${id}/settlement`)).json();
  expect(after.refund.status).toBe('FAILED');
  expect(after.transaction.refundedMinor).toBe(0);
});

test('API failures are explained to the person, not hidden', async ({ page }) => {
  await signInAs(page, 'Alex Morgan');
  await page.getByRole('link', { name: 'Sandbox purchase' }).click();
  await page.route('**/api/paypal/orders', (route) =>
    route.fulfill({ status: 502, json: { error: { code: 'paypal_server_error', message: 'PayPal is not responding right now.' } } }),
  );
  await page.getByRole('button', { name: 'Pay with PayPal sandbox' }).click();
  await expect(page.getByText('PayPal is not responding right now.')).toBeVisible();

  const id = await openCase(page, 'RA-1042');
  await page.route('**/negotiate/start', (route) =>
    route.fulfill({ status: 429, json: { error: { code: 'rate_limited', message: 'Too many negotiation requests. Wait a minute.' } } }),
  );
  await page.goto(`/cases/${id}/negotiate`);
  await page.getByRole('button', { name: 'Start negotiation' }).click();
  await expect(page.getByText('Too many negotiation requests. Wait a minute.')).toBeVisible();
});

test('switching person changes the real session and what that person may do', async ({ page }) => {
  await signInAs(page, 'Alex Morgan');
  const id = await openCase(page, 'RA-1042');
  expect((await (await page.request.get('/api/auth/me')).json()).user.role).toBe('BUYER');
  await switchTo(page, 'Jordan Ellis');
  expect((await (await page.request.get('/api/auth/me')).json()).user.role).toBe('MERCHANT');
  await switchTo(page, 'Priya Nair');
  expect((await (await page.request.get('/api/auth/me')).json()).user.role).toBe('BUYER');
  expect((await page.request.get(`/api/cases/${id}`)).status()).toBe(404);
});
