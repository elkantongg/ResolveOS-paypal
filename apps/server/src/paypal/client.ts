import { PAYPAL_SANDBOX_API, config, paypalConfigured } from '../config.js';
import { fromPayPalValue, toPayPalValue } from '../money.js';

/**
 * A thin, typed client for the PayPal REST endpoints ResolveOS uses (sandbox only):
 *
 *   POST /v1/oauth2/token                          client-credentials access token
 *   POST /v2/checkout/orders                       create an order (intent CAPTURE)
 *   GET  /v2/checkout/orders/{id}                  show an order
 *   POST /v2/checkout/orders/{id}/capture          capture an approved order
 *   GET  /v2/payments/captures/{id}                show a capture
 *   POST /v2/payments/captures/{id}/refund         refund a capture (full: empty body)
 *   GET  /v2/payments/refunds/{id}                 show a refund
 *
 * Every POST that moves money carries a `PayPal-Request-Id`, so retrying the same logical
 * operation returns the original result instead of repeating it. A timeout or a dropped connection
 * is reported as `outcome_unknown`, never as a failure: the money may already have moved.
 */

export type PayPalErrorKind =
  | 'not_configured'
  | 'auth_failed'
  | 'rejected' // PayPal answered with a 4xx: the request was refused, nothing happened
  | 'server_error' // PayPal answered with a 5xx: retry with the same request id
  | 'outcome_unknown'; // timeout / network: we do not know whether it happened

export class PayPalError extends Error {
  constructor(
    readonly kind: PayPalErrorKind,
    message: string,
    readonly status?: number,
    /** PayPal's `details[0].issue`, e.g. CAPTURE_FULLY_REFUNDED, REFUND_AMOUNT_EXCEEDED. */
    readonly issue?: string,
    readonly debugId?: string,
  ) {
    super(message);
    this.name = 'PayPalError';
  }
}

export interface CreatedOrder {
  orderId: string;
  status: string;
  approveUrl: string | null;
}

export interface CaptureResult {
  orderId: string;
  orderStatus: string;
  captureId: string;
  captureStatus: string;
  amountMinor: number;
  currency: string;
  payerEmail: string | null;
}

export interface RefundResult {
  refundId: string;
  /** COMPLETED, PENDING, CANCELLED or FAILED. */
  status: string;
  amountMinor: number | null;
  currency: string | null;
  /** The capture this refund belongs to, from PayPal's `up` link. */
  captureId?: string | null;
}

export interface CaptureDetails {
  captureId: string;
  status: string;
  amountMinor: number;
  currency: string;
}

/** What the rest of the app depends on, so tests can supply a deterministic fake. */
export interface PayPalGateway {
  isConfigured(): boolean;
  checkCredentials(): Promise<void>;
  createOrder(input: {
    amountMinor: number;
    currency: string;
    referenceId: string;
    description: string;
    requestId: string;
    /** Where PayPal sends the buyer after approving / cancelling (our frontend). */
    returnUrl: string;
    cancelUrl: string;
  }): Promise<CreatedOrder>;
  captureOrder(orderId: string, requestId: string): Promise<CaptureResult>;
  getCapture(captureId: string): Promise<CaptureDetails>;
  refundCapture(input: {
    captureId: string;
    /** null = full refund (PayPal's empty-body semantics). */
    amountMinor: number | null;
    currency: string;
    requestId: string;
    invoiceId: string;
    noteToPayer: string;
  }): Promise<RefundResult>;
  getRefund(refundId: string): Promise<RefundResult>;
}

const TIMEOUT_MS = 20_000;

interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: { issue?: string; description?: string }[];
  error?: string;
  error_description?: string;
}

export class HttpPayPalGateway implements PayPalGateway {
  private token: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    private readonly base = PAYPAL_SANDBOX_API,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return paypalConfigured();
  }

  private credentials(): { id: string; secret: string } {
    const c = config();
    if (!c.PAYPAL_CLIENT_ID || !c.PAYPAL_CLIENT_SECRET) {
      throw new PayPalError(
        'not_configured',
        'PayPal sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.',
      );
    }
    return { id: c.PAYPAL_CLIENT_ID, secret: c.PAYPAL_CLIENT_SECRET };
  }

  /** A cached access token, refreshed a minute before PayPal's stated expiry. */
  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.token.expiresAt) return this.token.value;
    this.tokenRequest ??= this.fetchToken().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async fetchToken(): Promise<string> {
    const { id, secret } = this.credentials();
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PayPalError('outcome_unknown', 'Could not reach PayPal to sign in.');
    }
    const body = (await response.json().catch(() => ({}))) as PayPalErrorBody & {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !body.access_token) {
      throw new PayPalError(
        'auth_failed',
        response.status === 401
          ? 'PayPal rejected the sandbox client ID or secret.'
          : `PayPal sign-in failed (${response.status}).`,
        response.status,
      );
    }
    const lifetimeMs = Math.max(60, Number(body.expires_in ?? 300) - 60) * 1000;
    this.token = { value: body.access_token, expiresAt: Date.now() + lifetimeMs };
    return body.access_token;
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; requestId?: string; retryAuth?: boolean } = {},
  ): Promise<T> {
    const token = await this.accessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    if (options.requestId) headers['PayPal-Request-Id'] = options.requestId;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PayPalError(
        'outcome_unknown',
        `No answer from PayPal for ${method} ${path}. The result is unknown and must be reconciled.`,
      );
    }
    if (response.status === 401 && options.retryAuth !== false) {
      await this.accessToken(true);
      return this.call<T>(method, path, { ...options, retryAuth: false });
    }
    // A body that cannot be read or parsed is not an answer: the request may still have taken effect.
    let parsed: unknown;
    try {
      const text = await response.text();
      parsed = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      throw new PayPalError(
        'outcome_unknown',
        `Unreadable answer from PayPal for ${method} ${path} (HTTP ${response.status}). The result is unknown and must be reconciled.`,
        response.status,
      );
    }
    if (!response.ok) {
      const error = parsed as PayPalErrorBody;
      const issue = error.details?.[0]?.issue;
      const description = error.details?.[0]?.description ?? error.message ?? error.name;
      throw new PayPalError(
        response.status >= 500 ? 'server_error' : response.status === 401 ? 'auth_failed' : 'rejected',
        `PayPal ${response.status}${issue ? ` ${issue}` : ''}: ${description ?? 'request failed'}`,
        response.status,
        issue,
        error.debug_id,
      );
    }
    return parsed as T;
  }

  async checkCredentials(): Promise<void> {
    await this.accessToken(true);
  }

  async createOrder(input: Parameters<PayPalGateway['createOrder']>[0]): Promise<CreatedOrder> {
    const order = await this.call<{ id: string; status: string; links?: { rel: string; href: string }[] }>(
      'POST',
      '/v2/checkout/orders',
      {
        requestId: input.requestId,
        body: {
          intent: 'CAPTURE',
          payment_source: {
            paypal: {
              experience_context: {
                return_url: input.returnUrl,
                cancel_url: input.cancelUrl,
                user_action: 'PAY_NOW',
                shipping_preference: 'NO_SHIPPING',
                brand_name: 'ResolveOS demo store',
              },
            },
          },
          purchase_units: [
            {
              reference_id: input.referenceId,
              description: input.description,
              amount: {
                currency_code: input.currency,
                value: toPayPalValue(input.amountMinor, input.currency),
              },
            },
          ],
        },
      },
    );
    const approve = order.links?.find((link) => link.rel === 'approve' || link.rel === 'payer-action');
    return { orderId: order.id, status: order.status, approveUrl: approve?.href ?? null };
  }

  async captureOrder(orderId: string, requestId: string): Promise<CaptureResult> {
    const order = await this.call<{
      id: string;
      status: string;
      payer?: { email_address?: string };
      purchase_units?: {
        payments?: {
          captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[];
        };
      }[];
    }>('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { requestId });
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) {
      throw new PayPalError('rejected', `PayPal returned no capture for order ${orderId}.`);
    }
    return {
      orderId: order.id,
      orderStatus: order.status,
      captureId: capture.id,
      captureStatus: capture.status,
      amountMinor: fromPayPalValue(capture.amount.value, capture.amount.currency_code),
      currency: capture.amount.currency_code,
      payerEmail: order.payer?.email_address ?? null,
    };
  }

  async getCapture(captureId: string): Promise<CaptureDetails> {
    const capture = await this.call<{
      id: string;
      status: string;
      amount: { value: string; currency_code: string };
    }>('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`);
    return {
      captureId: capture.id,
      status: capture.status,
      amountMinor: fromPayPalValue(capture.amount.value, capture.amount.currency_code),
      currency: capture.amount.currency_code,
    };
  }

  async refundCapture(input: Parameters<PayPalGateway['refundCapture']>[0]): Promise<RefundResult> {
    const body: Record<string, unknown> = { invoice_id: input.invoiceId, note_to_payer: input.noteToPayer };
    if (input.amountMinor !== null) {
      body.amount = {
        value: toPayPalValue(input.amountMinor, input.currency),
        currency_code: input.currency,
      };
    }
    const refund = await this.call<RawRefund>(
      'POST',
      `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
      { requestId: input.requestId, body },
    );
    return refundOut(refund);
  }

  async getRefund(refundId: string): Promise<RefundResult> {
    return refundOut(await this.call<RawRefund>('GET', `/v2/payments/refunds/${encodeURIComponent(refundId)}`));
  }
}

interface RawRefund {
  id: string;
  status: string;
  amount?: { value: string; currency_code: string };
  links?: { rel?: string; href?: string }[];
}

function refundOut(refund: RawRefund): RefundResult {
  return {
    refundId: refund.id,
    status: refund.status,
    amountMinor: refund.amount ? fromPayPalValue(refund.amount.value, refund.amount.currency_code) : null,
    currency: refund.amount?.currency_code ?? null,
    captureId: /\/captures\/([^/?]+)$/.exec(refund.links?.find((l) => l.rel === 'up')?.href ?? '')?.[1] ?? null,
  };
}
