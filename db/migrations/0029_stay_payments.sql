CREATE TABLE "finance"."payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('PAY') NOT NULL,
	"booking_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"capture" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"session_id" text,
	"method" text,
	"commission_percent" numeric(5, 2) NOT NULL,
	"gst_percent" numeric(5, 2) NOT NULL,
	"host_share" numeric(16, 2) NOT NULL,
	"vendor_id" text,
	"refunded_amount" numeric(16, 2) DEFAULT 0 NOT NULL,
	"unwanted" boolean DEFAULT false NOT NULL,
	"failure_reason" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"attention_note" text,
	"authorized_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "payments_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payments_status_check" CHECK ("status" IN ('created', 'authorized', 'captured', 'failed', 'voided', 'partially_refunded', 'refunded')),
	CONSTRAINT "payments_provider_check" CHECK ("provider" IN ('fake', 'cashfree')),
	CONSTRAINT "payments_capture_check" CHECK ("capture" IN ('auto', 'manual')),
	CONSTRAINT "payments_amount_check" CHECK ("amount" > 0 AND "refunded_amount" >= 0 AND "refunded_amount" <= "amount" AND "host_share" >= 0 AND "host_share" <= "amount")
);
--> statement-breakpoint
CREATE TABLE "finance"."payout_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_vendor_id" text NOT NULL,
	"method" text NOT NULL,
	"holder_name" text NOT NULL,
	"bank_name" text,
	"account_last4" text,
	"ifsc" text,
	"upi_masked" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"verified_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_accounts_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "payout_accounts_status_check" CHECK ("status" IN ('pending', 'active', 'action_required', 'suspended')),
	CONSTRAINT "payout_accounts_provider_check" CHECK ("provider" IN ('fake', 'cashfree')),
	CONSTRAINT "payout_accounts_method_check" CHECK (("method" = 'bank' AND "account_last4" IS NOT NULL AND "ifsc" IS NOT NULL) OR ("method" = 'upi' AND "upi_masked" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "finance"."payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('PYT') NOT NULL,
	"booking_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"gross" numeric(16, 2) NOT NULL,
	"commission" numeric(16, 2) NOT NULL,
	"gst" numeric(16, 2) NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"release_at" timestamp with time zone NOT NULL,
	"hold_reason" text,
	"provider_transfer_id" text,
	"utr" text,
	"failure_reason" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "payouts_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "payouts_status_check" CHECK ("status" IN ('scheduled', 'on_hold', 'processing', 'paid', 'failed', 'cancelled')),
	CONSTRAINT "payouts_amount_check" CHECK ("gross" >= 0 AND "commission" >= 0 AND "gst" >= 0 AND "amount" >= 0 AND "amount" = "gross" - "commission" - "gst"),
	CONSTRAINT "payouts_paid_check" CHECK ("status" <> 'paid' OR "paid_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "finance"."provider_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "provider_events_provider_event_unique" UNIQUE("provider","event_id")
);
--> statement-breakpoint
CREATE TABLE "finance"."refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('RFD') NOT NULL,
	"payment_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"host_share" numeric(16, 2) NOT NULL,
	"platform_share" numeric(16, 2) NOT NULL,
	"reason" text NOT NULL,
	"initiated_by" text NOT NULL,
	"actor_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_refund_id" text,
	"failure_reason" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "refunds_status_check" CHECK ("status" IN ('pending', 'processed', 'failed')),
	CONSTRAINT "refunds_initiated_check" CHECK ("initiated_by" IN ('guest', 'host', 'admin', 'system')),
	CONSTRAINT "refunds_amount_check" CHECK ("amount" > 0 AND "host_share" >= 0 AND "platform_share" >= 0 AND "amount" = "host_share" + "platform_share")
);
--> statement-breakpoint
ALTER TABLE "stays"."bookings" DROP CONSTRAINT "bookings_status_check";--> statement-breakpoint
ALTER TABLE "stays"."bookings" DROP CONSTRAINT "bookings_payment_check";--> statement-breakpoint
ALTER TABLE "stays"."bookings" DROP CONSTRAINT "bookings_cancelled_by_check";--> statement-breakpoint
ALTER TABLE "finance"."commission_entries" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD COLUMN "instant_book" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "finance"."payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "stays"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."payments" ADD CONSTRAINT "payments_guest_user_id_users_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."payout_accounts" ADD CONSTRAINT "payout_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."payout_accounts" ADD CONSTRAINT "payout_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."payouts" ADD CONSTRAINT "payouts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "stays"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."payouts" ADD CONSTRAINT "payouts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "finance"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."payouts" ADD CONSTRAINT "payouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "finance"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "stays"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refunds" ADD CONSTRAINT "refunds_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "finance"."payments" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_created_idx" ON "finance"."payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payments_org_created_idx" ON "finance"."payments" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_success_per_booking" ON "finance"."payments" USING btree ("booking_id") WHERE "status" IN ('authorized', 'captured', 'partially_refunded') AND NOT "unwanted";--> statement-breakpoint
CREATE INDEX "payouts_status_release_idx" ON "finance"."payouts" USING btree ("status","release_at");--> statement-breakpoint
CREATE INDEX "payouts_org_created_idx" ON "finance"."payouts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "provider_events_received_idx" ON "finance"."provider_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "finance"."refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_status_created_idx" ON "finance"."refunds" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "finance"."commission_entries" ADD CONSTRAINT "commission_entries_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "finance"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_status_check" CHECK ("status" IN ('pending_payment', 'requested', 'confirmed', 'declined', 'expired', 'cancelled', 'checked_in', 'completed', 'no_show', 'abandoned'));--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_payment_check" CHECK ("payment_mode" IN ('pay_at_property', 'online'));--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_cancelled_by_check" CHECK ((("status" = 'cancelled') = ("cancelled_by" IS NOT NULL)) AND ("cancelled_by" IS NULL OR "cancelled_by" IN ('guest', 'host', 'admin', 'system')));--> statement-breakpoint
-- Hand-written below.
-- While a guest pays for an instant-book stay, its dates are held for them (15 minutes), so two
-- guests can't pay for the same night. Requests don't hold dates, as before: the host picks one.
ALTER TABLE "stays"."bookings" DROP CONSTRAINT "bookings_no_overlap";
--> statement-breakpoint
ALTER TABLE "stays"."bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("listing_id" WITH =, "dates" WITH &&)
  WHERE ("status" IN ('confirmed', 'checked_in', 'completed') OR ("status" = 'pending_payment' AND "instant_book"));
--> statement-breakpoint
CREATE INDEX "bookings_pending_payment_idx" ON "stays"."bookings" USING btree ("expires_at") WHERE "status" = 'pending_payment';
--> statement-breakpoint
CREATE TRIGGER payments_keep_reference_id BEFORE UPDATE OF reference_id ON "finance"."payments"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER refunds_keep_reference_id BEFORE UPDATE OF reference_id ON "finance"."refunds"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER payouts_keep_reference_id BEFORE UPDATE OF reference_id ON "finance"."payouts"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
-- A temporary 12% on stays for the launch of online payments (changed in Platform settings), unless
-- the SuperAdmin has already set a rate of their own.
-- clock_timestamp(): migrations share one transaction, and the newest rate must sort after the default.
INSERT INTO "finance"."commission_rates" (id, organization_id, service, basis, percent, reason, created_at)
SELECT gen_random_uuid(), NULL, 'stay', 'deal_value', 12, 'Temporary rate for online stay payments', clock_timestamp()
 WHERE (SELECT reason FROM "finance"."commission_rates" WHERE organization_id IS NULL AND service = 'stay' ORDER BY created_at DESC, id DESC LIMIT 1) = 'Starting default';
