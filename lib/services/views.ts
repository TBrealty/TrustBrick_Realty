import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isReferenceId } from "@/lib/reference";

/**
 * Listing views: one row per visitor per listing per day, counting repeat views. The visitor
 * key is an HMAC (keyed with the app secret) of the user ID, or of IP and user agent for
 * visitors who aren't logged in, so neither can be recovered from the table.
 */
export async function recordListingView(referenceId: string, visitor: { userId: string | null; ip: string | null; userAgent: string | null }) {
  if (!isReferenceId(referenceId, "LST")) return;
  const identity = visitor.userId ? `u:${visitor.userId}` : `a:${visitor.ip ?? "?"}:${visitor.userAgent ?? "?"}`;
  const viewerKey = createHmac("sha256", env.BETTER_AUTH_SECRET).update(identity).digest("base64url").slice(0, 22);
  // The agent looking at their own listing is not a view.
  await db.execute(sql`
    INSERT INTO marketplace.listing_views (listing_id, viewer_key, viewed_on)
    SELECT l.id, ${viewerKey}, (now() AT TIME ZONE 'Asia/Kolkata')::date
      FROM marketplace.listings l
     WHERE l.reference_id = ${referenceId} AND l.status = 'published'
       AND NOT EXISTS (SELECT 1 FROM marketplace.listing_agents la WHERE la.listing_id = l.id AND la.agent_user_id = ${visitor.userId})
    ON CONFLICT (listing_id, viewed_on, viewer_key) DO UPDATE SET view_count = marketplace.listing_views.view_count + 1`);
}
