import { ApiError, authHeaders } from "@/api/client";
import { API_ORIGIN } from "@/config";

/** The web preview's upload: the picked file read as a blob and posted as the raw body. */
export async function uploadProof(propertyRef: string, kind: string, file: { uri: string; name: string; mime: string }) {
  const blob = await (await fetch(file.uri)).blob();
  const res = await fetch(`${API_ORIGIN}/api/v1/partner/landlord/properties/${propertyRef}/proof?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": file.mime, "x-file-name": encodeURIComponent(file.name) },
    body: blob,
  });
  if (res.ok) return;
  let message = "The upload didn't go through. Try again.";
  try {
    message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
  } catch {}
  throw new ApiError(res.status, "UPLOAD_FAILED", message);
}
