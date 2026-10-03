CREATE TABLE "stays"."conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('MSG') NOT NULL,
	"listing_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"host_user_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"guest_last_read_seq" bigint DEFAULT 0 NOT NULL,
	"host_last_read_seq" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "conversations_parties_check" CHECK ("host_user_id" <> "guest_user_id")
);
--> statement-breakpoint
CREATE TABLE "stays"."messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "stays"."messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"sender_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sender_role_check" CHECK ("sender_role" IN ('guest', 'host')),
	CONSTRAINT "messages_body_check" CHECK (char_length("body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "stays"."conversations" ADD CONSTRAINT "conversations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."conversations" ADD CONSTRAINT "conversations_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."conversations" ADD CONSTRAINT "conversations_guest_user_id_users_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "stays"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_listing_guest_idx" ON "stays"."conversations" USING btree ("listing_id","guest_user_id");--> statement-breakpoint
CREATE INDEX "conversations_guest_idx" ON "stays"."conversations" USING btree ("guest_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_host_idx" ON "stays"."conversations" USING btree ("host_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_org_idx" ON "stays"."conversations" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_seq_idx" ON "stays"."messages" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "stays"."messages" USING btree ("conversation_id","seq");--> statement-breakpoint
-- Hand-written below: the chat log is append-only, and references never change.
REVOKE UPDATE, DELETE, TRUNCATE ON "stays"."messages" FROM trustbrick_app;
--> statement-breakpoint
CREATE TRIGGER messages_append_only BEFORE UPDATE ON "stays"."messages"
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
--> statement-breakpoint
CREATE TRIGGER conversations_keep_reference_id BEFORE UPDATE OF reference_id ON "stays"."conversations"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
