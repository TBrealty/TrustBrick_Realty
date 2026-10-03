import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as crm from "./schema/crm";
import * as finance from "./schema/finance";
import * as geography from "./schema/geography";
import * as identity from "./schema/identity";
import * as marketplace from "./schema/marketplace";
import * as orgs from "./schema/orgs";
import * as platform from "./schema/platform";
import * as realEstate from "./schema/real-estate";
import * as staysSchema from "./schema/stays";
import * as trust from "./schema/trust";

export const schema = { ...identity, ...orgs, ...geography, ...realEstate, ...marketplace, ...platform, ...crm, ...trust, ...staysSchema, ...finance };

// Reuse one pool across hot reloads in development instead of leaking a new one per edit.
const globalForDb = globalThis as unknown as { trustbrickPool?: Pool };

const pool =
  globalForDb.trustbrickPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (env.NODE_ENV !== "production") globalForDb.trustbrickPool = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;
/** A transaction handle, for services that must write several rows atomically. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
