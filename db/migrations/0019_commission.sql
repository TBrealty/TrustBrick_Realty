CREATE SCHEMA "finance";
--> statement-breakpoint
CREATE TABLE "finance"."commission_acceptances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"rates" jsonb NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance"."commission_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('COM') NOT NULL,
	"organization_id" uuid NOT NULL,
	"listing_id" uuid,
	"booking_id" uuid,
	"kind" text NOT NULL,
	"service" text NOT NULL,
	"deal_value" numeric(16, 2),
	"brokerage_amount" numeric(16, 2),
	"basis" text,
	"rate_percent" numeric(5, 2),
	"amount" numeric(16, 2) NOT NULL,
	"gst_percent" numeric(5, 2) NOT NULL,
	"gst_amount" numeric(16, 2) NOT NULL,
	"total" numeric(16, 2) NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"collection" text DEFAULT 'invoice' NOT NULL,
	"payment_reference" text,
	"status_note" text,
	"status_changed_by" uuid,
	"status_changed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_entries_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "commission_entries_kind_check" CHECK ("kind" IN ('charge', 'adjustment')),
	CONSTRAINT "commission_entries_service_check" CHECK ("service" IN ('sale', 'rent', 'lease', 'pg', 'stay')),
	CONSTRAINT "commission_entries_status_check" CHECK ("status" IN ('due', 'paid', 'waived')),
	CONSTRAINT "commission_entries_collection_check" CHECK ("collection" IN ('invoice', 'gateway')),
	CONSTRAINT "commission_entries_total_check" CHECK ("total" = "amount" + "gst_amount"),
	CONSTRAINT "commission_entries_charge_check" CHECK ("kind" <> 'charge' OR ("amount" >= 0 AND "rate_percent" IS NOT NULL AND "basis" IS NOT NULL AND "deal_value" IS NOT NULL)),
	CONSTRAINT "commission_entries_paid_check" CHECK ("status" <> 'paid' OR "payment_reference" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "finance"."commission_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"service" text NOT NULL,
	"basis" text,
	"percent" numeric(5, 2),
	"reason" text NOT NULL,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rates_service_check" CHECK ("service" IN ('sale', 'rent', 'lease', 'pg', 'stay')),
	CONSTRAINT "commission_rates_basis_check" CHECK ("basis" IS NULL OR "basis" IN ('brokerage', 'deal_value')),
	CONSTRAINT "commission_rates_percent_check" CHECK ("percent" IS NULL OR ("percent" >= 0 AND "percent" <= 50)),
	CONSTRAINT "commission_rates_default_check" CHECK ("organization_id" IS NOT NULL OR ("basis" IS NOT NULL AND "percent" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "finance"."commission_acceptances" ADD CONSTRAINT "commission_acceptances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."commission_acceptances" ADD CONSTRAINT "commission_acceptances_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."commission_entries" ADD CONSTRAINT "commission_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."commission_entries" ADD CONSTRAINT "commission_entries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."commission_entries" ADD CONSTRAINT "commission_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "stays"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."commission_entries" ADD CONSTRAINT "commission_entries_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."commission_entries" ADD CONSTRAINT "commission_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."commission_rates" ADD CONSTRAINT "commission_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."commission_rates" ADD CONSTRAINT "commission_rates_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_acceptances_org_idx" ON "finance"."commission_acceptances" USING btree ("organization_id","accepted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "commission_entries_org_created_idx" ON "finance"."commission_entries" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "commission_entries_status_created_idx" ON "finance"."commission_entries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "commission_entries_listing_idx" ON "finance"."commission_entries" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_booking_charge_unique" ON "finance"."commission_entries" USING btree ("booking_id") WHERE "kind" = 'charge' AND "booking_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "commission_rates_lookup_idx" ON "finance"."commission_rates" USING btree ("organization_id","service","created_at" DESC NULLS LAST);--> statement-breakpoint
GRANT USAGE ON SCHEMA "finance" TO trustbrick_app;
--> statement-breakpoint
CREATE TRIGGER commission_entries_keep_reference_id BEFORE UPDATE OF reference_id ON "finance"."commission_entries"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
-- A charge's amounts are fixed once written; only its status moves. Corrections are new adjustment rows.
CREATE FUNCTION finance.keep_commission_amounts() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.organization_id, NEW.listing_id, NEW.booking_id, NEW.kind, NEW.service, NEW.deal_value, NEW.brokerage_amount, NEW.basis,
      NEW.rate_percent, NEW.amount, NEW.gst_percent, NEW.gst_amount, NEW.total, NEW.created_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.listing_id, OLD.booking_id, OLD.kind, OLD.service, OLD.deal_value, OLD.brokerage_amount, OLD.basis,
      OLD.rate_percent, OLD.amount, OLD.gst_percent, OLD.gst_amount, OLD.total, OLD.created_at)
     AND NOT (OLD.listing_id IS NOT NULL AND NEW.listing_id IS NULL) AND NOT (OLD.booking_id IS NOT NULL AND NEW.booking_id IS NULL) THEN
    RAISE EXCEPTION 'commission amounts are fixed (%)', OLD.reference_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER commission_entries_keep_amounts BEFORE UPDATE ON "finance"."commission_entries"
  FOR EACH ROW EXECUTE FUNCTION finance.keep_commission_amounts();
--> statement-breakpoint
-- Rate history and acceptances are records: added to, never changed.
CREATE TRIGGER commission_rates_append_only BEFORE UPDATE OR DELETE ON "finance"."commission_rates"
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION platform.reject_modification();
--> statement-breakpoint
CREATE TRIGGER commission_acceptances_append_only BEFORE UPDATE ON "finance"."commission_acceptances"
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
--> statement-breakpoint
-- The platform defaults Trustbrick starts with: a fifth of the agent's brokerage on sales and rentals,
-- 10% of a PG's first month's rent per tenant, and 10% of each stay. Changed in Platform settings.
INSERT INTO "finance"."commission_rates" (id, organization_id, service, basis, percent, reason) VALUES
  (gen_random_uuid(), NULL, 'sale', 'brokerage', 20, 'Starting default'),
  (gen_random_uuid(), NULL, 'rent', 'brokerage', 20, 'Starting default'),
  (gen_random_uuid(), NULL, 'lease', 'brokerage', 20, 'Starting default'),
  (gen_random_uuid(), NULL, 'pg', 'deal_value', 10, 'Starting default'),
  (gen_random_uuid(), NULL, 'stay', 'deal_value', 10, 'Starting default');
