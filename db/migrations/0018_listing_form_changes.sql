ALTER TABLE "marketplace"."listings" ADD COLUMN "brokerage_negotiable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD COLUMN "custom_amenities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_custom_amenities_check" CHECK (cardinality("custom_amenities") <= 20);--> statement-breakpoint
ALTER TABLE "marketplace"."listings" DROP CONSTRAINT "listings_brokerage_check";--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_brokerage_check" CHECK ("brokerage_type" IS NULL OR "brokerage_type" IN ('none', 'percent', 'months_rent', 'half_month', 'fixed', 'flexible'));
