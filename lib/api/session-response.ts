import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** What signing in returns to the app (password sign-in, or confirming the email's code): the session token, its expiry, and who it is. */
export async function sessionResponse(token: string, user: { name: string; email: string }) {
  const { rows } = await db.execute(sql`
    SELECT s.expires_at, u.reference_id FROM identity.sessions s JOIN identity.users u ON u.id = s.user_id WHERE s.token = ${token}`);
  const r = rows[0] as { expires_at: string; reference_id: string };
  return { token, expiresAt: new Date(r.expires_at).toISOString(), user: { referenceId: r.reference_id, name: user.name, email: user.email } };
}
