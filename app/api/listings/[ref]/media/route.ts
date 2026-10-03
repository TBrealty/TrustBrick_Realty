import { NextResponse } from "next/server";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { actorForAction } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { uploadListingMedia } from "@/lib/services/media";
import { isUploadKind } from "@/lib/storage/sniff";

/**
 * Uploads one file for a listing the actor may edit. The body is the raw file (not
 * multipart), streamed with a byte cap; the file name arrives URL-encoded in a header and is
 * only kept as a label. Scope, editability, size and type are all checked in the service.
 */
const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_ERROR: 422, CONFLICT: 409, RATE_LIMITED: 429 };

export async function POST(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const kind = new URL(request.url).searchParams.get("kind");
  try {
    const actor = await actorForAction();
    if (!isUploadKind(kind)) throw new AppError("VALIDATION_ERROR", "Unknown upload type.");
    const limited = await limit([{ key: `upload:user:${actor.userId}`, rule: RULES.uploadByUser }]);
    if (limited.limited) throw new AppError("RATE_LIMITED");
    let filename: string | null = null;
    try {
      filename = decodeURIComponent(request.headers.get("x-file-name") ?? "") || null;
    } catch {
      filename = null;
    }
    const item = await uploadListingMedia(actor, ref, kind, request.body, filename);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: STATUS[error.code] ?? 400 });
    }
    log.error("media.upload_failed", { listing: ref, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "The upload failed. Please try again." }, { status: 500 });
  }
}
