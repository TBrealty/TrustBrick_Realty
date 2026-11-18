import { apiRoute, created, rateLimit } from "@/lib/api/http";
import { RULES } from "@/lib/auth/rate-limit";
import { AppError } from "@/lib/errors";
import { uploadOwnershipProof } from "@/lib/services/rent/landlords";

const CAP = 10 * 1024 * 1024 + 1;

/** Proof of ownership for a property (PRP-): `?kind=sale_deed|property_tax_receipt|…`, the raw file as the body (PDF, JPEG or PNG, up to 10 MB), its name in `X-File-Name`. */
export const POST = apiRoute<{ ref: string }>("v1.partner.landlord_proof", { auth: "user" }, async ({ actor, params, request, url, requestContext }) => {
  const a = await actor();
  await rateLimit([{ key: `upload:user:${a.userId}`, rule: RULES.uploadByUser }]);
  let filename = "";
  try {
    filename = decodeURIComponent(request.headers.get("x-file-name") ?? "");
  } catch {}
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CAP) {
      await reader.cancel();
      throw new AppError("VALIDATION_ERROR", "The file is larger than 10 MB.");
    }
    chunks.push(value);
  }
  await uploadOwnershipProof(a, params.ref, url.searchParams.get("kind"), { bytes: Buffer.concat(chunks), filename }, requestContext);
  return created({ ok: true });
});
