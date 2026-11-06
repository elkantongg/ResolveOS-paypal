import { describe, expect, it } from 'vitest';

import { caseMetrics, median } from '../src/metrics.js';

const t = (seconds: number) => new Date(Date.UTC(2026, 10, 3, 12, 0, seconds)).toISOString();

describe('impact metrics come only from recorded events', () => {
  it('measures each phase of a resolved case', () => {
    const m = caseMetrics([
      { action: 'case.opened', createdAt: t(0) },
      { action: 'negotiation.started', createdAt: t(30) },
      { action: 'agent.proposal', createdAt: t(33) },
      { action: 'agent.output_rejected', createdAt: t(34) },
      { action: 'agent.counteroffer', createdAt: t(36) },
      { action: 'agent.accepted', createdAt: t(39) },
      { action: 'agreement.proposed', createdAt: t(39) },
      { action: 'settlement.approved', createdAt: t(55) },
      { action: 'refund.initiated', createdAt: t(55) },
      { action: 'refund.completed', createdAt: t(57) },
      { action: 'case.resolved', createdAt: t(57) },
    ]);
    expect(m).toEqual({ totalSeconds: 57, negotiationSeconds: 9, approvalSeconds: 16, paymentSeconds: 2, agentTurns: 3, guardrailRejections: 1 });
  });

  it('reports nothing it did not see', () => {
    const m = caseMetrics([{ action: 'case.opened', createdAt: t(0) }]);
    expect(m.totalSeconds).toBeNull();
    expect(m.negotiationSeconds).toBeNull();
  });

  it('takes a median', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 9])).toBe(5);
    expect(median([4, 10])).toBe(7);
  });
});
