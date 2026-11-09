ALTER TABLE "cases" ADD COLUMN "merchant_confirmed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "cases" SET "merchant_confirmed_at" = now() WHERE "source_type" = 'DEMO_SEED' OR "current_status" <> 'OPEN';
