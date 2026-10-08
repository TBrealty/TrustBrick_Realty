ALTER TABLE "finance"."subscriptions" DROP CONSTRAINT "subscriptions_status_check";--> statement-breakpoint
DROP INDEX "finance"."subscriptions_one_live_per_user";--> statement-breakpoint
DROP INDEX "finance"."subscriptions_one_live_per_org";--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD COLUMN "pause_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD COLUMN "paused_from" text;--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD COLUMN "paused_for_suspension" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD COLUMN "status_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_per_user" ON "finance"."subscriptions" USING btree ("user_id") WHERE "user_id" IS NOT NULL AND "status" IN ('trialing', 'pending_payment', 'active', 'paused');--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_per_org" ON "finance"."subscriptions" USING btree ("organization_id") WHERE "organization_id" IS NOT NULL AND "status" IN ('trialing', 'pending_payment', 'active', 'paused');--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD CONSTRAINT "subscriptions_paused_check" CHECK ("status" <> 'paused' OR ("paused_at" IS NOT NULL AND "paused_from" IN ('trialing', 'pending_payment', 'active')));--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD CONSTRAINT "subscriptions_status_check" CHECK ("status" IN ('trialing', 'pending_payment', 'active', 'paused', 'cancelled', 'revoked', 'expired'));