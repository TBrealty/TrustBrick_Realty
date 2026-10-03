#!/bin/bash
# Runs once, when the database volume is first created.
#
# Two roles, as the architecture requires:
#   trustbrick_owner  owns the schema and runs migrations
#   trustbrick_app    what the running app connects as: data access only, no DDL,
#                     and it cannot bypass row-level security
#
# Extensions are created here because PostGIS needs superuser rights. On a managed
# provider, enable the same list through the provider before running migrations.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS citext;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE EXTENSION IF NOT EXISTS ltree;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS btree_gist;

  CREATE ROLE trustbrick_owner LOGIN PASSWORD '${TRUSTBRICK_OWNER_PASSWORD}';
  CREATE ROLE trustbrick_app LOGIN PASSWORD '${TRUSTBRICK_APP_PASSWORD}' NOBYPASSRLS;

  GRANT CONNECT, CREATE ON DATABASE ${POSTGRES_DB} TO trustbrick_owner;
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO trustbrick_app;

  -- Anything the owner creates later is readable and writable by the app, never alterable.
  ALTER DEFAULT PRIVILEGES FOR ROLE trustbrick_owner
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trustbrick_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE trustbrick_owner
    GRANT USAGE, SELECT ON SEQUENCES TO trustbrick_app;

  -- Nobody gets to create objects in public by default.
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
