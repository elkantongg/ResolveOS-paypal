import { randomUUID } from 'node:crypto';

import { config } from '../config.js';
import { formatMoney } from '../money.js';
import { HttpPayPalGateway, PayPalError } from '../paypal/client.js';

/**
 * `pnpm paypal:prove order`            create a real $180.00 sandbox order and print its approval link
 * `pnpm paypal:prove finish <orderId>` capture it, refund $90.00 of it, and read the refund back
 *
 * Exercises the exact client the app uses, against the real PayPal sandbox, with no database:
 * proof that checkout → capture → partial refund works before the UI exists. Uses sandbox money only.
 */
async function main() {
  const [command, orderId] = process.argv.slice(2);
  const paypal = new HttpPayPalGateway();
  const c = config();

  if (command === 'order') {
    const order = await paypal.createOrder({
      amountMinor: 18000,
      currency: 'USD',
      referenceId: `prove-${Date.now()}`,
      description: 'Everyday Jacket (Resolve AI proof)',
      requestId: `resolve-prove-order-${randomUUID()}`,
      returnUrl: `${c.FRONTEND_URL}/checkout/return`,
      cancelUrl: `${c.FRONTEND_URL}/checkout/cancel`,
    });
    console.log(`Order ${order.orderId} created for ${formatMoney(18000, 'USD')} (${order.status}).`);
    console.log('\n1. Open this link and log in with your SANDBOX PERSONAL account, then click Pay:');
    console.log(`   ${order.approveUrl}`);
    console.log('2. PayPal then redirects to localhost:5173, which is not running yet. That error page is fine.');
    console.log(`3. Run:  pnpm paypal:prove finish ${order.orderId}`);
    return;
  }

  if (command === 'finish' && orderId) {
    const capture = await paypal.captureOrder(orderId, `resolve-prove-capture-${orderId}`);
    console.log(
      `✓ Captured ${formatMoney(capture.amountMinor, capture.currency)}: capture ${capture.captureId} (${capture.captureStatus}), payer ${capture.payerEmail ?? 'unknown'}`,
    );
    const requestId = `resolve-prove-refund-${capture.captureId}`;
    const refund = await paypal.refundCapture({
      captureId: capture.captureId,
      amountMinor: 9000,
      currency: capture.currency,
      requestId,
      invoiceId: `PROVE-${capture.captureId}`,
      noteToPayer: 'Resolve AI proof: partial settlement refund',
    });
    console.log(
      `✓ Refunded ${refund.amountMinor === null ? '?' : formatMoney(refund.amountMinor, capture.currency)}: refund ${refund.refundId} (${refund.status})`,
    );
    const again = await paypal.refundCapture({
      captureId: capture.captureId,
      amountMinor: 9000,
      currency: capture.currency,
      requestId,
      invoiceId: `PROVE-${capture.captureId}`,
      noteToPayer: 'Resolve AI proof: partial settlement refund',
    });
    console.log(
      `✓ Same PayPal-Request-Id sent again → PayPal returned refund ${again.refundId} ${again.refundId === refund.refundId ? '(the SAME refund: no double refund)' : '(DIFFERENT: idempotency did not hold!)'}`,
    );
    const lookedUp = await paypal.getRefund(refund.refundId);
    const after = await paypal.getCapture(capture.captureId);
    console.log(`✓ Refund lookup: ${lookedUp.refundId} is ${lookedUp.status}; capture is now ${after.status}`);
    return;
  }

  console.log('Usage: pnpm paypal:prove order | pnpm paypal:prove finish <orderId>');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (error instanceof PayPalError) {
    console.error(`✗ ${error.kind}: ${error.message}${error.debugId ? ` (debug id ${error.debugId})` : ''}`);
  } else console.error('✗', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
