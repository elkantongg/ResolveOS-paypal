import type { AiProvider } from '../ai/provider.js';
import { formatMoney } from '../money.js';
import type { AgentInput } from './context.js';
import { buildMessages } from './prompts.js';

/**
 * Where an agent turn comes from.
 *
 * - `LiveEngine`: a real model call through the configured provider.
 * - `DemoEngine`: a deterministic negotiator for presentations without an AI key. It is labelled
 *   "demo" everywhere it appears, and its turns are computed from the case's own numbers and
 *   evidence (so different inputs give different outcomes) rather than read from a script.
 *
 * Both return raw text; the orchestrator validates it the same way.
 */
export interface TurnEngine {
  readonly kind: 'live' | 'demo';
  readonly model: string;
  produce(input: AgentInput, feedback?: string): Promise<string>;
}

export class LiveEngine implements TurnEngine {
  readonly kind = 'live' as const;
  constructor(private readonly provider: AiProvider) {}
  get model() {
    return this.provider.model;
  }
  async produce(input: AgentInput, feedback?: string): Promise<string> {
    const messages = buildMessages(input);
    if (feedback) {
      messages.push({
        role: 'user',
        content: `Your previous answer was rejected by the server: ${feedback}\nReturn a corrected JSON object only.`,
      });
    }
    return this.provider.completeJson(messages);
  }
}

const roundTo = (minor: number, step: number) => Math.round(minor / step) * step;

export class DemoEngine implements TurnEngine {
  readonly kind = 'demo' as const;
  readonly model = 'deterministic-demo-negotiator';

  async produce(input: AgentInput): Promise<string> {
    const { facts } = input;
    const step = facts.currency === 'JPY' ? 100 : 100; // whole currency units
    const cite = (party: 'BUYER' | 'MERCHANT') =>
      facts.evidence.filter((e) => e.sourceParty === party).map((e) => e.code);
    const lastOf = (agent: 'BUYER' | 'MERCHANT') => [...facts.history].reverse().find((t) => t.agent === agent);
    const money = (minor: number) => formatMoney(minor, facts.currency);
    const tolerance = Math.max(step, roundTo(facts.amountMinor * 0.1, step));
    const unverified = facts.evidence
      .filter((e) => e.verificationStatus !== 'VERIFIED_PAYPAL')
      .map((e) => `${e.code} (${e.title}) is ${e.sourceParty.toLowerCase()}-provided and not independently verified`);

    const turn = (
      action: 'FULL_REFUND' | 'PARTIAL_REFUND' | 'NO_REFUND' | 'ESCALATE',
      amount: number | null,
      reasoning: string,
      message: string,
      refs: string[],
      accepts = false,
    ) =>
      JSON.stringify({
        reasoningSummary: reasoning,
        evidenceReferences: [...new Set(refs)],
        uncertainties: unverified.slice(0, 3),
        proposedAction: action,
        proposedRefundMinorUnits: amount,
        currency: facts.currency,
        publicMessage: message,
        acceptsCounterpartOffer: accepts,
        requiresHumanReview: action === 'ESCALATE',
      });

    if (input.agent === 'BUYER') {
      const floor = input.own.floorMinor ?? facts.refundableMinor;
      const mine = lastOf('BUYER');
      const theirs = lastOf('MERCHANT');
      const offer = theirs?.proposedRefundMinorUnits ?? null;
      if (offer !== null && offer >= floor) {
        return turn(
          theirs!.proposedAction === 'FULL_REFUND' ? 'FULL_REFUND' : 'PARTIAL_REFUND',
          offer,
          `The merchant's offer of ${money(offer)} meets the buyer's acceptable outcome given the disputed delivery (${cite('MERCHANT').join(', ') || 'no merchant evidence'}).`,
          `We accept ${money(offer)} as a fair settlement.`,
          [...cite('BUYER'), ...cite('MERCHANT')],
          true,
        );
      }
      const previous = mine?.proposedRefundMinorUnits ?? facts.refundableMinor;
      const ask = mine
        ? Math.max(floor, roundTo(previous - (previous - (offer ?? 0)) / 2, step))
        : facts.refundableMinor;
      const action = ask >= facts.refundableMinor ? 'FULL_REFUND' : 'PARTIAL_REFUND';
      return turn(
        action,
        ask,
        mine
          ? `The merchant has moved to ${money(offer ?? 0)}. Delivery is disputed and ${cite('MERCHANT').join(', ') || 'the merchant record'} shows no recipient signature, so the buyer moves to ${money(ask)}.`
          : `The buyer reports non-receipt (${cite('BUYER').join(', ') || 'buyer statement'}). The only delivery proof is a party-provided record without signature or photo, so the buyer asks for a full refund.`,
        mine
          ? `To settle this fairly, we can accept ${money(ask)}.`
          : `${facts.buyerName} did not receive the item and has checked with neighbours. We are asking for a refund of ${money(ask)}.`,
        [...cite('BUYER'), ...cite('MERCHANT').slice(0, 1)],
      );
    }

    // Merchant
    const ceiling = Math.min(input.own.maxRefundMinor, facts.refundableMinor);
    const mine = lastOf('MERCHANT');
    const theirs = lastOf('BUYER');
    const ask = theirs?.proposedRefundMinorUnits ?? facts.refundableMinor;
    const previous = mine?.proposedRefundMinorUnits ?? null;
    if (previous !== null && ask <= ceiling && ask - previous <= tolerance) {
      return turn(
        ask >= facts.refundableMinor ? 'FULL_REFUND' : 'PARTIAL_REFUND',
        ask,
        `The buyer's request of ${money(ask)} is within the merchant's authorised limit and close to the merchant's last offer; settling keeps the customer.`,
        `We agree to ${money(ask)}.`,
        cite('MERCHANT'),
        true,
      );
    }
    if (previous !== null && previous >= ceiling) {
      return turn(
        'ESCALATE',
        null,
        `The merchant has reached its authorised limit and the buyer's position (${money(ask)}) is still above it. The evidence is not strong enough for either side to justify moving further.`,
        `We cannot go above ${money(previous)}. We suggest this goes to a person to review, through PayPal's resolution process if needed.`,
        [...cite('MERCHANT'), ...cite('BUYER')],
      );
    }
    const offer = previous === null ? roundTo(ceiling * 0.3, step) : Math.min(ceiling, roundTo(previous + (ask - previous) / 2, step));
    return turn(
      'PARTIAL_REFUND',
      offer,
      previous === null
        ? `The carrier record (${cite('MERCHANT').join(', ') || 'merchant record'}) says delivered, but there is no signature or photo, so non-receipt cannot be ruled out. A partial refund reflects that shared uncertainty.`
        : `The buyer has moved to ${money(ask)}. The merchant moves to ${money(offer)} to keep the customer while the delivery remains unproven either way.`,
      previous === null
        ? `Our carrier shows the parcel as delivered, but we understand it was not found. We can offer ${money(offer)}.`
        : `We can increase our offer to ${money(offer)}.`,
      cite('MERCHANT'),
    );
  }
}
