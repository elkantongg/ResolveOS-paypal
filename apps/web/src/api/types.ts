/** Shapes returned by the ResolveOS API (kept in step with apps/server). Money is in minor units. */

export type Role = 'BUYER' | 'MERCHANT' | 'OPERATOR';
export type SourceType = 'PAYPAL_SANDBOX' | 'DEMO_SEED';
export type CaseStatus =
  | 'OPEN'
  | 'IN_NEGOTIATION'
  | 'AWAITING_APPROVAL'
  | 'PAYMENT_PROCESSING'
  | 'RESOLVED'
  | 'NO_AGREEMENT'
  | 'ESCALATED';
export type ProposedAction = 'FULL_REFUND' | 'PARTIAL_REFUND' | 'REPLACEMENT' | 'NO_REFUND' | 'ESCALATE';
export type RefundStatus =
  | 'NOT_STARTED'
  | 'AUTHORIZED'
  | 'PROCESSING'
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'UNKNOWN_REQUIRES_RECONCILIATION';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Me {
  user: User;
  merchant: { id: string; businessName: string } | null;
  csrfToken: string;
}

export interface CaseSummary {
  id: string;
  reference: string;
  title: string;
  category: string;
  status: CaseStatus;
  sourceType: SourceType;
  updatedAt: string;
  amountMinor: number;
  refundedMinor: number;
  currency: string;
  buyerName: string;
  merchantName: string;
}

export interface Transaction {
  id: string;
  description: string;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  originalAmountMinor: number;
  amountRefundedMinor: number;
  currency: string;
  paymentStatus: string;
  sourceType: SourceType;
  payerEmail: string | null;
  capturedAt: string | null;
  createdAt: string;
}

export interface Evidence {
  id: string;
  code: string;
  sourceParty: 'BUYER' | 'MERCHANT' | 'PAYPAL' | 'SYSTEM';
  evidenceType: string;
  title: string;
  content: string;
  verificationStatus: 'VERIFIED_PAYPAL' | 'PARTY_PROVIDED' | 'UNVERIFIED';
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  caseId: string | null;
  actorType: 'USER' | 'AGENT' | 'SYSTEM' | 'PAYPAL';
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CaseDetail {
  viewerRole: Role;
  case: {
    id: string;
    reference: string;
    title: string;
    description: string;
    category: string;
    currentStatus: CaseStatus;
    sourceType: SourceType;
    buyerDesiredOutcome: string;
    buyerFloorMinor: number | null;
    merchantPreference: string | null;
    merchantMaxRefundMinor: number | null;
    maxTurns: number;
    negotiationMode: 'live' | 'demo' | null;
    outcomeSummary: string | null;
    createdAt: string;
    updatedAt: string;
  };
  transaction: Transaction;
  merchant: { id: string; businessName: string; refundPolicy: string } | null;
  buyer: { id: string; name: string } | null;
  evidence: Evidence[];
  timeline: AuditEvent[];
}

export interface Turn {
  index: number;
  agent: 'BUYER' | 'MERCHANT';
  provider: 'live' | 'demo';
  model: string | null;
  createdAt: string;
  reasoningSummary: string;
  evidenceReferences: string[];
  uncertainties: string[];
  proposedAction: ProposedAction;
  proposedRefundMinorUnits: number | null;
  currency: string;
  publicMessage: string;
  acceptsCounterpartOffer: boolean;
  requiresHumanReview: boolean;
}

export interface Proposal {
  id: string;
  proposalVersion: number;
  settlementType: 'FULL_REFUND' | 'PARTIAL_REFUND' | 'NO_REFUND' | 'REPLACEMENT';
  refundAmountMinor: number;
  currency: string;
  summary: string;
  termsHash: string;
  requiresManualAction: boolean;
  currentStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'SUPERSEDED' | 'EXECUTED';
  createdAt: string;
}

export interface NegotiationState {
  status: CaseStatus;
  mode: 'live' | 'demo' | null;
  maxTurns: number;
  outcomeSummary: string | null;
  turns: Turn[];
  proposal: Proposal | null;
}

export interface RefundView {
  status: RefundStatus;
  paypalRefundId: string | null;
  paypalStatus: string | null;
  amountMinor: number;
  currency: string;
  isFullRefund?: boolean;
  errorMessage: string | null;
  requestId: string;
  updatedAt: string;
}

export interface SettlementView {
  caseStatus: CaseStatus;
  proposal: Proposal | null;
  approvals: { role: Role; decision: 'APPROVE' | 'REJECT' | 'REQUEST_REVISION'; note: string | null; createdAt: string; validForCurrentTerms: boolean }[];
  transaction: {
    amountMinor: number;
    refundedMinor: number;
    currency: string;
    sourceType: SourceType;
    paypalCaptureId: string | null;
    paymentStatus: string;
  } | null;
  refund: RefundView | null;
}

export interface Receipt {
  reference: string;
  status: CaseStatus;
  outcomeSummary: string | null;
  proposal: Proposal | null;
  approvals: SettlementView['approvals'];
  transaction: SettlementView['transaction'];
  refund: (RefundView & { createdAt: string; verifiedByPayPal: boolean }) | null;
  parties: { buyer: string | null; merchant: string | null };
  metrics: CaseMetrics;
  comparison: { paypalInquiryWindowDays: number; source: string };
  timeline: AuditEvent[];
}

export interface PayPalStatus {
  environment: 'sandbox';
  adapter: 'paypal-sandbox' | 'mock';
  configured: boolean;
  connected: boolean;
  webhookConfigured: boolean;
  aiConfigured: boolean;
  aiMode: 'live' | 'demo';
  problem: string | null;
}

export interface DashboardSummary {
  totalCases: number;
  openCases: number;
  awaitingApproval: number;
  resolved: number;
  notAgreed: number;
  refundedTotals: { currency: string; totalMinor: number }[];
  activity: { day: string; resolved: number; opened: number }[];
  measured: {
    resolvedCasesMeasured: number;
    medianResolutionSeconds: number | null;
    medianNegotiationSeconds: number | null;
    agentTurns: number;
    guardrailRejections: number;
    paypalInquiryWindowDays: number;
  };
}

export interface CaseMetrics {
  totalSeconds: number | null;
  negotiationSeconds: number | null;
  approvalSeconds: number | null;
  paymentSeconds: number | null;
  agentTurns: number;
  guardrailRejections: number;
}
