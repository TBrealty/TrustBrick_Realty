CREATE SCHEMA "geography";
--> statement-breakpoint
CREATE SCHEMA "marketplace";
--> statement-breakpoint
CREATE SCHEMA "orgs";
--> statement-breakpoint
CREATE SCHEMA "real_estate";
--> statement-breakpoint
CREATE TYPE "marketplace"."gender_policy" AS ENUM('men', 'women', 'any');--> statement-breakpoint
CREATE TYPE "marketplace"."listing_status" AS ENUM('draft', 'pending_review', 'published', 'paused', 'expired', 'withdrawn', 'transacted');--> statement-breakpoint
CREATE TYPE "marketplace"."occupancy" AS ENUM('single', 'double', 'triple', 'quad');--> statement-breakpoint
CREATE TYPE "marketplace"."transaction_type" AS ENUM('sale', 'rent', 'lease', 'pg');--> statement-breakpoint
CREATE TABLE "geography"."addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"place_id" uuid NOT NULL,
	"line1" text,
	"line2" text,
	"landmark" text,
	"postal_code" text,
	"location" geography(Point,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addresses_postal_code_check" CHECK ("postal_code" IS NULL OR "postal_code" ~ '^[1-9][0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "geography"."places" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"place_type" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"path" "ltree" NOT NULL,
	"centroid" geography(Point,4326),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_path_unique" UNIQUE("path"),
	CONSTRAINT "places_parent_slug_unique" UNIQUE("parent_id","slug"),
	CONSTRAINT "places_place_type_check" CHECK ("place_type" IN ('country', 'state', 'city', 'locality', 'sub_locality'))
);
--> statement-breakpoint
CREATE TABLE "marketplace"."listing_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"price" numeric(16, 2) NOT NULL,
	"effective" "tstzrange" NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_prices_price_check" CHECK ("price" > 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace"."listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid,
	"transaction_type" "marketplace"."transaction_type" NOT NULL,
	"status" "marketplace"."listing_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price" numeric(16, 2) NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"price_negotiable" boolean DEFAULT false NOT NULL,
	"deposit_amount" numeric(16, 2),
	"maintenance_amount" numeric(16, 2),
	"declared_monthly_rent" numeric(16, 2),
	"available_from" date,
	"rera_id" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("description", '')), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "listings_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "listings_price_check" CHECK ("price" > 0),
	CONSTRAINT "listings_published_at_check" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL),
	CONSTRAINT "listings_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "marketplace"."pg_listing_terms" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"gender_policy" "marketplace"."gender_policy" NOT NULL,
	"meals" text NOT NULL,
	"food_preference" text,
	"notice_period_days" smallint,
	"lock_in_months" smallint,
	"entry_curfew" time,
	"visitors_allowed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pg_listing_terms_meals_check" CHECK ("meals" IN ('none', 'breakfast', 'two', 'three')),
	CONSTRAINT "pg_listing_terms_food_check" CHECK ("food_preference" IS NULL OR "food_preference" IN ('veg', 'non_veg', 'both'))
);
--> statement-breakpoint
CREATE TABLE "marketplace"."pg_room_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"occupancy" "marketplace"."occupancy" NOT NULL,
	"rent_per_bed" numeric(16, 2) NOT NULL,
	"deposit_amount" numeric(16, 2),
	"beds_available" smallint NOT NULL,
	"has_ac" boolean DEFAULT false NOT NULL,
	"attached_bathroom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pg_room_offers_config_unique" UNIQUE("listing_id","occupancy","has_ac","attached_bathroom"),
	CONSTRAINT "pg_room_offers_values_check" CHECK ("rent_per_bed" > 0 AND "beds_available" >= 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace"."saved_properties" (
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_properties_user_id_property_id_pk" PRIMARY KEY("user_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "orgs"."organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"org_type" text NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_org_type_check" CHECK ("org_type" IN ('brokerage', 'developer', 'property_manager', 'pg_operator', 'personal', 'vendor', 'internal'))
);
--> statement-breakpoint
CREATE TABLE "real_estate"."amenities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "amenities_code_unique" UNIQUE("code"),
	CONSTRAINT "amenities_category_check" CHECK ("category" IN ('building', 'unit', 'pg', 'safety'))
);
--> statement-breakpoint
CREATE TABLE "real_estate"."buildings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"floors_above_ground" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buildings_project_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "real_estate"."commercial_attributes" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"grade" text,
	"workstations" smallint,
	"fitout_status" text NOT NULL,
	CONSTRAINT "commercial_attributes_grade_check" CHECK ("grade" IS NULL OR "grade" IN ('A', 'B', 'C')),
	CONSTRAINT "commercial_attributes_fitout_check" CHECK ("fitout_status" IN ('bare_shell', 'warm_shell', 'fully_fitted'))
);
--> statement-breakpoint
CREATE TABLE "real_estate"."land_attributes" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"plot_area_sqyd" numeric(10, 2) NOT NULL,
	"zoning" text NOT NULL,
	"road_width_ft" smallint,
	"corner_plot" boolean DEFAULT false NOT NULL,
	CONSTRAINT "land_attributes_zoning_check" CHECK ("zoning" IN ('residential', 'commercial', 'agricultural', 'industrial')),
	CONSTRAINT "land_attributes_area_check" CHECK ("plot_area_sqyd" > 0)
);
--> statement-breakpoint
CREATE TABLE "real_estate"."media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"storage_provider" text NOT NULL,
	"media_type" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer,
	"width" smallint,
	"height" smallint,
	"alt_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_storage_provider_check" CHECK ("storage_provider" IN ('public', 's3')),
	CONSTRAINT "media_media_type_check" CHECK ("media_type" IN ('image', 'floor_plan', 'brochure', 'video'))
);
--> statement-breakpoint
CREATE TABLE "real_estate"."media_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"media_id" uuid NOT NULL,
	"property_id" uuid,
	"project_id" uuid,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "media_links_one_parent_check" CHECK (num_nonnulls("property_id", "project_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "real_estate"."pg_attributes" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"total_rooms" smallint NOT NULL,
	"total_beds" smallint NOT NULL,
	"attached_bathrooms" smallint DEFAULT 0 NOT NULL,
	"common_kitchen" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pg_attributes_beds_check" CHECK ("total_beds" >= "total_rooms" AND "total_rooms" > 0)
);
--> statement-breakpoint
CREATE TABLE "real_estate"."projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"address_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rera_number" text,
	"status" text NOT NULL,
	"launch_date" date,
	"possession_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_status_check" CHECK ("status" IN ('planned', 'under_construction', 'ready'))
);
--> statement-breakpoint
CREATE TABLE "real_estate"."properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"address_id" uuid NOT NULL,
	"property_type_id" uuid NOT NULL,
	"organization_id" uuid,
	"owner_user_id" uuid,
	"project_id" uuid,
	"building_id" uuid,
	"floor_number" smallint,
	"floor_label" text,
	"total_floors" smallint,
	"unit_number" text,
	"carpet_area_sqft" numeric(10, 2),
	"built_up_area_sqft" numeric(10, 2),
	"super_built_up_area_sqft" numeric(10, 2),
	"year_built" smallint,
	"lifecycle_status" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "properties_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "properties_address_id_unique" UNIQUE("address_id"),
	CONSTRAINT "properties_owner_check" CHECK (num_nonnulls("organization_id", "owner_user_id") >= 1),
	CONSTRAINT "properties_area_order_check" CHECK (("carpet_area_sqft" IS NULL OR "built_up_area_sqft" IS NULL OR "carpet_area_sqft" <= "built_up_area_sqft")
      AND ("built_up_area_sqft" IS NULL OR "super_built_up_area_sqft" IS NULL OR "built_up_area_sqft" <= "super_built_up_area_sqft")),
	CONSTRAINT "properties_lifecycle_status_check" CHECK ("lifecycle_status" IN ('planned', 'under_construction', 'ready', 'occupied')),
	CONSTRAINT "properties_source_check" CHECK ("source" IN ('user_submitted', 'org_submitted', 'import', 'verified', 'sample'))
);
--> statement-breakpoint
CREATE TABLE "real_estate"."property_amenities" (
	"property_id" uuid NOT NULL,
	"amenity_id" uuid NOT NULL,
	CONSTRAINT "property_amenities_property_id_amenity_id_pk" PRIMARY KEY("property_id","amenity_id")
);
--> statement-breakpoint
CREATE TABLE "real_estate"."property_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "property_types_code_unique" UNIQUE("code"),
	CONSTRAINT "property_types_category_check" CHECK ("category" IN ('residential', 'commercial', 'land', 'co_living'))
);
--> statement-breakpoint
CREATE TABLE "real_estate"."residential_attributes" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"bedrooms" smallint NOT NULL,
	"bathrooms" smallint NOT NULL,
	"balconies" smallint DEFAULT 0 NOT NULL,
	"furnishing" text NOT NULL,
	"facing" text,
	"covered_parking" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "residential_attributes_furnishing_check" CHECK ("furnishing" IN ('unfurnished', 'semi_furnished', 'furnished')),
	CONSTRAINT "residential_attributes_facing_check" CHECK ("facing" IS NULL OR "facing" IN ('north', 'north_east', 'east', 'south_east', 'south', 'south_west', 'west', 'north_west')),
	CONSTRAINT "residential_attributes_counts_check" CHECK ("bedrooms" BETWEEN 0 AND 20 AND "bathrooms" BETWEEN 0 AND 20)
);
--> statement-breakpoint
ALTER TABLE "geography"."addresses" ADD CONSTRAINT "addresses_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "geography"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography"."places" ADD CONSTRAINT "places_parent_id_places_id_fk" FOREIGN KEY ("parent_id") REFERENCES "geography"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_prices" ADD CONSTRAINT "listing_prices_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_prices" ADD CONSTRAINT "listing_prices_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."pg_listing_terms" ADD CONSTRAINT "pg_listing_terms_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."pg_room_offers" ADD CONSTRAINT "pg_room_offers_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."saved_properties" ADD CONSTRAINT "saved_properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."saved_properties" ADD CONSTRAINT "saved_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."buildings" ADD CONSTRAINT "buildings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "real_estate"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."commercial_attributes" ADD CONSTRAINT "commercial_attributes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."land_attributes" ADD CONSTRAINT "land_attributes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."media_links" ADD CONSTRAINT "media_links_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "real_estate"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."media_links" ADD CONSTRAINT "media_links_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."media_links" ADD CONSTRAINT "media_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "real_estate"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."pg_attributes" ADD CONSTRAINT "pg_attributes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."projects" ADD CONSTRAINT "projects_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "geography"."addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "geography"."addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_property_type_id_property_types_id_fk" FOREIGN KEY ("property_type_id") REFERENCES "real_estate"."property_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "real_estate"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "real_estate"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."property_amenities" ADD CONSTRAINT "property_amenities_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."property_amenities" ADD CONSTRAINT "property_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "real_estate"."amenities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."residential_attributes" ADD CONSTRAINT "residential_attributes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_place_id_idx" ON "geography"."addresses" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "addresses_location_gist_idx" ON "geography"."addresses" USING gist ("location");--> statement-breakpoint
CREATE INDEX "places_parent_id_idx" ON "geography"."places" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "places_path_gist_idx" ON "geography"."places" USING gist ("path");--> statement-breakpoint
CREATE INDEX "listing_prices_listing_id_idx" ON "marketplace"."listing_prices" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listings_browse_recent_idx" ON "marketplace"."listings" USING btree ("transaction_type","published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "status" = 'published' AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "listings_browse_price_idx" ON "marketplace"."listings" USING btree ("transaction_type","price","id") WHERE "status" = 'published' AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "listings_property_id_idx" ON "marketplace"."listings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "listings_organization_status_idx" ON "marketplace"."listings" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "listings_search_vector_idx" ON "marketplace"."listings" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "pg_listing_terms_gender_idx" ON "marketplace"."pg_listing_terms" USING btree ("gender_policy","listing_id");--> statement-breakpoint
CREATE INDEX "pg_room_offers_listing_id_idx" ON "marketplace"."pg_room_offers" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "saved_properties_user_created_idx" ON "marketplace"."saved_properties" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "media_links_property_sort_idx" ON "real_estate"."media_links" USING btree ("property_id","sort_order");--> statement-breakpoint
CREATE INDEX "media_links_project_id_idx" ON "real_estate"."media_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "real_estate"."projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_status_possession_idx" ON "real_estate"."projects" USING btree ("status","possession_date");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_building_unit_unique" ON "real_estate"."properties" USING btree ("building_id","unit_number") WHERE "deleted_at" IS NULL AND "building_id" IS NOT NULL AND "unit_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "properties_organization_id_idx" ON "real_estate"."properties" USING btree ("organization_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "properties_project_building_idx" ON "real_estate"."properties" USING btree ("project_id","building_id");--> statement-breakpoint
CREATE INDEX "properties_property_type_id_idx" ON "real_estate"."properties" USING btree ("property_type_id");--> statement-breakpoint
CREATE INDEX "property_amenities_amenity_id_idx" ON "real_estate"."property_amenities" USING btree ("amenity_id");--> statement-breakpoint
CREATE INDEX "residential_attributes_bedrooms_idx" ON "real_estate"."residential_attributes" USING btree ("bedrooms");