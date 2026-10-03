-- Grants and guard triggers for the workspace tables. Hand-written: drizzle-kit
-- cannot express triggers or column-level privilege changes.

GRANT USAGE ON SCHEMA "crm" TO trustbrick_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "trust" TO trustbrick_app;
--> statement-breakpoint

-- Append-only tables: the app may add rows and read them, never change or remove them.
REVOKE UPDATE, DELETE, TRUNCATE ON "platform"."audit_events" FROM trustbrick_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "marketplace"."listing_status_history" FROM trustbrick_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "crm"."lead_activities" FROM trustbrick_app;
--> statement-breakpoint
-- ...and the same for the owner, whose default privileges include everything.
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON "platform"."audit_events"
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
--> statement-breakpoint
CREATE TRIGGER listing_status_history_append_only BEFORE UPDATE ON "marketplace"."listing_status_history"
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
--> statement-breakpoint
CREATE TRIGGER lead_activities_append_only BEFORE UPDATE ON "crm"."lead_activities"
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
--> statement-breakpoint

-- Reference IDs are immutable once issued.
CREATE TRIGGER users_keep_reference_id BEFORE UPDATE OF reference_id ON "identity"."users"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER organizations_keep_reference_id BEFORE UPDATE OF reference_id ON "orgs"."organizations"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER agent_profiles_keep_reference_id BEFORE UPDATE OF reference_id ON "orgs"."agent_profiles"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER admin_profiles_keep_reference_id BEFORE UPDATE OF reference_id ON "orgs"."admin_profiles"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER admin_invitations_keep_reference_id BEFORE UPDATE OF reference_id ON "orgs"."admin_invitations"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER projects_keep_reference_id BEFORE UPDATE OF reference_id ON "real_estate"."projects"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER properties_keep_reference_id BEFORE UPDATE OF reference_id ON "real_estate"."properties"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER media_keep_reference_id BEFORE UPDATE OF reference_id ON "real_estate"."media"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER listings_keep_reference_id BEFORE UPDATE OF reference_id ON "marketplace"."listings"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER contacts_keep_reference_id BEFORE UPDATE OF reference_id ON "crm"."contacts"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER leads_keep_reference_id BEFORE UPDATE OF reference_id ON "crm"."leads"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER visits_keep_reference_id BEFORE UPDATE OF reference_id ON "crm"."visits"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER review_cases_keep_reference_id BEFORE UPDATE OF reference_id ON "trust"."review_cases"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER reports_keep_reference_id BEFORE UPDATE OF reference_id ON "trust"."reports"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint

-- The one platform organization. Staff memberships hang off it.
INSERT INTO "orgs"."organizations" ("id", "name", "slug", "org_type", "status", "verification_status")
VALUES ('01900000-0000-7000-8000-000000000001', 'Trustbrick', 'trustbrick', 'internal', 'active', 'verified')
ON CONFLICT DO NOTHING;
