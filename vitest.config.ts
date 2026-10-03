import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration tests run the real services against a real PostgreSQL database,
 * `trustbrick_test`, which the global setup drops, recreates and migrates on every run.
 * Nothing touches the development database.
 */
const port = process.env.TRUSTBRICK_DB_PORT ?? "5434";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // Next's guard against importing server modules into client bundles; meaningless in tests.
      "server-only": path.resolve(__dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    // One database, so test files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: `postgres://trustbrick_app:app_dev_only@127.0.0.1:${port}/trustbrick_test`,
      DATABASE_URL_MIGRATIONS: `postgres://trustbrick_owner:owner_dev_only@127.0.0.1:${port}/trustbrick_test`,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    },
  },
});
