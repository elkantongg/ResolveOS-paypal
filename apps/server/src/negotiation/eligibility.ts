/**
 * Deterministic eligibility screen, run before ANY agent sees a case. Some cases must not be
 * settled by negotiation at all, whatever both sides' limits allow:
 *
 *   - Possible unauthorised payments or account takeover. These are account-security matters
 *     for PayPal itself; a negotiated refund could also help a fraudster. Detected by plain
 *     patterns in the complaint and the evidence (written by people, so it is untrusted text;
 *     a false positive only means a person reviews it, which is the safe direction).
 *   - Payments with nothing left to refund.
 *
 * No model is involved, so an injected instruction in the evidence cannot get a case past it.
 */

export type Eligibility = { eligible: true } | { eligible: false; reason: string; code: 'possible_unauthorised_payment' | 'nothing_refundable' };

const UNAUTHORISED_PATTERNS: RegExp[] = [
  /\b(?:did ?n[o'’]?t|never|not)\s+(?:authori[sz]e|make|made|place|placed|buy|bought|order|ordered|purchase|purchased)\s+(?:this|that|the|it|any)\b/i,
  /\bunauthori[sz]ed\b/i,
  /\b(?:hacked|compromised)\b/i,
  /\baccount\s+(?:was\s+)?(?:accessed|taken over|broken into)\b/i,
  /\b(?:logged|signed)\s+into\s+my\b/i,
  /\bstolen\s+(?:card|account|identity|credentials?)\b/i,
  /\bidentity\s+theft\b/i,
];

export function screenCase(input: { description: string; evidence: { content: string; sourceParty: string }[]; refundableMinor: number }): Eligibility {
  if (input.refundableMinor <= 0) {
    return { eligible: false, code: 'nothing_refundable', reason: 'This payment has already been fully refunded, so there is nothing left to settle.' };
  }
  const buyerText = [input.description, ...input.evidence.filter((e) => e.sourceParty === 'BUYER').map((e) => e.content)].join('\n');
  if (UNAUTHORISED_PATTERNS.some((pattern) => pattern.test(buyerText))) {
    return {
      eligible: false,
      code: 'possible_unauthorised_payment',
      reason:
        'The buyer reports a payment they may not have authorised, or access to their account by someone else. That is a matter for PayPal directly, not a negotiated settlement: report unauthorised activity to PayPal (Resolution Center or PayPal support). No negotiation was run and no money moved.',
    };
  }
  return { eligible: true };
}
