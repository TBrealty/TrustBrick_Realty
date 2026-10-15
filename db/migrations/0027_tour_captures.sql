CREATE TABLE "marketplace"."tour_captures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"room_name" text NOT NULL,
	"hfov" real NOT NULL,
	"shot_count" smallint NOT NULL,
	"shots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"error" text,
	"claimed_at" timestamp with time zone,
	"media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tour_captures_status_check" CHECK ("status" IN ('uploading', 'queued', 'stitching', 'done', 'failed')),
	CONSTRAINT "tour_captures_shot_count_check" CHECK ("shot_count" BETWEEN 6 AND 60)
);
--> statement-breakpoint
ALTER TABLE "marketplace"."tour_captures" ADD CONSTRAINT "tour_captures_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."tour_captures" ADD CONSTRAINT "tour_captures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."tour_captures" ADD CONSTRAINT "tour_captures_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "orgs"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."tour_captures" ADD CONSTRAINT "tour_captures_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "real_estate"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tour_captures_listing_idx" ON "marketplace"."tour_captures" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "tour_captures_pending_idx" ON "marketplace"."tour_captures" USING btree ("created_at") WHERE "status" IN ('queued', 'stitching');