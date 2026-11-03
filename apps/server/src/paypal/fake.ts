import {
  type CaptureDetails,
  type CaptureResult,
  type CreatedOrder,
  PayPalError,
  type PayPalGateway,
  type RefundResult,
} from './client.js';

/**
 * A deterministic stand-in for PayPal, used ONLY by automated tests (unit tests and the Playwright
 * suite with PAYPAL_ADAPTER=mock). It behaves like the real API where it matters: a repeated
 * PayPal-Request-Id returns the original result instead of refunding again. The app refuses to use
 * it in production, and /api/paypal/status reports it as "mock" so it is never mistaken for PayPal.
 *
 * "Approving" a mock order sends the browser straight to the return URL, as PayPal would after a
 * buyer approves.
 */
export class FakePayPal implements PayPalGateway {
  readonly mock = true;
  constructor(private readonly returnUrl = `https://sandbox.paypal.test/approve`) {}
  configured = true;
  refundCalls: { captureId: string; amountMinor: number | null; requestId: string }[] = [];
  /** Next refund call(s) behave like this, then normal. */
  refundMode: 'ok' | 'pending' | 'timeout' | 'rejected' | 'server_error' = 'ok';
  /** When true, a timed-out refund was in fact processed by "PayPal". */
  timeoutButProcessed = true;
  private orders = new Map<string, { amountMinor: number; currency: string; captured?: CaptureResult }>();
  private refundsByRequest = new Map<string, RefundResult>();
  private counter = 0;

  isConfigured() {
    return this.configured;
  }
  async checkCredentials() {
    if (!this.configured) throw new PayPalError('not_configured', 'no creds');
  }
  async createOrder(input: { amountMinor: number; currency: string; returnUrl?: string }): Promise<CreatedOrder> {
    const orderId = `ORDER${++this.counter}FAKE`;
    this.orders.set(orderId, { amountMinor: input.amountMinor, currency: input.currency });
    return { orderId, status: 'PAYER_ACTION_REQUIRED', approveUrl: `${input.returnUrl ?? this.returnUrl}?token=${orderId}&PayerID=MOCKPAYER` };
  }
  async captureOrder(orderId: string): Promise<CaptureResult> {
    const order = this.orders.get(orderId);
    if (!order) throw new PayPalError('rejected', 'not found', 404, 'INVALID_RESOURCE_ID');
    order.captured ??= {
      orderId,
      orderStatus: 'COMPLETED',
      captureId: `CAP${++this.counter}FAKE`,
      captureStatus: 'COMPLETED',
      amountMinor: order.amountMinor,
      currency: order.currency,
      payerEmail: 'buyer@sandbox.test',
    };
    return order.captured;
  }
  async getCapture(captureId: string): Promise<CaptureDetails> {
    return { captureId, status: 'COMPLETED', amountMinor: 18000, currency: 'USD' };
  }
  async refundCapture(input: {
    captureId: string;
    amountMinor: number | null;
    requestId: string;
  }): Promise<RefundResult> {
    this.refundCalls.push({ captureId: input.captureId, amountMinor: input.amountMinor, requestId: input.requestId });
    const previous = this.refundsByRequest.get(input.requestId);
    if (previous) return previous;
    const mode = this.refundMode;
    this.refundMode = 'ok';
    if (mode === 'rejected') throw new PayPalError('rejected', 'PayPal 422 REFUND_AMOUNT_EXCEEDED', 422, 'REFUND_AMOUNT_EXCEEDED');
    if (mode === 'server_error') throw new PayPalError('server_error', 'PayPal 503', 503);
    const result: RefundResult = {
      refundId: `REF${++this.counter}FAKE`,
      status: mode === 'pending' ? 'PENDING' : 'COMPLETED',
      amountMinor: input.amountMinor ?? 18000,
      currency: 'USD',
    };
    if (mode === 'timeout') {
      if (this.timeoutButProcessed) this.refundsByRequest.set(input.requestId, result);
      throw new PayPalError('outcome_unknown', 'No answer from PayPal');
    }
    this.refundsByRequest.set(input.requestId, result);
    return result;
  }
  async getRefund(refundId: string): Promise<RefundResult> {
    for (const refund of this.refundsByRequest.values()) {
      if (refund.refundId === refundId) return { ...refund, status: 'COMPLETED' };
    }
    throw new PayPalError('rejected', 'not found', 404);
  }
}
