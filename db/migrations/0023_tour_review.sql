ALTER TABLE "trust"."review_cases" DROP CONSTRAINT "review_cases_type_check";--> statement-breakpoint
DROP INDEX "trust"."review_cases_open_listing_idx";--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD COLUMN "tour_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD COLUMN "tour_hidden_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "review_cases_open_listing_idx" ON "trust"."review_cases" USING btree ("listing_id","case_type") WHERE "status" IN ('open', 'in_review');--> statement-breakpoint
ALTER TABLE "trust"."review_cases" ADD CONSTRAINT "review_cases_type_check" CHECK ("case_type" IN ('listing_review', 'agent_application', 'organization_verification', 'tour_review'));