import { config, paypalConfigured } from '../config.js';
import { HttpPayPalGateway, PayPalError } from '../paypal/client.js';

/**
 * `pnpm paypal:check` — proves the sandbox credentials work by getting a real OAuth token and
 * creating (not paying) a real $1.00 sandbox order. Prints nothing secret.
 */
async function main() {
  const c = config();
  if (!paypalConfigured(c)) {
    console.log('PayPal sandbox is NOT configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env.');
    process.exitCode = 1;
    return;
  }
  const paypal = new HttpPayPalGateway();
  await paypal.checkCredentials();
  console.log('✓ OAuth: PayPal sandbox accepted the client credentials.');
  const order = await paypal.createOrder({
    amountMinor: 100,
    currency: 'USD',
    referenceId: 'paypal-check',
    description: 'Resolve AI credentials check',
    requestId: `resolve-check-${Date.now()}`,
    returnUrl: `${c.FRONTEND_URL}/checkout/return`,
    cancelUrl: `${c.FRONTEND_URL}/checkout/cancel`,
  });
  console.log(`✓ Orders API: created sandbox order ${order.orderId} (status ${order.status}).`);
  console.log(`  It is not paid; nothing else happens unless a sandbox buyer approves it:`);
  console.log(`  ${order.approveUrl ?? '(no approval link returned)'}`);
  console.log(`Webhook ID ${c.PAYPAL_WEBHOOK_ID ? 'is set' : 'is NOT set (webhooks will be rejected)'}.`);
}

main().catch((error: unknown) => {
  if (error instanceof PayPalError) console.error(`✗ ${error.kind}: ${error.message}`);
  else console.error('✗', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
