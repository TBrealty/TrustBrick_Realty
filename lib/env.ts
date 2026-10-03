import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at startup. A missing or malformed value
 * fails loudly here instead of surfacing later as a confusing runtime error.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
}

export const env = parsed.data;
export const isDev = env.NODE_ENV === "development";
