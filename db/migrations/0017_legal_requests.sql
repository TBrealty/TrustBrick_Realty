CREATE TABLE "platform"."legal_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('LGL') NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text NOT NULL,
	"service" text NOT NULL,
	"purpose" text NOT NULL,
	"property_type" text NOT NULL,
	"state" text NOT NULL,
	"location" text NOT NULL,
	"listing_id" uuid,
	"documents" text[] DEFAULT '{}'::text[] NOT NULL,
	"details" text,
	"consent_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"status_note" text,
	"status_changed_by" uuid,
	"status_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_requests_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "legal_requests_service_check" CHECK ("service" IN ('document_check', 'title_opinion', 'full_due_diligence', 'agreement_review')),
	CONSTRAINT "legal_requests_purpose_check" CHECK ("purpose" IN ('buying', 'home_loan', 'selling', 'inherited', 'other')),
	CONSTRAINT "legal_requests_property_type_check" CHECK ("property_type" IN ('apartment', 'house', 'plot', 'agricultural', 'commercial')),
	CONSTRAINT "legal_requests_state_check" CHECK ("state" IN ('telangana', 'karnataka', 'maharashtra', 'goa')),
	CONSTRAINT "legal_requests_status_check" CHECK ("status" IN ('new', 'contacted', 'in_progress', 'completed', 'closed')),
	CONSTRAINT "legal_requests_documents_check" CHECK ("documents" <@ ARRAY['sale_deed', 'link_documents', 'encumbrance', 'tax_receipts', 'revenue_records', 'building_plan', 'occupancy', 'rera', 'layout_approval', 'agreement_draft', 'society_noc']::text[]),
	CONSTRAINT "legal_requests_length_check" CHECK (char_length("name") BETWEEN 2 AND 120 AND char_length("location") BETWEEN 3 AND 200 AND ("details" IS NULL OR char_length("details") <= 2000)),
	CONSTRAINT "legal_requests_phone_check" CHECK ("phone" ~ '^[+]?[0-9]{10,15}$')
);
--> statement-breakpoint
ALTER TABLE "platform"."legal_requests" ADD CONSTRAINT "legal_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."legal_requests" ADD CONSTRAINT "legal_requests_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."legal_requests" ADD CONSTRAINT "legal_requests_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_requests_status_created_idx" ON "platform"."legal_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "legal_requests_user_idx" ON "platform"."legal_requests" USING btree ("user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER legal_requests_keep_reference_id BEFORE UPDATE OF reference_id ON "platform"."legal_requests"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
