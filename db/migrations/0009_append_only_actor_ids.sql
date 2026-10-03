ALTER TABLE "crm"."lead_activities" DROP CONSTRAINT "lead_activities_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "marketplace"."listing_status_history" DROP CONSTRAINT "listing_status_history_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "platform"."audit_events" DROP CONSTRAINT "audit_events_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "platform"."audit_events" DROP CONSTRAINT "audit_events_organization_id_organizations_id_fk";
