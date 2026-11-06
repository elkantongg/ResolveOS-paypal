import type { AuditEvent, CaseStatus, ProposedAction } from '@/api/types';

/** Formatting and wording, kept pure so it can be unit tested. */

const ZERO_DECIMAL = new Set(['JPY', 'HUF', 'TWD']);

export function money(minor: number | null | undefined, currency = 'USD'): string {
  if (minor === null || minor === undefined) return '—';
  const exponent = ZERO_DECIMAL.has(currency) ? 0 : 2;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 10 ** exponent);
}

/** "180.00" → 18000. Returns null for anything that is not a plain amount. */
export function toMinor(value: string, currency = 'USD'): number | null {
  const exponent = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const trimmed = value.trim().replace(/[$,\s]/g, '');
  const pattern = exponent === 0 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, '0') || '0');
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  OPEN: 'Open',
  IN_NEGOTIATION: 'Negotiating',
  AWAITING_APPROVAL: 'Awaiting approval',
  PAYMENT_PROCESSING: 'Payment processing',
  RESOLVED: 'Resolved',
  NO_AGREEMENT: 'No agreement',
  ESCALATED: 'Needs a person',
};

export type Tone = 'neutral' | 'info' | 'warn' | 'ok' | 'danger' | 'accent';

export const STATUS_TONE: Record<CaseStatus, Tone> = {
  OPEN: 'neutral',
  IN_NEGOTIATION: 'info',
  AWAITING_APPROVAL: 'warn',
  PAYMENT_PROCESSING: 'info',
  RESOLVED: 'ok',
  NO_AGREEMENT: 'danger',
  ESCALATED: 'danger',
};

export const ACTION_LABEL: Record<ProposedAction, string> = {
  FULL_REFUND: 'Full refund',
  PARTIAL_REFUND: 'Partial refund',
  REPLACEMENT: 'Replacement',
  NO_REFUND: 'No refund',
  ESCALATE: 'Escalate to a person',
};

export const CATEGORY_LABEL: Record<string, string> = {
  ITEM_NOT_RECEIVED: 'Item not received',
  NOT_AS_DESCRIBED: 'Not as described',
  DAMAGED: 'Arrived damaged',
  DUPLICATE_CHARGE: 'Duplicate charge',
  OTHER: 'Other',
};

/** The seven stages, derived only from stored state. */
export const STAGES = [
  'Complaint received',
  'Evidence reviewed',
  'Negotiation started',
  'Agreement proposed',
  'Approval pending',
  'Payment processing',
  'Resolved',
] as const;

/**
 * The index of the stage the case is AT (stages before it are done). 7 means everything is done.
 * Stopped cases (no agreement / escalated) stay at the negotiation stage, marked as stopped.
 */
export function stageIndex(status: CaseStatus): number {
  switch (status) {
    case 'OPEN':
      return 1;
    case 'IN_NEGOTIATION':
    case 'NO_AGREEMENT':
    case 'ESCALATED':
      return 2;
    case 'AWAITING_APPROVAL':
      return 4;
    case 'PAYMENT_PROCESSING':
      return 5;
    case 'RESOLVED':
      return 7;
  }
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** One audit event in plain words (for timelines and the activity feed). */
export function describeEvent(event: Pick<AuditEvent, 'action' | 'details'>): string {
  const d = event.details as Record<string, string | number | boolean | null | undefined>;
  const agent = d.agent === 'BUYER' ? 'Buyer agent' : d.agent === 'MERCHANT' ? 'Merchant agent' : 'Agent';
  switch (event.action) {
    case 'case.opened':
      return d.seeded ? 'Case opened (seeded demo case)' : 'Case opened';
    case 'evidence.added':
      return `Evidence ${d.code ?? ''} added: ${d.title ?? ''}`;
    case 'negotiation.started':
      return `Negotiation started (${d.mode === 'demo' ? 'deterministic demo negotiator' : `live AI · ${d.model}`})`;
    case 'agent.thinking':
      return `${agent} is reviewing the evidence`;
    case 'agent.proposal':
      return `${agent} proposed ${d.action === 'ESCALATE' ? 'escalation' : String(d.action ?? '').toLowerCase().replace('_', ' ')}${d.amount ? ` · ${d.amount}` : ''}`;
    case 'agent.counteroffer':
      return `${agent} countered${d.amount ? ` · ${d.amount}` : ` · ${String(d.action ?? '').toLowerCase().replace('_', ' ')}`}`;
    case 'agent.accepted':
      return `${agent} accepted${d.amount ? ` ${d.amount}` : ''}`;
    case 'agent.escalated':
      return `${agent} asked for a person to review`;
    case 'agent.output_rejected':
      return `Server rejected an invalid ${String(d.agent ?? '').toLowerCase()} agent answer (${d.problem ?? ''}), asked again`;
    case 'agent.failed':
      return `AI provider failed: ${d.reason ?? ''}`;
    case 'agreement.proposed':
      return `Agreement reached: ${d.summary ?? ''}`;
    case 'approval.requested':
      return 'Approval requested from buyer and merchant';
    case 'approval.approve':
      return `${d.role === 'BUYER' ? 'Buyer' : 'Merchant'} approved version ${d.version}`;
    case 'approval.reject':
      return `${d.role === 'BUYER' ? 'Buyer' : 'Merchant'} rejected version ${d.version}`;
    case 'approval.request_revision':
      return `${d.role === 'BUYER' ? 'Buyer' : 'Merchant'} asked for a revision${d.note ? `: “${d.note}”` : ''}`;
    case 'settlement.approved':
      return 'Both parties approved the settlement';
    case 'settlement.rejected':
      return 'Settlement rejected';
    case 'negotiation.resumed':
      return 'Negotiation resumed for a revision';
    case 'negotiation.deadlock':
      return 'No agreement within the turn limit';
    case 'negotiation.escalated':
      return 'Escalated to a person';
    case 'refund.initiated':
      return `Refund sent to PayPal · ${d.amount ?? ''}`;
    case 'refund.completed':
      return `PayPal confirmed refund ${d.refundId ?? ''} · ${d.amount ?? ''}`;
    case 'refund.pending':
      return `PayPal reports the refund as pending (${d.refundId ?? ''})`;
    case 'refund.failed':
      return `Refund failed: ${d.message ?? d.paypalStatus ?? ''}`;
    case 'refund.outcome_unknown':
      return 'No answer from PayPal: the refund outcome is unknown and must be reconciled';
    case 'refund.unknown_requires_reconciliation':
      return 'Refund status unknown: needs reconciling';
    case 'refund.not_possible_demo_data':
      return 'Approved, but this is seeded demo data: no PayPal refund was made';
    case 'case.resolved':
      return `Case resolved${d.reason ? ` · ${d.reason}` : ''}`;
    default:
      return event.action.replace(/[._]/g, ' ');
  }
}

/** 57 → "57 s", 134 → "2 min 14 s", 7300 → "2 h 1 min". */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 ? `${minutes} min ${seconds % 60} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}
