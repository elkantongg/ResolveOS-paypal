import { createHash } from 'node:crypto';

export type SettlementType = 'FULL_REFUND' | 'PARTIAL_REFUND' | 'NO_REFUND' | 'REPLACEMENT';

export interface MaterialTerms {
  caseId: string;
  proposalVersion: number;
  settlementType: SettlementType;
  refundAmountMinor: number;
  currency: string;
}

/**
 * The hash of the terms that matter for money. An approval stores the hash it approved, so if any
 * of these change (a new version, a different amount or type), every earlier approval no longer
 * matches and cannot authorise anything.
 */
export function termsHash(terms: MaterialTerms): string {
  const canonical = JSON.stringify([
    terms.caseId,
    terms.proposalVersion,
    terms.settlementType,
    terms.refundAmountMinor,
    terms.currency.toUpperCase(),
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

/** Settlement types that move money through PayPal. */
export function movesMoney(type: SettlementType): boolean {
  return type === 'FULL_REFUND' || type === 'PARTIAL_REFUND';
}
