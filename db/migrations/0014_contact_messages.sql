CREATE TABLE "platform"."contact_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('TKT') NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text,
	"topic" text NOT NULL,
	"message" text NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_messages_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "contact_messages_topic_check" CHECK ("topic" IN ('general', 'buying_renting', 'listing_hosting', 'account', 'partnership', 'press', 'problem')),
	CONSTRAINT "contact_messages_status_check" CHECK ("status" IN ('open', 'resolved')),
	CONSTRAINT "contact_messages_length_check" CHECK (char_length("name") BETWEEN 2 AND 120 AND char_length("message") BETWEEN 20 AND 4000),
	CONSTRAINT "contact_messages_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[+]?[0-9]{10,15}$')
);
--> statement-breakpoint
ALTER TABLE "platform"."contact_messages" ADD CONSTRAINT "contact_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."contact_messages" ADD CONSTRAINT "contact_messages_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_messages_status_created_idx" ON "platform"."contact_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE TRIGGER contact_messages_keep_reference_id BEFORE UPDATE OF reference_id ON "platform"."contact_messages"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
