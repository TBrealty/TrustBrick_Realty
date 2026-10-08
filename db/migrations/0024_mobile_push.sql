CREATE TABLE "platform"."push_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"app_version" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_devices_token_unique" UNIQUE("token"),
	CONSTRAINT "push_devices_platform_check" CHECK ("platform" IN ('android', 'ios')),
	CONSTRAINT "push_devices_token_check" CHECK (length("token") BETWEEN 10 AND 300)
);
--> statement-breakpoint
ALTER TABLE "platform"."notifications" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform"."push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "platform"."push_devices" USING btree ("user_id") WHERE "disabled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_push_pending_idx" ON "platform"."notifications" USING btree ("created_at") WHERE "pushed_at" IS NULL;--> statement-breakpoint
-- Existing notifications were never meant for push; only ones created from now on are sent.
UPDATE "platform"."notifications" SET "pushed_at" = "created_at" WHERE "pushed_at" IS NULL;
