-- Constraints drizzle-kit cannot express, and access for the app role.

-- A listing's price periods may never overlap: at any instant there is exactly one price.
-- Needs btree_gist (created in db/init) for the uuid equality inside a GiST index.
ALTER TABLE "marketplace"."listing_prices"
  ADD CONSTRAINT "listing_prices_no_overlap"
  EXCLUDE USING gist ("listing_id" WITH =, "effective" WITH &&);
--> statement-breakpoint

-- Table privileges come from the default privileges set in db/init; schema USAGE must be granted explicitly.
GRANT USAGE ON SCHEMA "orgs", "geography", "real_estate", "marketplace" TO trustbrick_app;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "orgs", "geography", "real_estate", "marketplace" FROM PUBLIC;
