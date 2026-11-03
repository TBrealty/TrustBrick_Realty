CREATE TABLE "orgs"."member_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('INV') NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"role_code" text NOT NULL,
	"phone" text,
	"rera_agent_number" text,
	"team_id" uuid,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_invitations_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "member_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "member_invitations_status_check" CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired')),
	CONSTRAINT "member_invitations_role_check" CHECK ("role_code" IN ('owner', 'manager', 'supervisor', 'agent', 'operator')),
	CONSTRAINT "member_invitations_agent_phone_check" CHECK ("role_code" NOT IN ('supervisor', 'agent') OR "phone" IS NOT NULL),
	CONSTRAINT "member_invitations_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[+]?[0-9]{10,15}$')
);
--> statement-breakpoint
ALTER TABLE "crm"."lead_activities" DROP CONSTRAINT "lead_activities_type_check";--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" DROP CONSTRAINT "agent_invitations_broker_needs_org_check";--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" DROP CONSTRAINT "agent_invitations_role_check";--> statement-breakpoint
ALTER TABLE "orgs"."member_invitations" ADD CONSTRAINT "member_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."member_invitations" ADD CONSTRAINT "member_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "orgs"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."member_invitations" ADD CONSTRAINT "member_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."member_invitations" ADD CONSTRAINT "member_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."member_invitations" ADD CONSTRAINT "member_invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_invitations_one_pending_idx" ON "orgs"."member_invitations" USING btree ("organization_id","email") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "member_invitations_org_status_idx" ON "orgs"."member_invitations" USING btree ("organization_id","status","created_at");--> statement-breakpoint
ALTER TABLE "crm"."lead_activities" ADD CONSTRAINT "lead_activities_type_check" CHECK ("activity_type" IN ('created', 'status_changed', 'note', 'visit_requested', 'visit_updated', 'assigned'));--> statement-breakpoint
-- Organization roles become Owner, Manager, Supervisor, Agent and Operator. Broker admins,
-- developer admins and property managers all ran their organization: they become its Owners.
-- Team leads become Supervisors. Grants for the new roles arrive with db:seed:reference, which
-- deploys run straight after migrating; renamed rows keep their grants until then.
UPDATE "orgs"."agent_invitations" SET "role_code" = 'owner' WHERE "role_code" = 'broker_admin';--> statement-breakpoint
UPDATE "orgs"."roles" SET "code" = 'owner', "name" = 'Owner' WHERE "organization_id" IS NULL AND "code" = 'broker_admin';--> statement-breakpoint
UPDATE "orgs"."roles" SET "code" = 'supervisor', "name" = 'Supervisor' WHERE "organization_id" IS NULL AND "code" = 'team_lead';--> statement-breakpoint
INSERT INTO "orgs"."roles" ("id", "code", "name", "workspace")
SELECT gen_random_uuid(), 'owner', 'Owner', 'professional'
 WHERE NOT EXISTS (SELECT 1 FROM "orgs"."roles" WHERE "organization_id" IS NULL AND "code" = 'owner');--> statement-breakpoint
INSERT INTO "orgs"."role_permissions" ("role_id", "permission_code", "scope")
SELECT o."id", rp."permission_code", rp."scope"
  FROM "orgs"."role_permissions" rp
  JOIN "orgs"."roles" r ON r."id" = rp."role_id" AND r."organization_id" IS NULL AND r."code" = 'developer_admin'
 CROSS JOIN (SELECT "id" FROM "orgs"."roles" WHERE "organization_id" IS NULL AND "code" = 'owner') o
    ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "orgs"."membership_roles" ("membership_id", "role_id", "created_at")
SELECT mr."membership_id", o."id", mr."created_at"
  FROM "orgs"."membership_roles" mr
  JOIN "orgs"."roles" r ON r."id" = mr."role_id" AND r."organization_id" IS NULL AND r."code" IN ('developer_admin', 'property_manager')
 CROSS JOIN (SELECT "id" FROM "orgs"."roles" WHERE "organization_id" IS NULL AND "code" = 'owner') o
    ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "orgs"."membership_roles" WHERE "role_id" IN (SELECT "id" FROM "orgs"."roles" WHERE "organization_id" IS NULL AND "code" IN ('developer_admin', 'property_manager'));--> statement-breakpoint
DELETE FROM "orgs"."roles" WHERE "organization_id" IS NULL AND "code" IN ('developer_admin', 'property_manager');--> statement-breakpoint
-- A supervisor leads the teams they are in.
UPDATE "orgs"."team_members" tm SET "is_lead" = EXISTS (
  SELECT 1 FROM "orgs"."membership_roles" mr JOIN "orgs"."roles" r ON r."id" = mr."role_id" AND r."code" = 'supervisor'
   WHERE mr."membership_id" = tm."membership_id");--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" ADD CONSTRAINT "agent_invitations_owner_needs_org_check" CHECK ("role_code" = 'agent' OR "organization_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" ADD CONSTRAINT "agent_invitations_role_check" CHECK ("role_code" IN ('agent', 'owner'));