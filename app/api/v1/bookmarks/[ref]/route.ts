import { and, eq, sql } from "drizzle-orm";
import { apiRoute } from "@/lib/api/http";
import { db } from "@/lib/db";
import { savedProperties } from "@/lib/db/schema/marketplace";
import { notFound } from "@/lib/errors";
import { isReferenceId } from "@/lib/reference";

/** A listing's property, if the listing is public. Saving keeps the home, whatever happens to the listing. */
async function propertyOf(ref: string): Promise<string> {
  if (!isReferenceId(ref, "LST")) throw notFound();
  const { rows } = await db.execute(sql`
    SELECT property_id FROM marketplace.listings WHERE reference_id = ${ref} AND deleted_at IS NULL AND status IN ('published', 'transacted', 'expired')`);
  const r = rows[0] as { property_id: string } | undefined;
  if (!r) throw notFound();
  return r.property_id;
}

/** Saves a home (by any of its listings' references). */
export const PUT = apiRoute<{ ref: string }>("v1.bookmarks.save", { auth: "user" }, async ({ params, person }) => {
  const propertyId = await propertyOf(params.ref);
  await db.insert(savedProperties).values({ userId: person!.userId, propertyId }).onConflictDoNothing();
  return { saved: true };
});

/** Removes a saved home. */
export const DELETE = apiRoute<{ ref: string }>("v1.bookmarks.remove", { auth: "user" }, async ({ params, person }) => {
  const propertyId = await propertyOf(params.ref);
  await db.delete(savedProperties).where(and(eq(savedProperties.userId, person!.userId), eq(savedProperties.propertyId, propertyId)));
  return { saved: false };
});
