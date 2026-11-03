CREATE TYPE "public"."actor_type" AS ENUM('USER', 'AGENT', 'SYSTEM', 'PAYPAL');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('BUYER', 'MERCHANT');--> statement-breakpoint
CREATE TYPE "public"."case_category" AS ENUM('ITEM_NOT_RECEIVED', 'NOT_AS_DESCRIBED', 'DAMAGED', 'DUPLICATE_CHARGE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('OPEN', 'IN_NEGOTIATION', 'AWAITING_APPROVAL', 'PAYMENT_PROCESSING', 'RESOLVED', 'NO_AGREEMENT', 'ESCALATED');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('APPROVE', 'REJECT', 'REQUEST_REVISION');--> statement-breakpoint
CREATE TYPE "public"."evidence_source" AS ENUM('BUYER', 'MERCHANT', 'PAYPAL', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'SUPERSEDED', 'EXECUTED');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('NOT_STARTED', 'AUTHORIZED', 'PROCESSING', 'PENDING', 'COMPLETED', 'FAILED', 'UNKNOWN_REQUIRES_RECONCILIATION');--> statement-breakpoint
CREATE TYPE "public"."settlement_type" AS ENUM('FULL_REFUND', 'PARTIAL_REFUND', 'NO_REFUND', 'REPLACEMENT');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('PAYPAL_SANDBOX', 'DEMO_SEED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('BUYER', 'MERCHANT', 'OPERATOR');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('VERIFIED_PAYPAL', 'PARTY_PROVIDED', 'UNVERIFIED');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"approved_terms_hash" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"category" "case_category" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"buyer_desired_outcome" text NOT NULL,
	"buyer_floor_minor" integer,
	"merchant_preference" text NOT NULL,
	"merchant_max_refund_minor" integer NOT NULL,
	"max_turns" integer DEFAULT 6 NOT NULL,
	"current_status" "case_status" DEFAULT 'OPEN' NOT NULL,
	"source_type" "source_type" NOT NULL,
	"outcome_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_reference_unique" UNIQUE("reference"),
	CONSTRAINT "cases_max_turns_range" CHECK ("cases"."max_turns" BETWEEN 2 AND 12)
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"code" text NOT NULL,
	"source_party" "evidence_source" NOT NULL,
	"evidence_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"verification_status" "verification_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"refund_policy" text NOT NULL,
	"default_refund_limit_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_owner_user_id_unique" UNIQUE("owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "negotiation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"turn_index" integer NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"structured_output" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"paypal_request_id" text NOT NULL,
	"paypal_refund_id" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"is_full_refund" boolean NOT NULL,
	"status" "refund_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"paypal_status" text,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_attempts_proposal_id_unique" UNIQUE("proposal_id"),
	CONSTRAINT "refund_attempts_paypal_request_id_unique" UNIQUE("paypal_request_id"),
	CONSTRAINT "refund_attempts_paypal_refund_id_unique" UNIQUE("paypal_refund_id"),
	CONSTRAINT "refund_amount_positive" CHECK ("refund_attempts"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"proposal_version" integer NOT NULL,
	"settlement_type" "settlement_type" NOT NULL,
	"refund_amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"summary" text NOT NULL,
	"terms_hash" text NOT NULL,
	"requires_manual_action" boolean DEFAULT false NOT NULL,
	"current_status" "proposal_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_amount_non_negative" CHECK ("settlement_proposals"."refund_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"description" text NOT NULL,
	"paypal_order_id" text,
	"paypal_capture_id" text,
	"original_amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"amount_refunded_minor" integer DEFAULT 0 NOT NULL,
	"payment_status" "payment_status" NOT NULL,
	"source_type" "source_type" NOT NULL,
	"payer_email" text,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_paypal_order_id_unique" UNIQUE("paypal_order_id"),
	CONSTRAINT "transactions_paypal_capture_id_unique" UNIQUE("paypal_capture_id"),
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."original_amount_minor" > 0),
	CONSTRAINT "transactions_refund_within_amount" CHECK ("transactions"."amount_refunded_minor" >= 0 AND "transactions"."amount_refunded_minor" <= "transactions"."original_amount_minor"),
	CONSTRAINT "transactions_seed_has_no_paypal_ids" CHECK ("transactions"."source_type" = 'PAYPAL_SANDBOX' OR ("transactions"."paypal_order_id" IS NULL AND "transactions"."paypal_capture_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paypal_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"verification_status" text NOT NULL,
	"processing_status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_paypal_event_id_unique" UNIQUE("paypal_event_id")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_proposal_id_settlement_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."settlement_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_turns" ADD CONSTRAINT "negotiation_turns_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_attempts" ADD CONSTRAINT "refund_attempts_proposal_id_settlement_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."settlement_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_attempts" ADD CONSTRAINT "refund_attempts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_proposals" ADD CONSTRAINT "settlement_proposals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_proposal_role_uq" ON "approvals" USING btree ("proposal_id","role");--> statement-breakpoint
CREATE INDEX "audit_case_created_idx" ON "audit_events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "cases_merchant_idx" ON "cases" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cases_buyer_idx" ON "cases" USING btree ("buyer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_case_code_uq" ON "evidence" USING btree ("case_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_case_index_uq" ON "negotiation_turns" USING btree ("case_id","turn_index");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_case_version_uq" ON "settlement_proposals" USING btree ("case_id","proposal_version");