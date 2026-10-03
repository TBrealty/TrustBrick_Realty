CREATE SCHEMA "crm";
--> statement-breakpoint
CREATE SCHEMA "trust";
--> statement-breakpoint
CREATE TABLE "crm"."contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('CON') NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" "citext",
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contacts_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "contacts_org_user_unique" UNIQUE("organization_id","user_id"),
	CONSTRAINT "contacts_reachable_check" CHECK (num_nonnulls("email", "phone") >= 1)
);
--> statement-breakpoint
CREATE TABLE "crm"."lead_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"activity_type" text NOT NULL,
	"body" text,
	"from_status" text,
	"to_status" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_activities_type_check" CHECK ("activity_type" IN ('created', 'status_changed', 'note', 'visit_requested', 'visit_updated'))
);
--> statement-breakpoint
CREATE TABLE "crm"."leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('LEAD') NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"listing_id" uuid,
	"property_id" uuid,
	"agent_user_id" uuid,
	"agent_membership_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"source" text NOT NULL,
	"message" text,
	"budget" numeric(16, 2),
	"lost_reason" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "leads_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "leads_status_check" CHECK ("status" IN ('new', 'contacted', 'qualified', 'visit_scheduled', 'negotiation', 'converted', 'lost')),
	CONSTRAINT "leads_source_check" CHECK ("source" IN ('listing_enquiry', 'visit_request', 'agent_created'))
);
--> statement-breakpoint
CREATE TABLE "crm"."visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('VIS') NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid,
	"listing_id" uuid,
	"property_id" uuid NOT NULL,
	"agent_user_id" uuid,
	"customer_user_id" uuid,
	"requested_for" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"status" text DEFAULT 'requested' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "visits_status_check" CHECK ("status" IN ('requested', 'scheduled', 'completed', 'cancelled', 'no_show')),
	CONSTRAINT "visits_scheduled_check" CHECK ("status" NOT IN ('scheduled', 'completed', 'no_show') OR "scheduled_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "marketplace"."listing_agents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"agent_user_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "listing_agents_role_check" CHECK ("role" IN ('primary', 'co_agent'))
);
--> statement-breakpoint
CREATE TABLE "marketplace"."listing_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace"."listing_views" (
	"listing_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"viewed_on" date NOT NULL,
	"view_count" integer DEFAULT 1 NOT NULL,
	"first_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_views_listing_id_viewed_on_viewer_key_pk" PRIMARY KEY("listing_id","viewed_on","viewer_key")
);
--> statement-breakpoint
CREATE TABLE "orgs"."admin_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('INV') NOT NULL,
	"email" "citext" NOT NULL,
	"name" text,
	"token_hash" text NOT NULL,
	"permission_codes" text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_invitations_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "admin_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "admin_invitations_status_check" CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "orgs"."admin_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"level" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_profiles_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "admin_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "admin_profiles_membership_id_unique" UNIQUE("membership_id"),
	CONSTRAINT "admin_profiles_level_check" CHECK ("level" IN ('admin', 'superadmin')),
	CONSTRAINT "admin_profiles_reference_check" CHECK (("level" = 'admin' AND "reference_id" ~ '^ADM-[0-9A-HJKMNP-TV-Z]{8}$') OR ("level" = 'superadmin' AND "reference_id" ~ '^SADM-[0-9A-HJKMNP-TV-Z]{8}$'))
);
--> statement-breakpoint
CREATE TABLE "orgs"."agent_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('AGT') NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_organization_id" uuid,
	"phone" text NOT NULL,
	"rera_agent_number" text,
	"city_place_id" uuid,
	"experience_years" smallint,
	"bio" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_profiles_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "agent_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "agent_profiles_status_check" CHECK ("status" IN ('pending', 'active', 'suspended', 'rejected')),
	CONSTRAINT "agent_profiles_verification_status_check" CHECK ("verification_status" IN ('unverified', 'pending', 'verified', 'rejected')),
	CONSTRAINT "agent_profiles_phone_check" CHECK ("phone" ~ '^[+]?[0-9]{10,15}$'),
	CONSTRAINT "agent_profiles_experience_check" CHECK ("experience_years" IS NULL OR "experience_years" BETWEEN 0 AND 70)
);
--> statement-breakpoint
CREATE TABLE "orgs"."membership_permissions" (
	"membership_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	"scope" text NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_permissions_membership_id_permission_code_pk" PRIMARY KEY("membership_id","permission_code"),
	CONSTRAINT "membership_permissions_scope_check" CHECK ("scope" IN ('own', 'team', 'org', 'platform'))
);
--> statement-breakpoint
CREATE TABLE "orgs"."membership_roles" (
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_roles_membership_id_role_id_pk" PRIMARY KEY("membership_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "orgs"."memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"title" text,
	"status_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_org_unique" UNIQUE("user_id","organization_id"),
	CONSTRAINT "memberships_status_check" CHECK ("status" IN ('invited', 'active', 'suspended', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "orgs"."permissions" (
	"code" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"description" text NOT NULL,
	"is_platform" boolean DEFAULT false NOT NULL,
	CONSTRAINT "permissions_code_check" CHECK ("code" ~ '^[a-z]+\.[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "orgs"."role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_code_pk" PRIMARY KEY("role_id","permission_code"),
	CONSTRAINT "role_permissions_scope_check" CHECK ("scope" IN ('own', 'team', 'org', 'platform'))
);
--> statement-breakpoint
CREATE TABLE "orgs"."roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"workspace" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_org_code_unique" UNIQUE NULLS NOT DISTINCT("organization_id","code"),
	CONSTRAINT "roles_workspace_check" CHECK ("workspace" IN ('platform', 'professional'))
);
--> statement-breakpoint
CREATE TABLE "orgs"."team_members" (
	"team_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_membership_id_pk" PRIMARY KEY("team_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "orgs"."teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "teams_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "platform"."audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_reference_id" text,
	"actor_role" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"target_reference_id" text,
	"organization_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_event_type_check" CHECK ("event_type" ~ '^[A-Z][A-Z_]+$')
);
--> statement-breakpoint
CREATE TABLE "platform"."notification_mutes" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_mutes_user_id_type_pk" PRIMARY KEY("user_id","type"),
	CONSTRAINT "notification_mutes_type_check" CHECK ("type" ~ '^[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "platform"."notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_link_check" CHECK ("link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%'))
);
--> statement-breakpoint
CREATE TABLE "platform"."system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust"."reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('RPT') NOT NULL,
	"listing_id" uuid NOT NULL,
	"reporter_user_id" uuid,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "reports_reason_check" CHECK ("reason" IN ('fraud', 'incorrect_details', 'duplicate', 'unavailable', 'offensive', 'other')),
	CONSTRAINT "reports_status_check" CHECK ("status" IN ('open', 'actioned', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "trust"."review_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('VER') NOT NULL,
	"case_type" text NOT NULL,
	"listing_id" uuid,
	"agent_profile_id" uuid,
	"organization_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_by" uuid,
	"assigned_to" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_cases_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "review_cases_one_subject_check" CHECK (num_nonnulls("listing_id", "agent_profile_id", "organization_id") = 1),
	CONSTRAINT "review_cases_type_check" CHECK ("case_type" IN ('listing_review', 'agent_application', 'organization_verification')),
	CONSTRAINT "review_cases_status_check" CHECK ("status" IN ('open', 'in_review', 'approved', 'rejected', 'changes_requested', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "marketplace"."listings" DROP CONSTRAINT "listings_price_check";--> statement-breakpoint
ALTER TABLE "real_estate"."media" DROP CONSTRAINT "media_storage_provider_check";--> statement-breakpoint
ALTER TABLE "real_estate"."media" DROP CONSTRAINT "media_media_type_check";--> statement-breakpoint
-- listing_status enum → text + CHECK. The default, the partial browse indexes and the
-- published_at CHECK all embed enum literals, so they are dropped and recreated around the change.
ALTER TABLE "marketplace"."listings" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
DROP INDEX "marketplace"."listings_browse_recent_idx";--> statement-breakpoint
DROP INDEX "marketplace"."listings_browse_price_idx";--> statement-breakpoint
ALTER TABLE "marketplace"."listings" DROP CONSTRAINT "listings_published_at_check";--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
CREATE INDEX "listings_browse_recent_idx" ON "marketplace"."listings" USING btree ("transaction_type","published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "status" = 'published' AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "listings_browse_price_idx" ON "marketplace"."listings" USING btree ("transaction_type","price","id") WHERE "status" = 'published' AND "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_published_at_check" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."users" ADD COLUMN "reference_id" text DEFAULT platform.gen_reference_id('USR') NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "identity"."users" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "identity"."users" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "reference_id" text DEFAULT platform.gen_reference_id('LST') NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "brokerage_type" text;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "brokerage_value" numeric(16, 2);--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "lease_duration_months" smallint;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace"."pg_listing_terms" ADD COLUMN "house_rules" text;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "reference_id" text DEFAULT platform.gen_reference_id('ORG') NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "verification_status" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "contact_email" "citext";--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "rera_registration" text;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "city_place_id" uuid;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "real_estate"."commercial_attributes" ADD COLUMN "washrooms" smallint;--> statement-breakpoint
ALTER TABLE "real_estate"."commercial_attributes" ADD COLUMN "power_backup" text;--> statement-breakpoint
ALTER TABLE "real_estate"."commercial_attributes" ADD COLUMN "loading_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."commercial_attributes" ADD COLUMN "suitable_for" text;--> statement-breakpoint
ALTER TABLE "real_estate"."land_attributes" ADD COLUMN "frontage_ft" smallint;--> statement-breakpoint
ALTER TABLE "real_estate"."land_attributes" ADD COLUMN "boundary_wall" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."land_attributes" ADD COLUMN "survey_number" text;--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD COLUMN "reference_id" text;--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD COLUMN "variants" jsonb;--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD COLUMN "uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "real_estate"."projects" ADD COLUMN "reference_id" text DEFAULT platform.gen_reference_id('PROJ') NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD COLUMN "reference_id" text DEFAULT platform.gen_reference_id('PRP') NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD COLUMN "ownership_type" text;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD COLUMN "verification_status" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "real_estate"."property_types" ADD COLUMN "purposes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "real_estate"."property_types" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "crm"."contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "crm"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."lead_activities" ADD CONSTRAINT "lead_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "crm"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads" ADD CONSTRAINT "leads_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads" ADD CONSTRAINT "leads_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads" ADD CONSTRAINT "leads_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads" ADD CONSTRAINT "leads_agent_membership_id_memberships_id_fk" FOREIGN KEY ("agent_membership_id") REFERENCES "orgs"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."visits" ADD CONSTRAINT "visits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."visits" ADD CONSTRAINT "visits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "crm"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."visits" ADD CONSTRAINT "visits_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."visits" ADD CONSTRAINT "visits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."visits" ADD CONSTRAINT "visits_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."visits" ADD CONSTRAINT "visits_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."visits" ADD CONSTRAINT "visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_agents" ADD CONSTRAINT "listing_agents_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_agents" ADD CONSTRAINT "listing_agents_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_agents" ADD CONSTRAINT "listing_agents_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "orgs"."memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_agents" ADD CONSTRAINT "listing_agents_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_status_history" ADD CONSTRAINT "listing_status_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_status_history" ADD CONSTRAINT "listing_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."listing_views" ADD CONSTRAINT "listing_views_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."admin_invitations" ADD CONSTRAINT "admin_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."admin_invitations" ADD CONSTRAINT "admin_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."admin_invitations" ADD CONSTRAINT "admin_invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."admin_profiles" ADD CONSTRAINT "admin_profiles_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "orgs"."memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."admin_profiles" ADD CONSTRAINT "admin_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."agent_profiles" ADD CONSTRAINT "agent_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."agent_profiles" ADD CONSTRAINT "agent_profiles_requested_organization_id_organizations_id_fk" FOREIGN KEY ("requested_organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."agent_profiles" ADD CONSTRAINT "agent_profiles_city_place_id_places_id_fk" FOREIGN KEY ("city_place_id") REFERENCES "geography"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."agent_profiles" ADD CONSTRAINT "agent_profiles_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."membership_permissions" ADD CONSTRAINT "membership_permissions_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "orgs"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."membership_permissions" ADD CONSTRAINT "membership_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "orgs"."permissions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."membership_permissions" ADD CONSTRAINT "membership_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."membership_roles" ADD CONSTRAINT "membership_roles_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "orgs"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."membership_roles" ADD CONSTRAINT "membership_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "orgs"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."memberships" ADD CONSTRAINT "memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "orgs"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "orgs"."permissions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "orgs"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."team_members" ADD CONSTRAINT "team_members_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "orgs"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."notification_mutes" ADD CONSTRAINT "notification_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."reports" ADD CONSTRAINT "reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."review_cases" ADD CONSTRAINT "review_cases_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."review_cases" ADD CONSTRAINT "review_cases_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "orgs"."agent_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."review_cases" ADD CONSTRAINT "review_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."review_cases" ADD CONSTRAINT "review_cases_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."review_cases" ADD CONSTRAINT "review_cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."review_cases" ADD CONSTRAINT "review_cases_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_org_email_idx" ON "crm"."contacts" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "lead_activities_lead_created_idx" ON "crm"."lead_activities" USING btree ("lead_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_org_status_created_idx" ON "crm"."leads" USING btree ("organization_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_agent_status_idx" ON "crm"."leads" USING btree ("agent_user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_listing_idx" ON "crm"."leads" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "crm"."leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "visits_agent_status_idx" ON "crm"."visits" USING btree ("agent_user_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "visits_org_scheduled_idx" ON "crm"."visits" USING btree ("organization_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "visits_created_at_idx" ON "crm"."visits" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_agents_one_primary_idx" ON "marketplace"."listing_agents" USING btree ("listing_id") WHERE "role" = 'primary' AND "ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "listing_agents_agent_current_idx" ON "marketplace"."listing_agents" USING btree ("agent_user_id","listing_id") WHERE "ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "listing_agents_membership_idx" ON "marketplace"."listing_agents" USING btree ("membership_id") WHERE "ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "listing_status_history_listing_idx" ON "marketplace"."listing_status_history" USING btree ("listing_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "listing_views_viewed_on_idx" ON "marketplace"."listing_views" USING btree ("viewed_on");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invitations_one_pending_idx" ON "orgs"."admin_invitations" USING btree ("email") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "admin_invitations_status_created_idx" ON "orgs"."admin_invitations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_profiles_status_created_idx" ON "orgs"."agent_profiles" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "membership_roles_role_id_idx" ON "orgs"."membership_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "memberships_org_status_idx" ON "orgs"."memberships" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "orgs"."memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_membership_id_idx" ON "orgs"."team_members" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_brin_idx" ON "platform"."audit_events" USING brin ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "platform"."audit_events" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "platform"."audit_events" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_type_created_idx" ON "platform"."audit_events" USING btree ("event_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_target_reference_idx" ON "platform"."audit_events" USING btree ("target_reference_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "platform"."notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "platform"."notifications" USING btree ("user_id") WHERE "read_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_per_reporter_idx" ON "trust"."reports" USING btree ("listing_id","reporter_user_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "trust"."reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_listing_idx" ON "trust"."reports" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_cases_open_listing_idx" ON "trust"."review_cases" USING btree ("listing_id") WHERE "status" IN ('open', 'in_review');--> statement-breakpoint
CREATE UNIQUE INDEX "review_cases_open_agent_idx" ON "trust"."review_cases" USING btree ("agent_profile_id") WHERE "status" IN ('open', 'in_review');--> statement-breakpoint
CREATE UNIQUE INDEX "review_cases_open_org_idx" ON "trust"."review_cases" USING btree ("organization_id") WHERE "status" IN ('open', 'in_review');--> statement-breakpoint
CREATE INDEX "review_cases_type_status_created_idx" ON "trust"."review_cases" USING btree ("case_type","status","created_at");--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD CONSTRAINT "organizations_city_place_id_places_id_fk" FOREIGN KEY ("city_place_id") REFERENCES "geography"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_status_created_idx" ON "identity"."users" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "identity"."users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "listings_created_by_idx" ON "marketplace"."listings" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "listings_status_created_idx" ON "marketplace"."listings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "listings_review_queue_idx" ON "marketplace"."listings" USING btree ("submitted_at") WHERE "status" IN ('submitted', 'under_review') AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "organizations_status_created_idx" ON "orgs"."organizations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "organizations_type_status_idx" ON "orgs"."organizations" USING btree ("org_type","status");--> statement-breakpoint
CREATE INDEX "organizations_name_trgm_idx" ON "orgs"."organizations" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_single_internal_idx" ON "orgs"."organizations" USING btree ("org_type") WHERE "org_type" = 'internal';--> statement-breakpoint
CREATE INDEX "media_checksum_idx" ON "real_estate"."media" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "properties_created_by_idx" ON "real_estate"."properties" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "properties_created_at_idx" ON "real_estate"."properties" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_reference_id_unique" UNIQUE("reference_id");--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_reference_id_unique" UNIQUE("reference_id");--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD CONSTRAINT "organizations_reference_id_unique" UNIQUE("reference_id");--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD CONSTRAINT "media_reference_id_unique" UNIQUE("reference_id");--> statement-breakpoint
ALTER TABLE "real_estate"."projects" ADD CONSTRAINT "projects_reference_id_unique" UNIQUE("reference_id");--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_reference_id_unique" UNIQUE("reference_id");--> statement-breakpoint
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'suspended', 'deactivated'));--> statement-breakpoint
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[+]?[0-9]{10,15}$');--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_price_required_check" CHECK ("price" IS NOT NULL OR "status" IN ('draft', 'archived'));--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_status_check" CHECK ("status" IN ('draft', 'published', 'paused', 'expired', 'withdrawn', 'transacted', 'submitted', 'under_review', 'changes_requested', 'rejected', 'approved', 'unpublished', 'archived', 'removed'));--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_brokerage_check" CHECK ("brokerage_type" IS NULL OR "brokerage_type" IN ('none', 'percent', 'months_rent', 'fixed'));--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_lease_duration_check" CHECK ("lease_duration_months" IS NULL OR "lease_duration_months" BETWEEN 1 AND 600);--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD CONSTRAINT "listings_price_check" CHECK ("price" IS NULL OR "price" > 0);--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD CONSTRAINT "organizations_status_check" CHECK ("status" IN ('pending', 'active', 'suspended', 'rejected', 'archived'));--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD CONSTRAINT "organizations_verification_status_check" CHECK ("verification_status" IN ('unverified', 'pending', 'verified', 'rejected'));--> statement-breakpoint
ALTER TABLE "real_estate"."commercial_attributes" ADD CONSTRAINT "commercial_attributes_power_backup_check" CHECK ("power_backup" IS NULL OR "power_backup" IN ('none', 'partial', 'full'));--> statement-breakpoint
ALTER TABLE "real_estate"."commercial_attributes" ADD CONSTRAINT "commercial_attributes_washrooms_check" CHECK ("washrooms" IS NULL OR "washrooms" BETWEEN 0 AND 200);--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD CONSTRAINT "media_size_check" CHECK ("size_bytes" IS NULL OR "size_bytes" > 0);--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD CONSTRAINT "media_storage_provider_check" CHECK ("storage_provider" IN ('public', 'local', 's3'));--> statement-breakpoint
ALTER TABLE "real_estate"."media" ADD CONSTRAINT "media_media_type_check" CHECK ("media_type" IN ('image', 'floor_plan', 'brochure', 'video', 'document'));--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_ownership_type_check" CHECK ("ownership_type" IS NULL OR "ownership_type" IN ('freehold', 'leasehold', 'cooperative_society', 'power_of_attorney'));--> statement-breakpoint
ALTER TABLE "real_estate"."properties" ADD CONSTRAINT "properties_verification_status_check" CHECK ("verification_status" IN ('unverified', 'pending', 'verified', 'rejected'));--> statement-breakpoint
ALTER TABLE "real_estate"."property_types" ADD CONSTRAINT "property_types_purposes_check" CHECK ("purposes" <@ ARRAY['sale', 'rent', 'lease', 'pg']::text[]);--> statement-breakpoint
DROP TYPE "marketplace"."listing_status";