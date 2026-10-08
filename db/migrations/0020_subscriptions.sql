CREATE TABLE "finance"."plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"audience" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"monthly_price" numeric(16, 2) NOT NULL,
	"yearly_price" numeric(16, 2) NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"features" jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code"),
	CONSTRAINT "plans_audience_check" CHECK ("audience" IN ('customer', 'partner')),
	CONSTRAINT "plans_price_check" CHECK ("monthly_price" >= 0 AND "yearly_price" >= 0),
	CONSTRAINT "plans_trial_check" CHECK ("trial_days" BETWEEN 0 AND 90)
);
--> statement-breakpoint
CREATE TABLE "finance"."subscription_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"amount" numeric(16, 2),
	"payment_reference" text,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance"."subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference_id" text DEFAULT platform.gen_reference_id('SUB') NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"plan_id" uuid NOT NULL,
	"billing_cycle" text NOT NULL,
	"status" text NOT NULL,
	"price" numeric(16, 2) NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_ref" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_reference_id_unique" UNIQUE("reference_id"),
	CONSTRAINT "subscriptions_subject_check" CHECK (num_nonnulls("user_id", "organization_id") = 1),
	CONSTRAINT "subscriptions_cycle_check" CHECK ("billing_cycle" IN ('monthly', 'yearly')),
	CONSTRAINT "subscriptions_status_check" CHECK ("status" IN ('trialing', 'pending_payment', 'active', 'cancelled', 'expired')),
	CONSTRAINT "subscriptions_trial_check" CHECK ("status" <> 'trialing' OR "trial_ends_at" IS NOT NULL),
	CONSTRAINT "subscriptions_active_check" CHECK ("status" <> 'active' OR ("current_period_start" IS NOT NULL AND "current_period_end" IS NOT NULL)),
	CONSTRAINT "subscriptions_provider_check" CHECK ("provider" IN ('manual', 'razorpay'))
);
--> statement-breakpoint
ALTER TABLE "finance"."subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "finance"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."subscription_events" ADD CONSTRAINT "subscription_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "orgs"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "finance"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."subscriptions" ADD CONSTRAINT "subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_events_sub_idx" ON "finance"."subscription_events" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "finance"."subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "finance"."subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "finance"."subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_per_user" ON "finance"."subscriptions" USING btree ("user_id") WHERE "user_id" IS NOT NULL AND "status" IN ('trialing', 'pending_payment', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_per_org" ON "finance"."subscriptions" USING btree ("organization_id") WHERE "organization_id" IS NOT NULL AND "status" IN ('trialing', 'pending_payment', 'active');--> statement-breakpoint
CREATE TRIGGER subscriptions_keep_reference_id BEFORE UPDATE OF reference_id ON "finance"."subscriptions"
  FOR EACH ROW EXECUTE FUNCTION platform.keep_reference_id();
--> statement-breakpoint
CREATE TRIGGER subscription_events_append_only BEFORE UPDATE ON "finance"."subscription_events"
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();
--> statement-breakpoint
-- Starting plans. Prices are placeholders, changed by the SuperAdmin; features not built yet say so.
INSERT INTO "finance"."plans" (id, code, audience, name, tagline, monthly_price, yearly_price, trial_days, highlighted, sort_order, limits, features) VALUES
  (gen_random_uuid(), 'customer_free', 'customer', 'Free', 'Everything you need to find a home or a stay.', 0, 0, 0, false, 1, '{}',
   '[{"key":"search","label":"Search, save and compare homes"},{"key":"stays","label":"Book stays and message hosts"},{"key":"tools","label":"Buying, renting and stay calculators and guides"},{"key":"legal","label":"Legal Verification, paid per request"}]'),
  (gen_random_uuid(), 'customer_plus', 'customer', 'Plus', 'Know the neighbourhood before you visit.', 199, 1999, 14, true, 2, '{"ai_locality_reports":20}',
   '[{"key":"everything_free","label":"Everything in Free"},{"key":"ai_locality","label":"AI locality insights","detail":"Schools, commute, safety, prices and what''s changing, for any property: 20 reports a month","comingSoon":true},{"key":"price_alerts","label":"Price-drop alerts on saved homes","comingSoon":true},{"key":"legal_discount","label":"10% off Legal Verification","comingSoon":true},{"key":"priority_support","label":"Priority support","comingSoon":true}]'),
  (gen_random_uuid(), 'partner_free', 'partner', 'Free', 'List, manage leads and take bookings.', 0, 0, 0, false, 1, '{}',
   '[{"key":"listings","label":"List properties and stays"},{"key":"crm","label":"Leads, visits and bookings"},{"key":"tools","label":"Performance dashboard"},{"key":"commission","label":"Commission at the standard rates"}]'),
  (gen_random_uuid(), 'partner_pro', 'partner', 'Pro', 'Win clients with AI-powered locality insights.', 999, 9999, 14, true, 2, '{"ai_locality_reports":50,"featured_listings":3}',
   '[{"key":"everything_free","label":"Everything in Free"},{"key":"ai_locality","label":"AI locality insights for your listings","detail":"50 reports a month to share with clients","comingSoon":true},{"key":"featured","label":"3 featured listings at a time","detail":"Shown first in search","comingSoon":true},{"key":"analytics","label":"Advanced performance analytics","comingSoon":true},{"key":"priority_review","label":"Priority listing review","comingSoon":true}]'),
  (gen_random_uuid(), 'partner_business', 'partner', 'Business', 'For brokerages and teams.', 2499, 24999, 14, false, 3, '{"ai_locality_reports":200,"featured_listings":10}',
   '[{"key":"everything_pro","label":"Everything in Pro"},{"key":"ai_locality","label":"AI locality insights","detail":"200 reports a month across your team","comingSoon":true},{"key":"featured","label":"10 featured listings at a time","comingSoon":true},{"key":"team_reports","label":"Reports for every agent on your team","comingSoon":true},{"key":"account_manager","label":"A dedicated account manager","comingSoon":true}]');
