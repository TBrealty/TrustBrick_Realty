ALTER TABLE "real_estate"."media" DROP CONSTRAINT "media_media_type_check";--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD COLUMN "tour_url" text;--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD CONSTRAINT "media_media_type_check" CHECK ("media_type" IN ('image', 'floor_plan', 'brochure', 'video', 'document', 'panorama', 'model_3d'));--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_tour_url_check" CHECK ("tour_url" IS NULL OR (length("tour_url") <= 500 AND "tour_url" LIKE 'https://%'));--> statement-breakpoint
-- Virtual tours are a Plus feature, listed second, after "Everything in Free".
UPDATE "finance"."plans"
   SET features = jsonb_insert(features, '{1}', '{"key":"virtual_tours","label":"360° virtual tours and 3D views","detail":"Walk through homes room by room before you visit"}'::jsonb), updated_at = now()
 WHERE code = 'customer_plus' AND NOT features @> '[{"key":"virtual_tours"}]'::jsonb;
