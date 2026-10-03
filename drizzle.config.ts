import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env.local explicitly.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Fall back to the ambient environment (CI, deploy pipelines).
}

const url = process.env.DATABASE_URL_MIGRATIONS;
if (!url) throw new Error("DATABASE_URL_MIGRATIONS is not set. See .env.example.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/*.ts",
  out: "./db/migrations",
  // Migrations connect as the schema owner, never as the app role.
  dbCredentials: { url },
  schemaFilter: ["identity", "orgs", "geography", "real_estate", "marketplace", "platform", "crm", "trust", "stays", "finance"],
  strict: true,
  verbose: true,
});
