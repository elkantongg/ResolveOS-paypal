import { describe, expect, it } from 'vitest';

import { describeEvent, money, stageIndex, timeAgo, toMinor } from './format';

describe('money', () => {
  it('formats minor units for people', () => {
    expect(money(18000, 'USD')).toBe('$180.00');
    expect(money(9050, 'USD')).toBe('$90.50');
    expect(money(500, 'JPY')).toBe('¥500');
    expect(money(null)).toBe('—');
  });

  it('parses typed amounts without floating point', () => {
    expect(toMinor('180.00')).toBe(18000);
    expect(toMinor('$1,234.5')).toBe(123450);
    expect(toMinor('0.1')).toBe(10);
    expect(toMinor('1.234')).toBeNull();
    expect(toMinor('abc')).toBeNull();
    expect(toMinor('-5')).toBeNull();
  });
});

describe('stages come only from stored status', () => {
  it.each([
    ['OPEN', 1],
    ['IN_NEGOTIATION', 2],
    ['NO_AGREEMENT', 2],
    ['AWAITING_APPROVAL', 4],
    ['PAYMENT_PROCESSING', 5],
    ['RESOLVED', 7],
  ] as const)('%s → stage %i', (status, index) => {
    expect(stageIndex(status)).toBe(index);
  });
});

describe('event wording', () => {
  it('describes agent and payment events in plain words', () => {
    expect(describeEvent({ action: 'agent.accepted', details: { agent: 'BUYER', amount: '$90.00' } })).toBe('Buyer agent accepted $90.00');
    expect(describeEvent({ action: 'refund.completed', details: { refundId: 'R1', amount: '$90.00' } })).toBe('PayPal confirmed refund R1 · $90.00');
    expect(describeEvent({ action: 'refund.outcome_unknown', details: {} })).toContain('unknown');
    expect(describeEvent({ action: 'something.new', details: {} })).toBe('something new');
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');
    expect(timeAgo('2026-11-03T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-03T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-11-02T10:00:00Z', now)).toBe('yesterday');
  });
});
