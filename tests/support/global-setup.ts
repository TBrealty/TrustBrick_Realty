import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Builds `trustbrick_test` from scratch: the same extensions, roles and default privileges as
 * db/init, then every migration as the owner role, then reference data. The superuser URL is
 * only used here, to create the database.
 */
const port = process.env.TRUSTBRICK_DB_PORT ?? "5434";
const SUPERUSER = process.env.TEST_DATABASE_SUPERUSER_URL ?? `postgres://postgres:postgres_dev_only@127.0.0.1:${port}`;
const DB = "trustbrick_test";

export default async function setup() {
  const admin = new pg.Client({ connectionString: `${SUPERUSER}/postgres` });
  await admin.connect();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [DB]);
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  const su = new pg.Client({ connectionString: `${SUPERUSER}/${DB}` });
  await su.connect();
  await su.query(`
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS citext;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS ltree;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    GRANT CONNECT, CREATE ON DATABASE ${DB} TO trustbrick_owner;
    GRANT CONNECT ON DATABASE ${DB} TO trustbrick_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE trustbrick_owner GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trustbrick_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE trustbrick_owner GRANT USAGE, SELECT ON SEQUENCES TO trustbrick_app;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;`);
  await su.end();

  const owner = new pg.Pool({ connectionString: `postgres://trustbrick_owner:owner_dev_only@127.0.0.1:${port}/${DB}` });
  await migrate(drizzle(owner), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
  await owner.end();

  const app = new pg.Client({ connectionString: `postgres://trustbrick_app:app_dev_only@127.0.0.1:${port}/${DB}` });
  await app.connect();
  const { seedReference } = await import("../../db/seed/reference.mjs");
  await app.query("BEGIN");
  await seedReference(app);
  await app.query("COMMIT");
  await app.end();
}
