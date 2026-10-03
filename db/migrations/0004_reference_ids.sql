-- Reference IDs and platform guard functions (docs/portals/README.md §8).
-- Hand-written: drizzle-kit cannot express functions or triggers.

CREATE SCHEMA IF NOT EXISTS "platform";
--> statement-breakpoint
GRANT USAGE ON SCHEMA "platform" TO trustbrick_app;
--> statement-breakpoint

-- PREFIX-XXXXXXXX: 40 random bits as eight Crockford base32 characters (no I, L, O, U),
-- so references are short, unambiguous when read aloud, and reveal nothing about row order.
CREATE FUNCTION platform.gen_reference_id(prefix text) RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public
AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea := gen_random_bytes(5);
  bits bigint := 0;
  result text := '';
BEGIN
  IF prefix !~ '^[A-Z]{2,5}$' THEN
    RAISE EXCEPTION 'invalid reference prefix: %', prefix;
  END IF;
  FOR i IN 0..4 LOOP
    bits := (bits << 8) | get_byte(bytes, i);
  END LOOP;
  FOR i IN 1..8 LOOP
    result := substr(alphabet, (bits & 31)::int + 1, 1) || result;
    bits := bits >> 5;
  END LOOP;
  RETURN prefix || '-' || result;
END
$$;
--> statement-breakpoint

-- Attached to every table with a reference_id: once issued, a reference never changes.
CREATE FUNCTION platform.keep_reference_id() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference_id IS DISTINCT FROM OLD.reference_id AND OLD.reference_id IS NOT NULL THEN
    RAISE EXCEPTION 'reference_id is immutable (%)', OLD.reference_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- Attached to append-only tables. Applies to every role, including the owner.
CREATE FUNCTION platform.reject_modification() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;
