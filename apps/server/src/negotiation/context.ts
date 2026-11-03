import type { AgentTurn } from './turn.js';

/**
 * Everything one agent turn is based on. Each agent sees the shared facts plus ONLY its own side's
 * private limits: the buyer agent never learns the merchant's ceiling, and the merchant agent
 * never learns the buyer's floor.
 */
export interface EvidenceItem {
  code: string;
  sourceParty: 'BUYER' | 'MERCHANT' | 'PAYPAL' | 'SYSTEM';
  verificationStatus: 'VERIFIED_PAYPAL' | 'PARTY_PROVIDED' | 'UNVERIFIED';
  evidenceType: string;
  title: string;
  content: string;
}

export interface SharedFacts {
  reference: string;
  category: string;
  title: string;
  description: string;
  item: string;
  buyerName: string;
  merchantName: string;
  amountMinor: number;
  refundableMinor: number;
  currency: string;
  /** Whether the payment itself was read from PayPal (sandbox) or is seeded demo data. */
  paymentVerifiedByPayPal: boolean;
  evidence: EvidenceItem[];
  history: AgentTurn[];
  turnNumber: number; // 1-based number of the turn being produced
  maxTurns: number;
  revisionNotes: string[];
}

export interface BuyerPrivate {
  desiredOutcome: string;
  floorMinor: number | null;
}

export interface MerchantPrivate {
  preference: string;
  maxRefundMinor: number;
  refundPolicy: string;
}

export type AgentInput =
  | { agent: 'BUYER'; facts: SharedFacts; own: BuyerPrivate }
  | { agent: 'MERCHANT'; facts: SharedFacts; own: MerchantPrivate };
