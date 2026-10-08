import "server-only";
import { sql } from "drizzle-orm";
import { cache } from "react";
import type { Actor } from "@/lib/authz/actor";
import { listingScope } from "@/lib/authz/scope";
import { db } from "@/lib/db";
import { conflict, invalid } from "@/lib/errors";
import { isEditable } from "@/lib/listings/lifecycle";
import { TOUR_FEATURE, TOUR_LINK_HELP, type TourData, type TourLink, isLiveForTours, parseTourLink } from "@/lib/tours/terms";
import { findListingInScope } from "./listings/access";
import { type MediaItem, toMediaItem } from "./media";
import { entitlementsFor } from "./subscriptions";
import { recordTourChange, tourHiddenFor } from "./tour-review";

type Row = Record<string, unknown>;

/** Who is looking: the signed-in user, and their workspace if they're in one. */
export type TourViewer = { userId: string | null; actor: Actor | null };

/** Whether the viewer's own subscription includes virtual tours (Plus). */
export const hasTourPlan = cache(async (userId: string | null): Promise<boolean> => {
  if (!userId) return false;
  return (await entitlementsFor({ kind: "user", userId })).has(TOUR_FEATURE);
});

/**
 * Who may open a property's tour: the listing's own team and reviewers (anyone who could see the
 * listing in their workspace), and Plus members, for a listing that's public and a tour Trustbrick
 * hasn't hidden.
 */
export async function canViewTour(viewer: TourViewer, propertyId: string): Promise<boolean> {
  if (viewer.actor) {
    const { rows } = await db.execute(sql`
      SELECT 1 FROM marketplace.listings l WHERE l.property_id = ${propertyId} AND l.deleted_at IS NULL AND ${listingScope(viewer.actor, "listings.view")} LIMIT 1`);
    if (rows.length > 0) return true;
  }
  if (!viewer.userId) return false;
  const { rows } = await db.execute(sql`
    SELECT 1 FROM marketplace.listings l JOIN real_estate.properties p ON p.id = l.property_id
     WHERE l.property_id = ${propertyId} AND l.deleted_at IS NULL AND p.tour_hidden_at IS NULL
       AND l.status IN ('published', 'transacted', 'expired') LIMIT 1`);
  return rows.length > 0 && hasTourPlan(viewer.userId);
}

export type Tour = { rooms: MediaItem[]; model: MediaItem | null; link: TourLink | null };

/** Everything in a property's tour, with file URLs. Only for viewers `canViewTour` lets in. */
export async function tourForProperty(propertyId: string): Promise<Tour> {
  const [media, property] = await Promise.all([
    db.execute(sql`
      SELECT m.*, ml.sort_order FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
       WHERE ml.property_id = ${propertyId} AND m.media_type IN ('panorama', 'model_3d')
       ORDER BY ml.sort_order, m.created_at`),
    db.execute(sql`SELECT tour_url FROM real_estate.properties WHERE id = ${propertyId}`),
  ]);
  const items = (media.rows as Row[]).map(toMediaItem);
  const url = (property.rows[0] as Row | undefined)?.tour_url as string | null | undefined;
  return {
    rooms: items.filter((i) => i.kind === "panorama"),
    model: items.find((i) => i.kind === "model_3d") ?? null,
    link: url ? parseTourLink(url) : null,
  };
}

/**
 * Sets or clears the hosted 3D tour link. Saved in its clean form, rebuilt from the provider's ID.
 * On a live listing it shows straight away and goes to Approvals as a tour review.
 */
export async function updateTourLink(actor: Actor, referenceId: string, raw: string): Promise<TourLink | null> {
  const listing = await findListingInScope(actor, referenceId, "listings.edit");
  const live = !isEditable(listing.status);
  if (live && !isLiveForTours(listing.status)) throw conflict("The tour can't be changed while the listing is being reviewed.");
  const value = raw.trim();
  const link = value ? parseTourLink(value) : null;
  if (value && !link) throw invalid("Please check the highlighted fields.", { tourUrl: `That link isn't one we can show. ${TOUR_LINK_HELP}` });
  await db.transaction(async (tx) => {
    const before = await tx.execute(sql`SELECT tour_url FROM real_estate.properties WHERE id = ${listing.propertyId} FOR UPDATE`);
    const previous = ((before.rows[0] as Row | undefined)?.tour_url as string | null) ?? null;
    if (previous === (link?.url ?? null)) return;
    await tx.execute(sql`UPDATE real_estate.properties SET tour_url = ${link?.url ?? null}, updated_at = now() WHERE id = ${listing.propertyId}`);
    await tx.execute(sql`UPDATE marketplace.listings SET updated_at = now() WHERE id = ${listing.id}`);
    if (live) await recordTourChange(tx, actor, listing, link ? `${previous ? "Changed" : "Added"} the ${link.provider.name} tour link` : "Removed the hosted tour link");
  });
  return link;
}

/** The tour, shaped for the viewer. */
export async function tourDataForProperty(propertyId: string): Promise<TourData> {
  const [tour, hidden] = await Promise.all([tourForProperty(propertyId), tourHiddenFor(propertyId)]);
  return {
    hidden,
    rooms: tour.rooms.map((r) => ({ id: r.id, name: r.altText ?? "", url: r.url, thumbnailUrl: r.thumbnailUrl })),
    model: tour.model ? { url: tour.model.url, name: tour.model.originalFilename ?? "3D model" } : null,
    link: tour.link ? { provider: tour.link.provider.name, url: tour.link.url } : null,
  };
}
