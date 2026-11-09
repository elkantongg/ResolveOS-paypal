import { config, paypalConfigured } from '../config.js';
import { WEBHOOK_EVENT_TYPES } from '../payments/webhooks.js';

/**
 * `pnpm paypal:webhook https://your-site` registers this app's webhook with the PayPal sandbox app
 * (or finds the existing one) and prints the id to set as PAYPAL_WEBHOOK_ID. Prints nothing secret.
 */
const BASE = 'https://api-m.sandbox.paypal.com';

async function main() {
  const c = config();
  const site = process.argv[2];
  if (!paypalConfigured(c) || !site || !site.startsWith('https://')) {
    console.log('Usage: pnpm paypal:webhook https://your-site (needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET).');
    process.exitCode = 1;
    return;
  }
  const url = `${new URL(site).origin}/api/paypal/webhooks`;
  const basic = Buffer.from(`${c.PAYPAL_CLIENT_ID}:${c.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const auth = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!auth.ok) throw new Error(`PayPal sign-in failed (${auth.status}).`);
  const { access_token: token } = (await auth.json()) as { access_token: string };
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const list = await fetch(`${BASE}/v1/notifications/webhooks`, { headers });
  if (!list.ok) throw new Error(`Could not list webhooks (${list.status}).`);
  const { webhooks } = (await list.json()) as { webhooks: { id: string; url: string }[] };
  const existing = webhooks.find((w) => w.url === url);
  if (existing) {
    console.log(`Already registered. PAYPAL_WEBHOOK_ID=${existing.id}`);
    return;
  }
  const created = await fetch(`${BASE}/v1/notifications/webhooks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, event_types: WEBHOOK_EVENT_TYPES.map((name) => ({ name })) }),
  });
  if (!created.ok) throw new Error(`PayPal refused the webhook (${created.status}): ${await created.text()}`);
  console.log(`Registered ${url}\nPAYPAL_WEBHOOK_ID=${((await created.json()) as { id: string }).id}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
