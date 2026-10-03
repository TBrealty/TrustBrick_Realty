CREATE SCHEMA "stays";
--> statement-breakpoint
ALTER TYPE "marketplace"."transaction_type" ADD VALUE 'stay';--> statement-breakpoint
CREATE TABLE "stays"."booking_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stays"."bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('BKG') NOT NULL,
	"listing_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"host_user_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"dates" daterange NOT NULL,
	"nights" smallint NOT NULL,
	"adults" smallint DEFAULT 1 NOT NULL,
	"children" smallint DEFAULT 0 NOT NULL,
	"pets" boolean DEFAULT false NOT NULL,
	"nightly_breakdown" jsonb NOT NULL,
	"subtotal" numeric(16, 2) NOT NULL,
	"cleaning_fee" numeric(16, 2) DEFAULT 0 NOT NULL,
	"total" numeric(16, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"payment_mode" text DEFAULT 'pay_at_property' NOT NULL,
	"status" text NOT NULL,
	"guest_name" text NOT NULL,
	"guest_phone" text NOT NULL,
	"guest_message" text,
	"cancellation_policy" text NOT NULL,
	"check_in_time" time NOT NULL,
	"check_out_time" time NOT NULL,
	"status_reason" text,
	"cancelled_by" text,
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "bookings_status_check" CHECK ("status" IN ('requested', 'confirmed', 'declined', 'expired', 'cancelled', 'checked_in', 'completed', 'no_show')),
	CONSTRAINT "bookings_dates_check" CHECK (NOT isempty("dates") AND lower_inc("dates") AND NOT upper_inc("dates") AND upper("dates") - lower("dates") = "nights"),
	CONSTRAINT "bookings_guests_check" CHECK ("adults" BETWEEN 1 AND 30 AND "children" BETWEEN 0 AND 30),
	CONSTRAINT "bookings_money_check" CHECK ("subtotal" > 0 AND "cleaning_fee" >= 0 AND "total" = "subtotal" + "cleaning_fee"),
	CONSTRAINT "bookings_payment_check" CHECK ("payment_mode" IN ('pay_at_property')),
	CONSTRAINT "bookings_cancelled_by_check" CHECK ((("status" = 'cancelled') = ("cancelled_by" IS NOT NULL)) AND ("cancelled_by" IS NULL OR "cancelled_by" IN ('guest', 'host', 'admin'))),
	CONSTRAINT "bookings_phone_check" CHECK ("guest_phone" ~ '^[+]?[0-9]{10,15}$'),
	CONSTRAINT "bookings_message_check" CHECK ("guest_message" IS NULL OR char_length("guest_message") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "stays"."host_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('HST') NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"city_place_id" uuid,
	"about" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"relationship" text DEFAULT 'owner' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_profiles_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "host_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "host_profiles_status_check" CHECK ("status" IN ('pending', 'active', 'suspended', 'rejected')),
	CONSTRAINT "host_profiles_verification_check" CHECK ("verification_status" IN ('unverified', 'pending', 'verified', 'rejected')),
	CONSTRAINT "host_profiles_relationship_check" CHECK ("relationship" IN ('owner', 'family', 'manager')),
	CONSTRAINT "host_profiles_phone_check" CHECK ("phone" ~ '^[+]?[0-9]{10,15}$'),
	CONSTRAINT "host_profiles_about_check" CHECK ("about" IS NULL OR char_length("about") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "stays"."stay_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"dates" daterange NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stays"."stay_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"dates" daterange NOT NULL,
	"nightly_price" numeric(16, 2) NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_rates_price_check" CHECK ("nightly_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "stays"."stay_terms" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"space_type" text DEFAULT 'entire_home' NOT NULL,
	"max_guests" smallint NOT NULL,
	"beds" smallint NOT NULL,
	"weekend_price" numeric(16, 2),
	"cleaning_fee" numeric(16, 2),
	"min_nights" smallint DEFAULT 1 NOT NULL,
	"max_nights" smallint DEFAULT 30 NOT NULL,
	"check_in_time" time DEFAULT '14:00' NOT NULL,
	"check_out_time" time DEFAULT '11:00' NOT NULL,
	"instant_book" boolean DEFAULT false NOT NULL,
	"cancellation_policy" text DEFAULT 'moderate' NOT NULL,
	"pets_allowed" boolean DEFAULT false NOT NULL,
	"smoking_allowed" boolean DEFAULT false NOT NULL,
	"events_allowed" boolean DEFAULT false NOT NULL,
	"house_rules" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_terms_space_check" CHECK ("space_type" IN ('entire_home', 'private_room')),
	CONSTRAINT "stay_terms_policy_check" CHECK ("cancellation_policy" IN ('flexible', 'moderate', 'strict')),
	CONSTRAINT "stay_terms_guests_check" CHECK ("max_guests" BETWEEN 1 AND 30 AND "beds" BETWEEN 1 AND 50),
	CONSTRAINT "stay_terms_nights_check" CHECK ("min_nights" BETWEEN 1 AND 90 AND "max_nights" BETWEEN 1 AND 365 AND "min_nights" <= "max_nights"),
	CONSTRAINT "stay_terms_money_check" CHECK (("weekend_price" IS NULL OR "weekend_price" > 0) AND ("cleaning_fee" IS NULL OR "cleaning_fee" >= 0)),
	CONSTRAINT "stay_terms_rules_check" CHECK ("house_rules" IS NULL OR char_length("house_rules") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "identity"."users" DROP CONSTRAINT "users_intent_check";--> statement-breakpoint
ALTER TABLE "real_estate"."amenities" DROP CONSTRAINT "amenities_category_check";--> statement-breakpoint
ALTER TABLE "real_estate"."property_types" DROP CONSTRAINT "property_types_purposes_check";--> statement-breakpoint
ALTER TABLE "stays"."booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "stays"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_guest_user_id_users_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."host_profiles" ADD CONSTRAINT "host_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."host_profiles" ADD CONSTRAINT "host_profiles_city_place_id_places_id_fk" FOREIGN KEY ("city_place_id") REFERENCES "geography"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."host_profiles" ADD CONSTRAINT "host_profiles_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."stay_blocks" ADD CONSTRAINT "stay_blocks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."stay_blocks" ADD CONSTRAINT "stay_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."stay_rates" ADD CONSTRAINT "stay_rates_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."stay_rates" ADD CONSTRAINT "stay_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."stay_terms" ADD CONSTRAINT "stay_terms_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_events_booking_idx" ON "stays"."booking_events" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_host_status_idx" ON "stays"."bookings" USING btree ("host_user_id","status");--> statement-breakpoint
CREATE INDEX "bookings_guest_idx" ON "stays"."bookings" USING btree ("guest_user_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_listing_idx" ON "stays"."bookings" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "bookings_org_created_idx" ON "stays"."bookings" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "host_profiles_status_created_idx" ON "stays"."host_profiles" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "stay_blocks_listing_idx" ON "stays"."stay_blocks" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "stay_rates_listing_idx" ON "stays"."stay_rates" USING btree ("listing_id");--> statement-breakpoint
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_intent_check" CHECK ("intent" IS NULL OR "intent" IN ('buy', 'rent', 'sell', 'invest', 'pg', 'stay'));--> statement-breakpoint
ALTER TABLE "real_estate"."amenities" ADD CONSTRAINT "amenities_category_check" CHECK ("category" IN ('building', 'unit', 'pg', 'safety', 'stay'));--> statement-breakpoint
ALTER TABLE "real_estate"."property_types" ADD CONSTRAINT "property_types_purposes_check" CHECK ("purposes" <@ ARRAY['sale', 'rent', 'lease', 'pg', 'stay']::text[]);--> statement-breakpoint
-- Hand-written below: grants, overlap rules and guards drizzle-kit can't express.
GRANT USAGE ON SCHEMA "stays" TO trustbrick_app;
--> statement-breakpoint
-- No double bookings: dates held by one booking can't be held by another on the same listing.
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("listing_id" WITH =, "dates" WITH &&) WHERE ("status" IN ('confirmed', 'checked_in', 'completed'));
--> statement-breakpoint
ALTER TABLE "stays"."stay_blocks" ADD CONSTRAINT "stay_blocks_no_overlap" EXCLUDE USING gist ("listing_id" WITH =, "dates" WITH &&);
--> statement-breakpoint
ALTER TABLE "stays"."stay_rates" ADD CONSTRAINT "stay_rates_no_overlap" EXCLUDE USING gist ("listing_id" WITH =, "dates" WITH &&);
--> statement-breakpoint
ALTER TABLE "stays"."stay_blocks" ADD CONSTRAINT "stay_blocks_dates_check" CHECK (NOT isempty("dates") AND lower_inc("dates") AND NOT upper_inc("dates"));
--> statement-breakpoint
ALTER TABLE "stays"."stay_rates" ADD CONSTRAINT "stay_rates_dates_check" CHECK (NOT isempty("dates") AND lower_inc("dates") AND NOT upper_inc("dates"));
--> statement-breakpoint
CREATE INDEX "bookings_dates_idx" ON "stays"."bookings" USING gist ("listing_id", "dates");
--> statement-breakpoint
-- Booking history is append-only.
REVOKE UPDATE, DELETE, TRUNCATE ON "stays"."booking_events" FROM trustbrick_app;
--> statement-breakpoint
CREATE TRIGGER booking_events_append_only BEFORE UPDATE OR DELETE ON "stays"."booking_events"
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
--> statement-breakpoint
CREATE TRIGGER host_profiles_keep_reference_id BEFORE UPDATE OF reference_id ON "stays"."host_profiles"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER bookings_keep_reference_id BEFORE UPDATE OF reference_id ON "stays"."bookings"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
