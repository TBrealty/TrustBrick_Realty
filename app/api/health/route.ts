import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";

const DB_TIMEOUT_MS = 3000;

/**
 * For uptime monitors (deploy/README.md, "Monitoring"): 200 when the site is up and can reach its
 * database, 503 when it's up but the database isn't answering. Says nothing else about the server.
 */
export async function GET() {
  await connection(); // answered fresh every time, never cached or built ahead
  const started = performance.now();
  let database: "ok" | "unreachable" = "unreachable";
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), DB_TIMEOUT_MS)),
    ]);
    database = "ok";
  } catch {
    // Reported by the status code; the details are in the server's logs.
  }
  const ok = database === "ok";
  return Response.json(
    { status: ok ? "ok" : "degraded", database, responseMs: Math.round(performance.now() - started) },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
