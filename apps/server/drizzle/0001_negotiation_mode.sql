ALTER TABLE "cases" ADD COLUMN "negotiation_mode" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "revision_notes" jsonb DEFAULT '[]'::jsonb NOT NULL;