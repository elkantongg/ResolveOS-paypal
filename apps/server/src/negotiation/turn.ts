import { z } from 'zod';

/**
 * One agent turn, exactly as the model must return it. Parsing this is the first gate; the
 * orchestrator then checks the facts the schema cannot (evidence codes exist, amounts fit the
 * payment and each side's limits, the currency is the payment's).
 */
export const PROPOSED_ACTIONS = ['FULL_REFUND', 'PARTIAL_REFUND', 'REPLACEMENT', 'NO_REFUND', 'ESCALATE'] as const;
export type ProposedAction = (typeof PROPOSED_ACTIONS)[number];

export const agentTurnSchema = z
  .object({
    reasoningSummary: z.string().trim().min(10).max(900),
    evidenceReferences: z.array(z.string().trim().regex(/^EV-\d{1,3}$/)).max(12),
    /** Facts the agent could not establish, stated plainly instead of guessed. */
    uncertainties: z.array(z.string().trim().min(3).max(240)).max(6).default([]),
    proposedAction: z.enum(PROPOSED_ACTIONS),
    proposedRefundMinorUnits: z.number().int().min(0).nullable(),
    currency: z.string().trim().length(3).transform((c) => c.toUpperCase()),
    publicMessage: z.string().trim().min(5).max(700),
    acceptsCounterpartOffer: z.boolean().default(false),
    requiresHumanReview: z.boolean(),
  })
  .strict();

export type AgentTurnBody = z.infer<typeof agentTurnSchema>;

export type AgentTurn = AgentTurnBody & { agent: 'BUYER' | 'MERCHANT' };

/** The JSON shape described to the model (kept in sync with the schema above). */
export const TURN_FORMAT = `Return ONLY a JSON object with exactly these keys:
{
  "reasoningSummary": string,            // 1-4 sentences: why, citing evidence codes
  "evidenceReferences": string[],        // codes like "EV-2" that you actually relied on; [] if none
  "uncertainties": string[],             // facts that are missing, unverified or contradictory
  "proposedAction": "FULL_REFUND" | "PARTIAL_REFUND" | "REPLACEMENT" | "NO_REFUND" | "ESCALATE",
  "proposedRefundMinorUnits": integer | null,   // cents; null unless FULL_REFUND or PARTIAL_REFUND
  "currency": string,                    // the payment currency, e.g. "USD"
  "publicMessage": string,               // what you say to the other side, polite and factual
  "acceptsCounterpartOffer": boolean,    // true ONLY to accept the other side's latest offer exactly
  "requiresHumanReview": boolean         // true if this cannot be settled fairly by negotiation
}`;
