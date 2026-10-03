import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { v7 as uuidv7 } from "uuid";
import type { Actor } from "@/lib/authz/actor";
import { listingScope } from "@/lib/authz/scope";
import { db } from "@/lib/db";
import { media, mediaLinks } from "@/lib/db/schema/real-estate";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { isEditable } from "@/lib/listings/lifecycle";
import { log } from "@/lib/log";
import { storage } from "@/lib/storage";
import { UPLOAD_KINDS, type UploadKind, sniff } from "@/lib/storage/sniff";
import { findListingInScope } from "./listings/access";

type Row = Record<string, unknown>;

const VARIANT_WIDTHS = [640, 1280, 1920] as const;
const MAX_PIXELS = 60_000_000;

export type MediaItem = {
  id: string;
  kind: UploadKind;
  mimeType: string;
  url: string;
  thumbnailUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  referenceId: string | null;
  originalFilename: string | null;
  sortOrder: number;
};

const kindOf = (mediaType: string): UploadKind =>
  mediaType === "floor_plan" ? "floor_plan" : mediaType === "video" ? "video" : mediaType === "document" ? "document" : "photo";

/** URL for a stored object: sample media live in /public, uploads are served by /media/… */
export function urlFor(provider: string, key: string): string {
  return provider === "public" ? key : `/media/${key}`;
}

export function toMediaItem(r: Row): MediaItem {
  const variants = (r.variants as { width: number; key: string }[] | null) ?? [];
  const provider = String(r.storage_provider);
  const key = String(r.storage_key);
  const pick = (width: number) => variants.find((v) => v.width === width)?.key;
  return {
    id: String(r.id),
    kind: kindOf(String(r.media_type)),
    mimeType: String(r.mime_type),
    url: urlFor(provider, pick(1920) ?? key),
    thumbnailUrl: variants.length ? urlFor(provider, pick(640) ?? key) : String(r.mime_type).startsWith("image/") ? urlFor(provider, key) : null,
    altText: (r.alt_text as string) ?? null,
    width: r.width === null ? null : Number(r.width),
    height: r.height === null ? null : Number(r.height),
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    referenceId: (r.reference_id as string) ?? null,
    originalFilename: (r.original_filename as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export async function listPropertyMedia(propertyId: string, options: { includePrivate: boolean }): Promise<MediaItem[]> {
  const { rows } = await db.execute(sql`
    SELECT m.*, ml.sort_order FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
     WHERE ml.property_id = ${propertyId} ${options.includePrivate ? sql`` : sql`AND NOT m.is_private`}
     ORDER BY ml.sort_order, m.created_at`);
  return (rows as Row[]).map(toMediaItem);
}

/** Reads a request body into memory, refusing to go past `max` bytes. */
async function readLimited(body: ReadableStream<Uint8Array>, max: number): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw invalid(`That file is too large. The limit is ${Math.round(max / 1024 / 1024)} MB.`);
    }
    chunks.push(value);
  }
  if (total === 0) throw invalid("That file is empty.");
  return Buffer.concat(chunks);
}

const safeFilename = (name: string | null) =>
  name ? name.replace(/[^\p{L}\p{N} ._()-]/gu, "").trim().slice(0, 120) || null : null;

/**
 * Stores an upload for a listing the actor may edit. The type comes from the bytes, images
 * are re-encoded (which also strips EXIF, including GPS), and nothing is linked to the
 * property until the bytes are safely stored.
 */
export async function uploadListingMedia(
  actor: Actor,
  referenceId: string,
  kind: UploadKind,
  body: ReadableStream<Uint8Array> | null,
  filename: string | null,
): Promise<MediaItem> {
  const rules = UPLOAD_KINDS[kind];
  const listing = await findListingInScope(actor, referenceId, "listings.edit");
  if (!isEditable(listing.status)) throw conflict("Withdraw the listing before changing its media.");
  if (!body) throw invalid("No file was received.");

  const countResult = await db.execute(sql`
    SELECT count(*)::int AS n FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
     WHERE ml.property_id = ${listing.propertyId} AND m.media_type = ${rules.mediaType}`);
  if (Number((countResult.rows[0] as Row).n) >= rules.maxPerProperty) {
    throw invalid(`You can add up to ${rules.maxPerProperty} ${rules.label.toLowerCase()}s.`);
  }

  const bytes = await readLimited(body, rules.maxBytes);
  const type = sniff(bytes.subarray(0, 32));
  if (!type || !(rules.families as readonly string[]).includes(type.family)) {
    const allowed = kind === "video" ? "MP4, MOV or WebM" : kind === "photo" ? "JPEG, PNG, WebP or AVIF" : "PDF or an image";
    throw invalid(`That file type isn't supported here. Use ${allowed}.`);
  }
  if (type.mime === "image/heic") throw invalid("HEIC photos aren't supported yet. Export the photo as JPEG and try again.");

  const mediaId = uuidv7();
  const folder = `properties/${listing.propertyId}/${mediaId}-${randomBytes(6).toString("hex")}`;
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const store = storage();
  const written: string[] = [];

  let storageKey: string;
  let mimeType = type.mime;
  let width: number | null = null;
  let height: number | null = null;
  let sizeBytes = bytes.byteLength;
  let variants: { width: number; key: string }[] | null = null;

  try {
    if (type.family === "image") {
      const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
      const meta = await image.metadata();
      if (!meta.width || !meta.height) throw invalid("That image couldn't be read.");
      if (kind === "photo" && Math.min(meta.width, meta.height) < 400) throw invalid("Photos must be at least 400 pixels on the short side.");
      // The stored original is re-encoded, never the uploaded bytes: no EXIF, no GPS, no smuggled payloads.
      const original = await image.clone().resize({ width: 3840, height: 3840, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      storageKey = `${folder}/original.jpg`;
      await store.put(storageKey, original.data);
      written.push(storageKey);
      mimeType = "image/jpeg";
      width = original.info.width;
      height = original.info.height;
      sizeBytes = original.data.byteLength;
      variants = [];
      for (const w of VARIANT_WIDTHS) {
        if (w >= original.info.width && w !== VARIANT_WIDTHS[0]) continue;
        const key = `${folder}/w${w}.webp`;
        const out = await sharp(original.data).resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        await store.put(key, out);
        written.push(key);
        variants.push({ width: w, key });
      }
    } else {
      storageKey = `${folder}/original.${type.ext}`;
      await store.put(storageKey, bytes);
      written.push(storageKey);
    }

    const inserted = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(media)
        .values({
          id: mediaId,
          storageKey,
          storageProvider: store.provider,
          mediaType: rules.mediaType,
          mimeType,
          sizeBytes,
          width,
          height,
          isPrivate: rules.private,
          checksum,
          variants,
          originalFilename: safeFilename(filename),
          uploadedBy: actor.userId,
          referenceId: kind === "document" ? sql`platform.gen_reference_id('DOC')` : null,
        })
        .returning();
      const sort = await tx.execute(sql`SELECT coalesce(max(sort_order), -1) + 1 AS next FROM real_estate.media_links WHERE property_id = ${listing.propertyId}`);
      const sortOrder = Number((sort.rows[0] as Row).next);
      await tx.insert(mediaLinks).values({ mediaId, propertyId: listing.propertyId, sortOrder });
      await tx.execute(sql`UPDATE marketplace.listings SET updated_at = now() WHERE id = ${listing.id}`);
      return { ...row, sortOrder };
    });

    return toMediaItem({
      ...inserted,
      storage_key: inserted.storageKey,
      storage_provider: inserted.storageProvider,
      media_type: inserted.mediaType,
      mime_type: inserted.mimeType,
      alt_text: inserted.altText,
      size_bytes: inserted.sizeBytes,
      reference_id: inserted.referenceId,
      original_filename: inserted.originalFilename,
      sort_order: inserted.sortOrder,
    });
  } catch (error) {
    // Don't leave orphaned bytes behind a failed upload.
    await store.remove(written).catch((e) => log.warn("media.cleanup_failed", { error: String(e) }));
    if (error instanceof AppError) throw error;
    if ((error as Error)?.message?.includes("Input image exceeds pixel limit")) throw invalid("That image is too large to process.");
    if ((error as Error)?.message?.match(/unsupported image format|corrupt|premature end/i)) throw invalid("That image appears to be damaged.");
    throw error;
  }
}

async function editableMedia(actor: Actor, referenceId: string, mediaId: string) {
  const listing = await findListingInScope(actor, referenceId, "listings.edit");
  if (!isEditable(listing.status)) throw conflict("Withdraw the listing before changing its media.");
  const [row] = await db
    .select({ id: media.id, storageKey: media.storageKey, variants: media.variants })
    .from(media)
    .innerJoin(mediaLinks, eq(mediaLinks.mediaId, media.id))
    .where(and(eq(media.id, mediaId), eq(mediaLinks.propertyId, listing.propertyId)));
  if (!row) throw notFound();
  return { listing, row };
}

export async function deleteListingMedia(actor: Actor, referenceId: string, mediaId: string) {
  const { row } = await editableMedia(actor, referenceId, mediaId);
  await db.delete(media).where(eq(media.id, row.id));
  await storage()
    .remove([row.storageKey, ...(row.variants ?? []).map((v) => v.key)])
    .catch((e) => log.warn("media.cleanup_failed", { error: String(e) }));
}

export async function updateMediaAlt(actor: Actor, referenceId: string, mediaId: string, altText: string) {
  const { row } = await editableMedia(actor, referenceId, mediaId);
  const alt = altText.trim().slice(0, 200) || null;
  await db.update(media).set({ altText: alt, updatedAt: new Date() }).where(eq(media.id, row.id));
}

/** Sets photo order. Only media already linked to this property can be reordered. */
export async function reorderListingMedia(actor: Actor, referenceId: string, orderedIds: string[]) {
  const listing = await findListingInScope(actor, referenceId, "listings.edit");
  if (!isEditable(listing.status)) throw conflict("Withdraw the listing before changing its media.");
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.slice(0, 100).entries()) {
      await tx
        .update(mediaLinks)
        .set({ sortOrder: index })
        .where(and(eq(mediaLinks.mediaId, id), eq(mediaLinks.propertyId, listing.propertyId)));
    }
  });
}

/**
 * For the /media route. Public media is served to anyone who has the (unguessable) URL;
 * private media (documents) only to someone who could open a listing of that property.
 */
export async function resolveMediaForServing(key: string, actor: Actor | null): Promise<{ key: string; mimeType: string; isPrivate: boolean } | null> {
  const match = /^properties\/([0-9a-f-]{36})\/([0-9a-f-]{36})-[0-9a-f]{12}\/(original\.[a-z0-9]{2,5}|w\d{3,4}\.webp)$/.exec(key);
  if (!match) return null;
  const [, propertyId, mediaId, file] = match;
  const { rows } = await db.execute(sql`
    SELECT m.storage_key, m.mime_type, m.is_private, m.variants FROM real_estate.media m
      JOIN real_estate.media_links ml ON ml.media_id = m.id AND ml.property_id = ${propertyId}
     WHERE m.id = ${mediaId}`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  const variants = (r.variants as { width: number; key: string }[] | null) ?? [];
  const isOriginal = r.storage_key === key;
  if (!isOriginal && !variants.some((v) => v.key === key)) return null;

  if (r.is_private) {
    if (!actor) return null;
    try {
      const allowed = await db.execute(sql`
        SELECT 1 FROM marketplace.listings l WHERE l.property_id = ${propertyId} AND ${listingScope(actor, "listings.view")} LIMIT 1`);
      if (allowed.rows.length === 0) return null;
    } catch {
      return null;
    }
  }
  return { key, mimeType: file.endsWith(".webp") ? "image/webp" : String(r.mime_type), isPrivate: Boolean(r.is_private) };
}
