#!/usr/bin/env bash
# One-time setup of the Amazon RDS database for Trustbrick (deploy/README.md, step 6).
# Run on the EC2 server, from the repository:  bash deploy/rds-init.sh
#
# It signs in as the RDS master user and:
#   - creates the `trustbrick` database (if RDS didn't already);
#   - turns on the extensions Trustbrick uses (PostGIS and friends);
#   - creates its two logins, as db/init does for local development:
#       trustbrick_owner  owns the schema and runs migrations
#       trustbrick_app    what the website connects as: data only, no schema changes.
# Safe to run again: it only adds what's missing and resets the two passwords from .env.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
: "${DB_HOST:?Set DB_HOST in .env}" "${DB_MASTER_USER:?Set DB_MASTER_USER in .env}" "${DB_MASTER_PASSWORD:?Set DB_MASTER_PASSWORD in .env}"
: "${TRUSTBRICK_OWNER_PASSWORD:?Set TRUSTBRICK_OWNER_PASSWORD in .env}" "${TRUSTBRICK_APP_PASSWORD:?Set TRUSTBRICK_APP_PASSWORD in .env}"

# Amazon's certificates, so the connection is encrypted and the server is verified.
curl -fsSL -o rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

# psql from a container, so nothing needs installing on the server.
sql() {
  local db="$1"; shift
  docker run --rm -i -v "$PWD/rds-ca.pem:/ca.pem:ro" -e PGPASSWORD="$DB_MASTER_PASSWORD" postgres:17-alpine \
    psql "host=$DB_HOST port=5432 user=$DB_MASTER_USER dbname=$db sslmode=verify-full sslrootcert=/ca.pem" -v ON_ERROR_STOP=1 -q "$@"
}

echo "▸ Connecting to $DB_HOST"
if [ "$(sql postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'trustbrick'")" != "1" ]; then
  echo "▸ Creating the trustbrick database"
  sql postgres -c "CREATE DATABASE trustbrick"
fi

echo "▸ Extensions and logins"
sql trustbrick <<SQL
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trustbrick_owner') THEN
    CREATE ROLE trustbrick_owner LOGIN PASSWORD '${TRUSTBRICK_OWNER_PASSWORD}';
  ELSE
    ALTER ROLE trustbrick_owner PASSWORD '${TRUSTBRICK_OWNER_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trustbrick_app') THEN
    CREATE ROLE trustbrick_app LOGIN PASSWORD '${TRUSTBRICK_APP_PASSWORD}' NOBYPASSRLS;
  ELSE
    ALTER ROLE trustbrick_app PASSWORD '${TRUSTBRICK_APP_PASSWORD}';
  END IF;
END
\$\$;

-- RDS's master user isn't a true superuser: it needs to be a member of the owner role to set
-- the owner's default privileges below.
GRANT trustbrick_owner TO CURRENT_USER;

GRANT CONNECT, CREATE ON DATABASE trustbrick TO trustbrick_owner;
GRANT CONNECT ON DATABASE trustbrick TO trustbrick_app;

-- Anything the owner creates later is readable and writable by the app, never alterable.
ALTER DEFAULT PRIVILEGES FOR ROLE trustbrick_owner GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trustbrick_app;
ALTER DEFAULT PRIVILEGES FOR ROLE trustbrick_owner GRANT USAGE, SELECT ON SEQUENCES TO trustbrick_app;

-- Nobody gets to create objects in public by default.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL

echo "✓ The database is ready. Next: bash deploy/deploy.sh"
