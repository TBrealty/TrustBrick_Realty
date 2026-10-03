CREATE TABLE "orgs"."agent_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('INV') NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"city_place_id" uuid,
	"rera_agent_number" text,
	"experience_years" smallint,
	"organization_id" uuid,
	"role_code" text DEFAULT 'agent' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
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
	CONSTRAINT "agent_invitations_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "agent_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "agent_invitations_status_check" CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired')),
	CONSTRAINT "agent_invitations_role_check" CHECK ("role_code" IN ('agent', 'broker_admin')),
	CONSTRAINT "agent_invitations_broker_needs_org_check" CHECK ("role_code" = 'agent' OR "organization_id" IS NOT NULL),
	CONSTRAINT "agent_invitations_phone_check" CHECK ("phone" ~ '^[+]?[0-9]{10,15}$'),
	CONSTRAINT "agent_invitations_experience_check" CHECK ("experience_years" IS NULL OR "experience_years" BETWEEN 0 AND 70)
);
--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" ADD CONSTRAINT "agent_invitations_city_place_id_places_id_fk" FOREIGN KEY ("city_place_id") REFERENCES "geography"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" ADD CONSTRAINT "agent_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" ADD CONSTRAINT "agent_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" ADD CONSTRAINT "agent_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs"."agent_invitations" ADD CONSTRAINT "agent_invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_invitations_one_pending_idx" ON "orgs"."agent_invitations" USING btree ("email") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "agent_invitations_status_created_idx" ON "orgs"."agent_invitations" USING btree ("status","created_at");--> statement-breakpoint
CREATE TRIGGER agent_invitations_keep_reference_id BEFORE UPDATE OF reference_id ON "orgs"."agent_invitations"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
