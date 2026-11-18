import { NextResponse } from "next/server";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { actorForAction } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { requestContext } from "@/lib/authz/session";
import { uploadOwnershipProof } from "@/lib/services/rent/landlords";

/**
 * A landlord uploads proof of ownership for one of their properties (PRP-). The body is the raw
 * file, read with a 10 MB cap; the file name arrives URL-encoded in a header, kept only as a label.
 */
const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_ERROR: 422, CONFLICT: 409, RATE_LIMITED: 429 };
const CAP = 10 * 1024 * 1024 + 1;

async function readCapped(body: ReadableStream<Uint8Array> | null): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CAP) {
      await reader.cancel();
      throw new AppError("VALIDATION_ERROR", "The file is larger than 10 MB.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const kind = new URL(request.url).searchParams.get("kind");
  try {
    const actor = await actorForAction();
    const limited = await limit([{ key: `upload:user:${actor.userId}`, rule: RULES.uploadByUser }]);
    if (limited.limited) throw new AppError("RATE_LIMITED");
    let filename = "";
    try {
      filename = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    } catch {
      filename = "";
    }
    const bytes = await readCapped(request.body);
    await uploadOwnershipProof(actor, ref, kind, { bytes, filename }, await requestContext());
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message, fieldErrors: error.fieldErrors }, { status: STATUS[error.code] ?? 400 });
    }
    log.error("rent.proof_upload_failed", { property: ref, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "The upload failed. Please try again." }, { status: 500 });
  }
}
