import { eq } from 'drizzle-orm';

import { audit, publish } from '../audit.js';
import { type Db } from '../db/index.js';
import { refundAttempts, settlementProposals, transactions, webhookEvents } from '../db/schema.js';
import { fromPayPalValue } from '../money.js';
import { type CertFetcher, verifyWebhook } from '../paypal/webhook-verify.js';
import { type PaymentService } from './service.js';

/**
 * PayPal webhook handling. Order of operations:
 *   1. Verify the signature against the raw bytes. Unverified events are stored as `rejected` for
 *      inspection and never change any payment state.
 *   2. Deduplicate on PayPal's event id (unique column): a redelivery is acknowledged, not re-run.
 *   3. Apply only events that match a payment Resolve AI knows about.
 */

interface WebhookEnvelope {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { value?: string; currency_code?: string };
  };
}

export type WebhookOutcome =
  | { status: 200; result: 'processed' | 'duplicate' | 'ignored' }
  | { status: 400; result: 'unverified' | 'malformed' };

const REFUND_EVENTS: Record<string, string> = {
  'PAYMENT.CAPTURE.REFUNDED': 'COMPLETED',
  'PAYMENT.REFUND.PENDING': 'PENDING',
  'PAYMENT.REFUND.FAILED': 'FAILED',
};

export async function handleWebhook(
  database: Db,
  payments: PaymentService,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  webhookId: string | undefined,
  getCert?: CertFetcher,
): Promise<WebhookOutcome> {
  let event: WebhookEnvelope;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as WebhookEnvelope;
  } catch {
    return { status: 400, result: 'malformed' };
  }
  if (!event.id || !event.event_type) return { status: 400, result: 'malformed' };

  const verdict = await verifyWebhook(rawBody, headers, webhookId, getCert);
  const inserted = await database
    .insert(webhookEvents)
    .values({
      paypalEventId: event.id,
      eventType: event.event_type,
      resourceId: event.resource?.id ?? null,
      verificationStatus: verdict.ok ? 'VERIFIED' : `REJECTED:${verdict.reason}`,
      processingStatus: verdict.ok ? 'RECEIVED' : 'QUARANTINED',
      payload: event,
    })
    .onConflictDoNothing({ target: webhookEvents.paypalEventId })
    .returning();
  if (!verdict.ok) return { status: 400, result: 'unverified' };
  if (inserted.length === 0) return { status: 200, result: 'duplicate' };

  const markProcessed = (processingStatus: string) =>
    database
      .update(webhookEvents)
      .set({ processingStatus, processedAt: new Date() })
      .where(eq(webhookEvents.paypalEventId, event.id as string));

  const refundStatus = REFUND_EVENTS[event.event_type];
  if (refundStatus && event.resource?.id) {
    const attempt = await database.query.refundAttempts.findFirst({
      where: eq(refundAttempts.paypalRefundId, event.resource.id),
    });
    if (!attempt) {
      await markProcessed('IGNORED_UNKNOWN_REFUND');
      return { status: 200, result: 'ignored' };
    }
    const proposal = await database.query.settlementProposals.findFirst({
      where: eq(settlementProposals.id, attempt.proposalId),
    });
    const amount = event.resource.amount;
    await payments.applyRefundResult(
      attempt.id,
      proposal?.caseId ?? '',
      {
        refundId: event.resource.id,
        status: event.resource.status ?? refundStatus,
        amountMinor:
          amount?.value && amount.currency_code ? fromPayPalValue(amount.value, amount.currency_code) : null,
        currency: amount?.currency_code ?? null,
      },
      'webhook',
    );
    await markProcessed('PROCESSED');
    return { status: 200, result: 'processed' };
  }

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && event.resource?.id) {
    const txn = await database.query.transactions.findFirst({
      where: eq(transactions.paypalCaptureId, event.resource.id),
    });
    if (!txn) {
      await markProcessed('IGNORED_UNKNOWN_CAPTURE');
      return { status: 200, result: 'ignored' };
    }
    const records = await database.transaction(async (tx) => {
      if (txn.paymentStatus === 'CREATED') {
        await tx
          .update(transactions)
          .set({ paymentStatus: 'CAPTURED', capturedAt: new Date(), updatedAt: new Date() })
          .where(eq(transactions.id, txn.id));
      }
      return [
        await audit(tx, {
          caseId: null,
          actorType: 'PAYPAL',
          action: 'paypal.capture_completed_webhook',
          details: { transactionId: txn.id, captureId: event.resource?.id },
        }),
      ];
    });
    publish(records);
    await markProcessed('PROCESSED');
    return { status: 200, result: 'processed' };
  }

  await markProcessed('IGNORED_EVENT_TYPE');
  return { status: 200, result: 'ignored' };
}
