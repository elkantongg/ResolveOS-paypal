/**
 * Impact measurements, computed only from a case's recorded audit events (never estimated):
 * how long each phase took, how many agent turns it needed, and how often the server's guardrails
 * rejected an agent answer. Pure, so it is unit tested.
 */

export interface TimedEvent {
  action: string;
  createdAt: Date | string;
}

export interface CaseMetrics {
  /** Case opened → case resolved (PayPal-confirmed refund, or agreed no-refund/replacement). */
  totalSeconds: number | null;
  /** Negotiation started → agreement proposed (the agents' part). */
  negotiationSeconds: number | null;
  /** Agreement proposed → both parties approved (the people's part). */
  approvalSeconds: number | null;
  /** Refund sent → PayPal confirmed it. */
  paymentSeconds: number | null;
  agentTurns: number;
  guardrailRejections: number;
}

const at = (e: TimedEvent) => new Date(e.createdAt).getTime();
const first = (events: TimedEvent[], action: string) => events.find((e) => e.action === action);
const last = (events: TimedEvent[], action: string) => [...events].reverse().find((e) => e.action === action);
const span = (from?: TimedEvent, to?: TimedEvent) =>
  from && to && at(to) >= at(from) ? Math.round((at(to) - at(from)) / 1000) : null;

export function caseMetrics(events: TimedEvent[]): CaseMetrics {
  const sorted = [...events].sort((a, b) => at(a) - at(b));
  const agreed = last(sorted, 'agreement.proposed');
  return {
    totalSeconds: span(first(sorted, 'case.opened'), last(sorted, 'case.resolved')),
    negotiationSeconds: span(
      agreed ? [...sorted].reverse().find((e) => e.action === 'negotiation.started' && at(e) <= at(agreed)) : undefined,
      agreed,
    ),
    approvalSeconds: span(agreed, last(sorted, 'settlement.approved')),
    paymentSeconds: span(last(sorted, 'refund.initiated'), last(sorted, 'refund.completed')),
    agentTurns: sorted.filter((e) => ['agent.proposal', 'agent.counteroffer', 'agent.accepted', 'agent.escalated'].includes(e.action)).length,
    guardrailRejections: sorted.filter((e) => e.action === 'agent.output_rejected').length,
  };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : Math.round(((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

/**
 * PayPal's own documented timeline, for comparison (developer.paypal.com/disputes/disputes-lifecycle):
 * a dispute's inquiry stage lets buyer and merchant try to resolve it for up to 20 days before it
 * can be escalated to a claim for PayPal to decide.
 */
export const PAYPAL_INQUIRY_WINDOW_DAYS = 20;
