-- The app role reads and writes identity data but can never alter its structure.
-- Table-level privileges come from the default privileges set in db/init; schema
-- USAGE cannot be set by default privileges, so it is granted here explicitly.
GRANT USAGE ON SCHEMA "identity" TO trustbrick_app;
--> statement-breakpoint
-- Defence in depth: nobody but the owner creates objects in this schema.
REVOKE CREATE ON SCHEMA "identity" FROM PUBLIC;
