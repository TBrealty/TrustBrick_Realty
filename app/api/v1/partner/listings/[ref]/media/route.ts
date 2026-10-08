import { apiRoute, created, rateLimit } from "@/lib/api/http";
import { RULES } from "@/lib/auth/rate-limit";
import { AppError } from "@/lib/errors";
import { uploadListingMedia } from "@/lib/services/media";
import { isUploadKind } from "@/lib/storage/sniff";

/**
 * Uploads one file to a listing: `?kind=panorama|model_3d|photo|…`, the raw file as the body,
 * its name URL-encoded in `X-File-Name`. Checked as on the website (type from the bytes, 360°
 * shape, .glb header, size); on a live listing, tour files go live and to review.
 */
export const POST = apiRoute<{ ref: string }>("v1.partner.media_upload", { auth: "user" }, async ({ actor, params, request, url }) => {
  const a = await actor();
  const kind = url.searchParams.get("kind");
  if (!isUploadKind(kind)) throw new AppError("VALIDATION_ERROR", "Unknown upload type.");
  await rateLimit([{ key: `upload:user:${a.userId}`, rule: RULES.uploadByUser }]);
  let filename: string | null = null;
  try {
    filename = decodeURIComponent(request.headers.get("x-file-name") ?? "") || null;
  } catch {}
  return created(await uploadListingMedia(a, params.ref, kind, request.body, filename));
});
