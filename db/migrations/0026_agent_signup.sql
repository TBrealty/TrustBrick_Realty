CREATE TABLE "orgs"."agent_signups" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orgs"."agent_profiles" ADD COLUMN "application_type" text DEFAULT 'independent' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "orgs"."agent_signups" ADD CONSTRAINT "agent_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_gstin_idx" ON "orgs"."organizations" USING btree ("gstin") WHERE "gstin" IS NOT NULL AND "deleted_at" IS NULL AND "status" <> 'rejected';--> statement-breakpoint
ALTER TABLE "orgs"."agent_profiles" ADD CONSTRAINT "agent_profiles_application_type_check" CHECK ("application_type" IN ('independent', 'join_organization', 'new_organization'));--> statement-breakpoint
ALTER TABLE "orgs"."organizations" ADD CONSTRAINT "organizations_gstin_check" CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');--> statement-breakpoint
-- Applications made before this column existed: asking for an organization meant joining it.
UPDATE "orgs"."agent_profiles" SET "application_type" = 'join_organization' WHERE "requested_organization_id" IS NOT NULL;
