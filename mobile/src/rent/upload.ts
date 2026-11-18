import { File, UploadType } from "expo-file-system";
import { ApiError, authHeaders } from "@/api/client";
import { API_ORIGIN } from "@/config";

/** Uploads a landlord's proof of ownership (a PDF or photo picked on the phone) as the raw body. */
export async function uploadProof(propertyRef: string, kind: string, file: { uri: string; name: string; mime: string }) {
  const task = new File(file.uri).createUploadTask(`${API_ORIGIN}/api/v1/partner/landlord/properties/${propertyRef}/proof?kind=${encodeURIComponent(kind)}`, {
    httpMethod: "POST",
    uploadType: UploadType.BINARY_CONTENT,
    headers: { ...authHeaders(), "content-type": file.mime, "x-file-name": encodeURIComponent(file.name) },
  });
  const result = await task.uploadAsync();
  if (result.status >= 200 && result.status < 300) return;
  let message = "The upload didn't go through. Try again.";
  try {
    message = (JSON.parse(result.body) as { error?: { message?: string } }).error?.message ?? message;
  } catch {}
  throw new ApiError(result.status, "UPLOAD_FAILED", message);
}
