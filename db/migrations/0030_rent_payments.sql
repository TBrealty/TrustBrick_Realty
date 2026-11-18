CREATE SCHEMA "rent";
--> statement-breakpoint
CREATE TABLE "rent"."landlord_bank_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"landlord_user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"holder_name" text NOT NULL,
	"bank_name" text,
	"account_sealed" text,
	"account_last4" text,
	"ifsc" text,
	"upi_sealed" text,
	"upi_masked" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"name_at_bank" text,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"hold_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landlord_bank_accounts_landlord_user_id_unique" UNIQUE("landlord_user_id"),
	CONSTRAINT "landlord_bank_accounts_method_check" CHECK ("method" IN ('bank', 'upi')),
	CONSTRAINT "landlord_bank_accounts_status_check" CHECK ("status" IN ('pending', 'verified', 'failed')),
	CONSTRAINT "landlord_bank_accounts_details_check" CHECK (("method" = 'bank' AND "account_sealed" IS NOT NULL AND "account_last4" IS NOT NULL AND "ifsc" IS NOT NULL) OR ("method" = 'upi' AND "upi_sealed" IS NOT NULL AND "upi_masked" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "rent"."landlord_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('LIN') NOT NULL,
	"kind" text NOT NULL,
	"property_id" uuid NOT NULL,
	"listing_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"landlord_user_id" uuid,
	"token_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"invited_by" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landlord_invitations_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "landlord_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "landlord_invitations_kind_check" CHECK ("kind" IN ('new', 'existing')),
	CONSTRAINT "landlord_invitations_status_check" CHECK ("status" IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
	CONSTRAINT "landlord_invitations_token_check" CHECK (("kind" = 'new') = ("token_hash" IS NOT NULL)),
	CONSTRAINT "landlord_invitations_existing_check" CHECK ("kind" = 'new' OR "landlord_user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "rent"."landlord_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('LND') NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text,
	"pan_sealed" text,
	"pan_masked" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landlord_profiles_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "landlord_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "rent"."property_landlords" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"landlord_user_id" uuid NOT NULL,
	"invitation_id" uuid,
	"status" text DEFAULT 'awaiting_proof' NOT NULL,
	"proof_kind" text,
	"proof_storage_key" text,
	"proof_mime_type" text,
	"proof_filename" text,
	"proof_size_bytes" integer,
	"proof_uploaded_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"approved_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_landlords_status_check" CHECK ("status" IN ('awaiting_proof', 'under_review', 'approved', 'rejected', 'ended')),
	CONSTRAINT "property_landlords_proof_kind_check" CHECK ("proof_kind" IS NULL OR "proof_kind" IN ('sale_deed', 'property_tax_receipt', 'allotment_letter', 'electricity_bill', 'other')),
	CONSTRAINT "property_landlords_proof_check" CHECK ("status" IN ('awaiting_proof', 'ended') OR "proof_storage_key" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "rent"."charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('RNT') NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"paid_at" timestamp with time zone,
	"reminded_before_at" timestamp with time zone,
	"reminded_due_at" timestamp with time zone,
	"reminded_late_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charges_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "charges_status_check" CHECK ("status" IN ('due', 'paid', 'cancelled')),
	CONSTRAINT "charges_amount_check" CHECK ("amount" > 0),
	CONSTRAINT "charges_paid_check" CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "rent"."payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('RPY') NOT NULL,
	"charge_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"tenant_user_id" uuid NOT NULL,
	"landlord_user_id" uuid NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"session_id" text,
	"method" text,
	"unwanted" boolean DEFAULT false NOT NULL,
	"failure_reason" text,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"refund_status" text,
	"refund_reason" text,
	"provider_refund_id" text,
	"refund_attempts" integer DEFAULT 0 NOT NULL,
	"refunded_at" timestamp with time zone,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"attention_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "payments_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payments_status_check" CHECK ("status" IN ('created', 'paid', 'failed', 'refunded')),
	CONSTRAINT "payments_provider_check" CHECK ("provider" IN ('fake', 'cashfree')),
	CONSTRAINT "payments_amount_check" CHECK ("amount" > 0),
	CONSTRAINT "payments_refund_status_check" CHECK ("refund_status" IS NULL OR "refund_status" IN ('pending', 'processed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "rent"."settlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('STL') NOT NULL,
	"payment_id" uuid NOT NULL,
	"landlord_user_id" uuid NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"status" text DEFAULT 'on_hold' NOT NULL,
	"hold_reason" text,
	"held_by_admin" boolean DEFAULT false NOT NULL,
	"ready_at" timestamp with time zone,
	"due_by" date,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"utr" text,
	"paid_to_method" text,
	"paid_to_holder" text,
	"paid_to_last4" text,
	"paid_to_ifsc" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "settlements_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "settlements_status_check" CHECK ("status" IN ('on_hold', 'ready', 'paid', 'failed', 'cancelled')),
	CONSTRAINT "settlements_amount_check" CHECK ("amount" > 0),
	CONSTRAINT "settlements_paid_check" CHECK ("status" <> 'paid' OR ("paid_at" IS NOT NULL AND "utr" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "rent"."tenancies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('TEN') NOT NULL,
	"property_id" uuid NOT NULL,
	"listing_id" uuid,
	"property_landlord_id" uuid NOT NULL,
	"landlord_user_id" uuid NOT NULL,
	"tenant_user_id" uuid,
	"tenant_name" text NOT NULL,
	"tenant_email" text NOT NULL,
	"tenant_phone" text,
	"monthly_rent" numeric(16, 2) NOT NULL,
	"due_day" integer NOT NULL,
	"deposit" numeric(16, 2) DEFAULT 0 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"tenant_token_hash" text,
	"tenant_invite_expires_at" timestamp with time zone,
	"tenant_accepted_at" timestamp with time zone,
	"landlord_confirmed_at" timestamp with time zone,
	"dispute_note" text,
	"activated_at" timestamp with time zone,
	"first_due_date" date,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenancies_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "tenancies_tenant_token_hash_unique" UNIQUE("tenant_token_hash"),
	CONSTRAINT "tenancies_status_check" CHECK ("status" IN ('pending', 'disputed', 'active', 'ended', 'cancelled')),
	CONSTRAINT "tenancies_due_day_check" CHECK ("due_day" BETWEEN 1 AND 28),
	CONSTRAINT "tenancies_money_check" CHECK ("monthly_rent" > 0 AND "deposit" >= 0),
	CONSTRAINT "tenancies_dates_check" CHECK ("end_date" IS NULL OR "end_date" > "start_date"),
	CONSTRAINT "tenancies_active_check" CHECK ("status" <> 'active' OR ("tenant_user_id" IS NOT NULL AND "landlord_confirmed_at" IS NOT NULL AND "first_due_date" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "rent"."landlord_bank_accounts" ADD CONSTRAINT "landlord_bank_accounts_landlord_user_id_users_id_fk" FOREIGN KEY ("landlord_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."landlord_bank_accounts" ADD CONSTRAINT "landlord_bank_accounts_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."landlord_invitations" ADD CONSTRAINT "landlord_invitations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."landlord_invitations" ADD CONSTRAINT "landlord_invitations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."landlord_invitations" ADD CONSTRAINT "landlord_invitations_landlord_user_id_users_id_fk" FOREIGN KEY ("landlord_user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."landlord_invitations" ADD CONSTRAINT "landlord_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."landlord_invitations" ADD CONSTRAINT "landlord_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."landlord_profiles" ADD CONSTRAINT "landlord_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."property_landlords" ADD CONSTRAINT "property_landlords_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."property_landlords" ADD CONSTRAINT "property_landlords_landlord_user_id_users_id_fk" FOREIGN KEY ("landlord_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."property_landlords" ADD CONSTRAINT "property_landlords_invitation_id_landlord_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "rent"."landlord_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."property_landlords" ADD CONSTRAINT "property_landlords_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."property_landlords" ADD CONSTRAINT "property_landlords_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."charges" ADD CONSTRAINT "charges_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "rent"."tenancies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."payments" ADD CONSTRAINT "payments_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "rent"."charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."payments" ADD CONSTRAINT "payments_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "rent"."tenancies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."payments" ADD CONSTRAINT "payments_tenant_user_id_users_id_fk" FOREIGN KEY ("tenant_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."payments" ADD CONSTRAINT "payments_landlord_user_id_users_id_fk" FOREIGN KEY ("landlord_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."settlements" ADD CONSTRAINT "settlements_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "rent"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."settlements" ADD CONSTRAINT "settlements_landlord_user_id_users_id_fk" FOREIGN KEY ("landlord_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."settlements" ADD CONSTRAINT "settlements_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."tenancies" ADD CONSTRAINT "tenancies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "real_estate"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."tenancies" ADD CONSTRAINT "tenancies_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."tenancies" ADD CONSTRAINT "tenancies_property_landlord_id_property_landlords_id_fk" FOREIGN KEY ("property_landlord_id") REFERENCES "rent"."property_landlords"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."tenancies" ADD CONSTRAINT "tenancies_landlord_user_id_users_id_fk" FOREIGN KEY ("landlord_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."tenancies" ADD CONSTRAINT "tenancies_tenant_user_id_users_id_fk" FOREIGN KEY ("tenant_user_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."tenancies" ADD CONSTRAINT "tenancies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."tenancies" ADD CONSTRAINT "tenancies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent"."tenancies" ADD CONSTRAINT "tenancies_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "landlord_invitations_one_pending" ON "rent"."landlord_invitations" USING btree ("property_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "landlord_invitations_landlord_idx" ON "rent"."landlord_invitations" USING btree ("landlord_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "property_landlords_one_current" ON "rent"."property_landlords" USING btree ("property_id") WHERE "status" <> 'ended';--> statement-breakpoint
CREATE INDEX "property_landlords_landlord_idx" ON "rent"."property_landlords" USING btree ("landlord_user_id","status");--> statement-breakpoint
CREATE INDEX "property_landlords_review_idx" ON "rent"."property_landlords" USING btree ("status","proof_uploaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_tenancy_due_unique" ON "rent"."charges" USING btree ("tenancy_id","due_date");--> statement-breakpoint
CREATE INDEX "charges_status_due_idx" ON "rent"."charges" USING btree ("status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_success_per_charge" ON "rent"."payments" USING btree ("charge_id") WHERE "status" = 'paid' AND NOT "unwanted";--> statement-breakpoint
CREATE INDEX "payments_charge_idx" ON "rent"."payments" USING btree ("charge_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_tenant_idx" ON "rent"."payments" USING btree ("tenant_user_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_created_idx" ON "rent"."payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "settlements_status_idx" ON "rent"."settlements" USING btree ("status","due_by");--> statement-breakpoint
CREATE INDEX "settlements_landlord_idx" ON "rent"."settlements" USING btree ("landlord_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenancies_one_current" ON "rent"."tenancies" USING btree ("property_id") WHERE "status" IN ('pending', 'disputed', 'active');--> statement-breakpoint
CREATE INDEX "tenancies_tenant_idx" ON "rent"."tenancies" USING btree ("tenant_user_id","status");--> statement-breakpoint
CREATE INDEX "tenancies_landlord_idx" ON "rent"."tenancies" USING btree ("landlord_user_id","status");--> statement-breakpoint
CREATE INDEX "tenancies_org_idx" ON "rent"."tenancies" USING btree ("organization_id","status");--> statement-breakpoint
-- Hand-written below.
GRANT USAGE ON SCHEMA "rent" TO trustbrick_app;
--> statement-breakpoint
CREATE TRIGGER landlord_profiles_keep_reference_id BEFORE UPDATE OF reference_id ON "rent"."landlord_profiles"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER landlord_invitations_keep_reference_id BEFORE UPDATE OF reference_id ON "rent"."landlord_invitations"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER tenancies_keep_reference_id BEFORE UPDATE OF reference_id ON "rent"."tenancies"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER charges_keep_reference_id BEFORE UPDATE OF reference_id ON "rent"."charges"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER rent_payments_keep_reference_id BEFORE UPDATE OF reference_id ON "rent"."payments"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER settlements_keep_reference_id BEFORE UPDATE OF reference_id ON "rent"."settlements"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
