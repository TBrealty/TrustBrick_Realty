import { and, eq, ne } from "drizzle-orm";
import { apiRoute } from "@/lib/api/http";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema/identity";

/** Signs out everywhere else: every session but this one ends. */
export const DELETE = apiRoute("v1.me.sessions_revoke", { auth: "user" }, async ({ person }) => {
  const p = person!;
  const removed = await db.delete(sessions).where(and(eq(sessions.userId, p.userId), ne(sessions.id, p.sessionId))).returning({ id: sessions.id });
  return { signedOut: removed.length };
});
