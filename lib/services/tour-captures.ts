import "server-only";
import { sql } from "drizzle-orm";
import { after } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { type Actor, loadActor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import type { CaptureShot } from "@/lib/db/schema/marketplace";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { storage } from "@/lib/storage";
import { sniff } from "@/lib/storage/sniff";
import { UPLOAD_KINDS } from "@/lib/storage/sniff";
import { findListingInScope } from "./listings/access";
import { assertTourChangeable, updateMediaAlt, uploadListingMedia } from "./media";
import { notify } from "./notifications";

/**
 * 360° photos taken with the app's guided camera (mobile: partner/listing/[ref]/capture).
 *
 * The app photographs a room in about 30 directions, recording where the phone pointed for each.
 * It opens a capture, uploads the photos one by one (each can be retried), then finishes it. The
 * stitching service (stitcher/, STITCHER_URL) joins them into one equirectangular photo, which is
 * then added to the listing exactly like an uploaded 360° photo: the same checks, the same review
 * on a live listing. The individual photos are deleted afterwards.
 *
 * Captures are processed after the request that finishes them, and again by
 * `POST /api/internal/captures` (a scheduler) for anything left waiting.
 */

type Row = Record<string, unknown>;

const SHOT_MAX_BYTES = 12 * 1024 * 1024;
/** Photos are scaled to this long side before stitching: plenty for a 6000×3000 panorama, and bounded memory. */
const SHOT_LONG_SIDE = 2000;
const MIN_SHOTS = 12;
const MAX_ATTEMPTS = 3;
/** A capture still "stitching" after this long was abandoned (the server restarted); it's picked up again. */
const STALE_MINUTES = 15;

const stitcherUrl = () => (process.env.STITCHER_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");

export type CaptureStatus = "uploading" | "queued" | "stitching" | "done" | "failed";
export type CaptureView = { id: string; roomName: string; status: CaptureStatus; error: string | null; shots: number; shotCount: number; createdAt: string };

const toView = (r: Row): CaptureView => ({
  id: String(r.id),
  roomName: String(r.room_name),
  status: r.status as CaptureStatus,
  error: (r.error as string) ?? null,
  shots: Array.isArray(r.shots) ? (r.shots as unknown[]).length : 0,
  shotCount: Number(r.shot_count),
  createdAt: new Date(r.created_at as string).toISOString(),
});

export const captureSchema = z.object({
  roomName: z.string().trim().min(1, "Name the room").max(80, "Use 80 characters or fewer"),
  hfov: z.coerce.number().min(20).max(120),
  shotCount: z.coerce.number().int().min(MIN_SHOTS).max(60),
});

/** Opens a capture for a room. The tour must be changeable now, and have room for another 360° photo. */
export async function startCapture(actor: Actor, listingReference: string, raw: unknown): Promise<{ id: string }> {
  const parsed = captureSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const listing = await findListingInScope(actor, listingReference, "listings.edit");
  assertTourChangeable(listing.status);
  const { rows } = await db.execute(sql`
    SELECT (SELECT count(*) FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
             WHERE ml.property_id = ${listing.propertyId} AND m.media_type = 'panorama')::int
         + (SELECT count(*) FROM marketplace.tour_captures WHERE listing_id = ${listing.id} AND status IN ('uploading', 'queued', 'stitching'))::int AS n`);
  if (Number((rows[0] as Row).n) >= UPLOAD_KINDS.panorama.maxPerProperty) {
    throw invalid(`A tour can have up to ${UPLOAD_KINDS.panorama.maxPerProperty} 360° photos.`);
  }
  const input = parsed.data;
  const created = await db.execute(sql`
    INSERT INTO marketplace.tour_captures (id, listing_id, created_by, membership_id, room_name, hfov, shot_count)
    VALUES (gen_random_uuid(), ${listing.id}, ${actor.userId}, ${actor.membershipId}, ${input.roomName}, ${input.hfov}, ${input.shotCount})
    RETURNING id`);
  return { id: String((created.rows[0] as Row).id) };
}

async function ownCapture(actor: Actor, captureId: string): Promise<Row> {
  if (!z.uuid().safeParse(captureId).success) throw notFound();
  const { rows } = await db.execute(sql`SELECT * FROM marketplace.tour_captures WHERE id = ${captureId} AND created_by = ${actor.userId}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return r;
}

const angle = (value: unknown, min: number, max: number, name: string) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw invalid(`${name} must be between ${min} and ${max} degrees.`);
  return Math.round(n * 100) / 100;
};

/** One photo of a capture (sending it again replaces it, so a retried upload is harmless). */
export async function putCaptureShot(
  actor: Actor,
  captureId: string,
  index: number,
  direction: { yaw: unknown; pitch: unknown; roll: unknown },
  body: ReadableStream<Uint8Array> | null,
): Promise<{ received: number; of: number }> {
  const capture = await ownCapture(actor, captureId);
  if (capture.status !== "uploading") throw conflict("This capture is already complete.");
  if (!Number.isInteger(index) || index < 0 || index >= Number(capture.shot_count)) throw invalid("That photo isn't part of this capture.");
  const shot = { yaw: angle(direction.yaw, -360, 360, "Yaw"), pitch: angle(direction.pitch, -90, 90, "Pitch"), roll: angle(direction.roll, -180, 180, "Roll") };
  if (!body) throw invalid("No photo was received.");

  const bytes = Buffer.from(await new Response(body).arrayBuffer());
  if (bytes.byteLength === 0) throw invalid("That photo is empty.");
  if (bytes.byteLength > SHOT_MAX_BYTES) throw invalid("That photo is too large.");
  const type = sniff(bytes.subarray(0, 32));
  if (!type || type.family !== "image") throw invalid("Send the photo as a JPEG.");
  // Upright (EXIF orientation applied) and scaled; EXIF itself is dropped.
  const scaled = await sharp(bytes, { limitInputPixels: 60_000_000, failOn: "error" })
    .rotate()
    .resize({ width: SHOT_LONG_SIDE, height: SHOT_LONG_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
    .catch(() => {
      throw invalid("That photo couldn't be read.");
    });

  const key = `captures/${captureId}/${String(index).padStart(3, "0")}.jpg`;
  await storage().put(key, scaled);
  const entry: CaptureShot = { index, ...shot, key };
  const { rows } = await db.execute(sql`
    UPDATE marketplace.tour_captures
       SET shots = (SELECT coalesce(jsonb_agg(s ORDER BY (s->>'index')::int), '[]'::jsonb)
                      FROM (SELECT s FROM jsonb_array_elements(shots) s WHERE (s->>'index')::int <> ${index}
                            UNION ALL SELECT ${JSON.stringify(entry)}::jsonb) t(s)),
           updated_at = now()
     WHERE id = ${captureId} AND status = 'uploading'
     RETURNING jsonb_array_length(shots) AS received, shot_count`);
  const r = rows[0] as Row | undefined;
  if (!r) throw conflict("This capture is already complete.");
  return { received: Number(r.received), of: Number(r.shot_count) };
}

/** All photos are in: queue the capture for stitching. */
export async function finishCapture(actor: Actor, captureId: string): Promise<CaptureView> {
  const capture = await ownCapture(actor, captureId);
  if (capture.status !== "uploading") return toView(capture);
  const shots = (capture.shots as CaptureShot[]) ?? [];
  if (shots.length < Math.min(MIN_SHOTS, Number(capture.shot_count))) throw conflict(`Only ${shots.length} of the photos have arrived. Upload the rest first.`);
  const { rows } = await db.execute(sql`
    UPDATE marketplace.tour_captures SET status = 'queued', updated_at = now() WHERE id = ${captureId} AND status = 'uploading' RETURNING *`);
  return toView((rows[0] as Row) ?? capture);
}

/** Captures to show in the tour editor: in progress, or failed in the last day (until dismissed). */
export async function listingCaptures(listingId: string): Promise<CaptureView[]> {
  const { rows } = await db.execute(sql`
    SELECT id, room_name, status, error, shots, shot_count, created_at FROM marketplace.tour_captures
     WHERE listing_id = ${listingId}
       AND (status IN ('uploading', 'queued', 'stitching') OR (status = 'failed' AND updated_at > now() - interval '1 day'))
     ORDER BY created_at`);
  return (rows as Row[]).map(toView);
}

/** Whether anything is waiting for the stitcher (so a page load can nudge it along). */
export async function capturesWaiting(listingId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`
    SELECT 1 FROM marketplace.tour_captures WHERE listing_id = ${listingId}
       AND (status = 'queued' OR (status = 'stitching' AND claimed_at < now() - make_interval(mins => ${STALE_MINUTES}))) LIMIT 1`);
  return rows.length > 0;
}

/** Removes a capture that's still uploading or that failed (its photos go too). */
export async function discardCapture(actor: Actor, captureId: string) {
  const capture = await ownCapture(actor, captureId);
  if (capture.status === "queued" || capture.status === "stitching") throw conflict("This 360° photo is being made. Wait for it to finish.");
  if (capture.status === "done") return;
  await removeShots(capture);
  await db.execute(sql`DELETE FROM marketplace.tour_captures WHERE id = ${captureId}`);
}

async function removeShots(capture: Row) {
  const keys = ((capture.shots as CaptureShot[]) ?? []).map((s) => s.key);
  if (keys.length) await storage().remove(keys).catch((e) => log.warn("captures.cleanup_failed", { error: String(e) }));
}

class StitchFailed extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

async function stitch(capture: Row): Promise<Buffer> {
  const store = storage();
  const shots = ((capture.shots as CaptureShot[]) ?? []).slice().sort((a, b) => a.index - b.index);
  const payload = {
    hfov: Number(capture.hfov),
    shots: await Promise.all(
      shots.map(async (s) => {
        const file = await store.read(s.key);
        if (!file) throw new StitchFailed("Some of the photos are missing. Take the room again.", true);
        return { yaw: s.yaw, pitch: s.pitch, roll: s.roll, data: Buffer.from(await new Response(file.stream).arrayBuffer()).toString("base64") };
      }),
    ),
  };
  let response: Response;
  try {
    response = await fetch(`${stitcherUrl()}/stitch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10 * 60_000) });
  } catch (error) {
    throw new StitchFailed(`The stitching service isn't reachable (${String(error)}).`, false);
  }
  if (response.status === 422) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new StitchFailed(body.error ?? "The photos couldn't be joined.", true);
  }
  if (!response.ok) throw new StitchFailed(`The stitching service answered ${response.status}.`, false);
  log.info("captures.stitched", { capture: String(capture.id), info: response.headers.get("x-stitch-info") });
  return Buffer.from(await response.arrayBuffer());
}

async function makePanorama(capture: Row): Promise<void> {
  const id = String(capture.id);
  const listing = await db.execute(sql`SELECT reference_id, title FROM marketplace.listings WHERE id = ${String(capture.listing_id)}`);
  const l = listing.rows[0] as Row | undefined;
  const room = String(capture.room_name);
  try {
    const actor = await loadActor(String(capture.created_by), String(capture.membership_id));
    if (!actor || !l) throw new StitchFailed("You no longer have access to this listing.", true);
    const panorama = await stitch(capture);
    const item = await uploadListingMedia(actor, String(l.reference_id), "panorama", new Response(new Uint8Array(panorama)).body, `${room}.jpg`);
    await updateMediaAlt(actor, String(l.reference_id), item.id, room);
    await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE marketplace.tour_captures SET status = 'done', media_id = ${item.id}, error = NULL, updated_at = now() WHERE id = ${id}`);
      await notify(tx, [String(capture.created_by)], {
        type: "tour_capture",
        title: `Your 360° photo of ${room} is ready`,
        body: `It's in the virtual tour of ${String(l.title)}.`,
        link: `/properties/${String(l.reference_id)}/tour`,
      });
    });
    await removeShots(capture);
  } catch (error) {
    const permanent = error instanceof StitchFailed ? error.permanent : error instanceof AppError;
    const attempts = Number(capture.attempts) + 1;
    const message = error instanceof Error ? error.message : String(error);
    const failed = permanent || attempts >= MAX_ATTEMPTS;
    log.warn("captures.failed", { capture: id, attempts, permanent, error: message });
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE marketplace.tour_captures SET status = ${failed ? "failed" : "queued"}, attempts = ${attempts}, error = ${message.slice(0, 500)}, claimed_at = NULL, updated_at = now()
         WHERE id = ${id}`);
      if (failed && l) {
        await notify(tx, [String(capture.created_by)], {
          type: "tour_capture",
          title: `Your 360° photo of ${room} couldn't be made`,
          body: "Take it again: stand in one spot, turn slowly, and keep the room well lit.",
          link: `/properties/${String(l.reference_id)}/tour`,
        });
      }
    });
    if (failed) await removeShots(capture);
  }
}

let running: Promise<number> | null = null;

/**
 * Stitches whatever is waiting, one capture at a time (the service does one at a time anyway).
 * Each capture is claimed first, so two servers never stitch the same one.
 */
export function processCaptures(): Promise<number> {
  running ??= (async () => {
    let done = 0;
    try {
      for (;;) {
        const { rows } = await db.execute(sql`
          UPDATE marketplace.tour_captures SET status = 'stitching', claimed_at = now(), updated_at = now()
           WHERE id = (
             SELECT id FROM marketplace.tour_captures
              WHERE status = 'queued' OR (status = 'stitching' AND claimed_at < now() - make_interval(mins => ${STALE_MINUTES}))
              ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING *`);
        const capture = rows[0] as Row | undefined;
        if (!capture) break;
        await makePanorama(capture);
        done++;
        // The service was unreachable: try the rest later rather than failing them all now.
        const back = await db.execute(sql`SELECT status FROM marketplace.tour_captures WHERE id = ${String(capture.id)}`);
        if ((back.rows[0] as Row | undefined)?.status === "queued") break;
      }
    } finally {
      running = null;
    }
    return done;
  })();
  return running;
}

/** Stitches waiting captures after the current request (tests call processCaptures themselves). */
export function scheduleCaptureProcessing() {
  if (process.env.NODE_ENV === "test") return;
  const run = () => processCaptures().catch((e) => log.warn("captures.processing_failed", { error: e instanceof Error ? e.message : String(e) }));
  try {
    after(run);
  } catch {
    void run();
  }
}
