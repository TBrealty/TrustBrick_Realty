ALTER TABLE "marketplace"."listings" ADD COLUMN "offer_title" text;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "offer_details" text;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "offer_valid_until" date;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_offer_check" CHECK (("offer_title" IS NULL AND "offer_details" IS NULL AND "offer_valid_until" IS NULL) OR ("offer_title" IS NOT NULL AND char_length("offer_title") BETWEEN 2 AND 60 AND coalesce(char_length("offer_details"), 0) <= 280));