-- public_id is superseded by reference_id (added in 0005, new format LST-/PRP-XXXXXXXX).
-- Only development sample data carried the old TB-L- ids, so no real link breaks.
ALTER TABLE "marketplace"."listings" DROP CONSTRAINT "listings_public_id_unique";--> statement-breakpoint
ALTER TABLE "real_estate"."properties" DROP CONSTRAINT "properties_public_id_unique";--> statement-breakpoint
ALTER TABLE "marketplace"."listings" DROP COLUMN "public_id";--> statement-breakpoint
ALTER TABLE "real_estate"."properties" DROP COLUMN "public_id";