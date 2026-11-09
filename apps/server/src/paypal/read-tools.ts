import { PayPalAgentToolkit } from '@paypal/agent-toolkit/openai';

import { config, paypalConfigured } from '../config.js';
import { formatMoney, fromPayPalValue } from '../money.js';

/**
 * Read-only PayPal lookups for the case investigator, through PayPal's Agent Toolkit.
 *
 * The toolkit's `actions` setting only decides which tools are DESCRIBED to a model:
 * `handleToolCall` will still run any tool it is handed by name, including `create_refund`. So a
 * model never reaches it here. The investigator picks from three named checks with no arguments,
 * this class calls one of three fixed tool names with ids taken from the database, and each answer
 * is turned into text by this code, so a model cannot write what counts as verified by PayPal.
 */

export interface PaymentRef {
  orderId: string;
  captureId: string;
}

export interface PayPalReadTools {
  payment(ref: PaymentRef): Promise<string>;
  shipment(ref: PaymentRef): Promise<string>;
  disputes(ref: PaymentRef): Promise<{ open: boolean; text: string }>;
}

/** Enabled for the toolkit's own filtering; the fixed names below are the actual boundary. */
export const READ_ONLY_ACTIONS = { orders: { get: true }, shipment: { get: true }, disputes: { list: true } };

type ReadTool = 'get_order' | 'get_shipment_tracking' | 'list_disputes';

interface RawOrder {
  status?: string;
  payment_source?: { paypal?: { account_status?: string; address?: { country_code?: string } } };
  purchase_units?: {
    payments?: {
      captures?: {
        id?: string;
        status?: string;
        amount?: { value: string; currency_code: string };
        seller_protection?: { status?: string; dispute_categories?: string[] };
      }[];
      refunds?: { status?: string; amount?: { value: string; currency_code: string } }[];
    };
  }[];
}

const CLOSED_DISPUTE = new Set(['RESOLVED']);

export class ToolkitReadTools implements PayPalReadTools {
  private readonly toolkit: PayPalAgentToolkit;

  constructor() {
    const c = config();
    this.toolkit = new PayPalAgentToolkit({
      clientId: c.PAYPAL_CLIENT_ID as string,
      clientSecret: c.PAYPAL_CLIENT_SECRET as string,
      configuration: { actions: READ_ONLY_ACTIONS, context: { sandbox: true } },
    });
  }

  private async read<T>(name: ReadTool, args: object): Promise<T> {
    const result = await this.toolkit.handleToolCall({
      id: name,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
    const parsed = JSON.parse(String(result.content)) as T & { error?: unknown };
    if (parsed === null || typeof parsed !== 'object' || 'error' in parsed) throw new Error(`${name} failed`);
    return parsed;
  }

  async payment(ref: PaymentRef): Promise<string> {
    const order = await this.read<RawOrder>('get_order', { id: ref.orderId });
    const capture = order.purchase_units?.[0]?.payments?.captures?.find((c) => c.id === ref.captureId);
    if (!capture?.amount) throw new Error('capture not found on the order');
    const amount = formatMoney(fromPayPalValue(capture.amount.value, capture.amount.currency_code), capture.amount.currency_code);
    const protection = capture.seller_protection;
    const payer = order.payment_source?.paypal?.account_status;
    return [
      `PayPal order ${order.status ?? 'status unknown'}; capture ${capture.id} for ${amount}, status ${capture.status ?? 'unknown'}.`,
      protection?.status
        ? `Seller protection: ${protection.status}${protection.dispute_categories?.length ? ` (${protection.dispute_categories.join(', ')})` : ''}.`
        : 'PayPal reported no seller protection status.',
      payer ? `Payer account status: ${payer}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  async shipment(ref: PaymentRef): Promise<string> {
    const { trackers } = await this.read<{ trackers?: { tracking_number?: string; carrier?: string; status?: string }[] }>(
      'get_shipment_tracking',
      { transaction_id: ref.captureId },
    );
    if (!Array.isArray(trackers)) throw new Error('unexpected tracking answer');
    if (trackers.length === 0) return 'PayPal has no shipment tracking registered for this payment.';
    return `PayPal has shipment tracking registered by the merchant: ${trackers
      .map((t) => `${t.carrier ?? 'carrier unknown'} ${t.tracking_number ?? ''}, status ${t.status ?? 'unknown'}`.replace(/\s+/g, ' '))
      .join('; ')}. PayPal records what the merchant registered; this does not prove delivery.`;
  }

  async disputes(ref: PaymentRef): Promise<{ open: boolean; text: string }> {
    const { items } = await this.read<{ items?: { dispute_id?: string; status?: string; reason?: string }[] }>('list_disputes', {
      disputed_transaction_id: ref.captureId,
      page_size: 5,
    });
    if (!Array.isArray(items)) throw new Error('unexpected dispute answer');
    if (items.length === 0) return { open: false, text: 'PayPal shows no dispute on this payment.' };
    const open = items.some((d) => !CLOSED_DISPUTE.has(d.status ?? ''));
    return { open, text: `PayPal shows ${items.length} dispute(s) on this payment: ${items.map((d) => `${d.reason ?? 'reason unknown'} (${d.status ?? 'status unknown'})`).join('; ')}.` };
  }
}

export function readToolsFromEnv(): PayPalReadTools | null {
  return config().PAYPAL_ADAPTER === 'http' && paypalConfigured() ? new ToolkitReadTools() : null;
}
