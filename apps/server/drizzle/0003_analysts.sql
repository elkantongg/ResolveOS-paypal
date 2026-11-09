ALTER TABLE "cases" ADD COLUMN "investigation" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_proposals" ADD COLUMN "review" jsonb;