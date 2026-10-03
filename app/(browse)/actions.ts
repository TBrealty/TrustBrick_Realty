"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { savedProperties } from "@/lib/db/schema/marketplace";
import { properties } from "@/lib/db/schema/real-estate";
import { LISTING_KINDS, type ListingKind, parseFilters, type RawSearchParams } from "@/lib/listings/filters";
import { type ListingSummary, savedPropertyIds, searchListings } from "@/lib/listings/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BookmarkResult = { ok: true; saved: boolean } | { ok: false; reason: "unauthenticated" | "not_found" | "invalid" };

/**
 * Sets a bookmark to an explicit state rather than toggling, so a double click
 * or a retried request can never flip it back.
 */
export async function setBookmarkAction(propertyId: string, saved: boolean): Promise<BookmarkResult> {
  if (typeof propertyId !== "string" || !UUID.test(propertyId) || typeof saved !== "boolean") return { ok: false, reason: "invalid" };

  const session = await getSession();
  if (!session) return { ok: false, reason: "unauthenticated" };
  const userId = session.user.id;

  if (saved) {
    const exists = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.id, propertyId), isNull(properties.deletedAt)))
      .limit(1);
    if (!exists.length) return { ok: false, reason: "not_found" };
    await db.insert(savedProperties).values({ userId, propertyId }).onConflictDoNothing();
  } else {
    await db.delete(savedProperties).where(and(eq(savedProperties.userId, userId), eq(savedProperties.propertyId, propertyId)));
  }
  return { ok: true, saved };
}

export type LoadMoreResult = { items: ListingSummary[]; nextCursor: string | null; savedIds: string[] };

/** The next page of results for the same filters, for the "Show more" button. */
export async function loadMoreListingsAction(kind: ListingKind, query: string, cursor: string): Promise<LoadMoreResult> {
  if (!(LISTING_KINDS as readonly string[]).includes(kind) || typeof query !== "string" || typeof cursor !== "string" || cursor.length > 200) {
    return { items: [], nextCursor: null, savedIds: [] };
  }

  const params: RawSearchParams = {};
  for (const [key, value] of new URLSearchParams(query.slice(0, 2000))) {
    const existing = params[key];
    params[key] = existing === undefined ? value : ([] as string[]).concat(existing, value);
  }
  const filters = { ...parseFilters(kind, params), cursor };
  const [result, session] = await Promise.all([searchListings(kind, filters), getSession()]);
  const saved = session ? await savedPropertyIds(session.user.id, result.items.map((i) => i.propertyId)) : new Set<string>();

  return { items: result.items, nextCursor: result.nextCursor, savedIds: [...saved] };
}

