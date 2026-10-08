/**
 * File types are decided from the bytes, never from the declared Content-Type or the
 * file name, both of which the uploader controls.
 */
export type SniffedType = { mime: string; ext: string; family: "image" | "video" | "pdf" | "model" };

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

export function sniff(head: Buffer): SniffedType | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", family: "image" };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", family: "image" };
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp", family: "image" };
  // ISO BMFF: bytes 4–7 are "ftyp", then a brand.
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = head.subarray(8, 12).toString("latin1");
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", ext: "avif", family: "image" };
    if (brand === "heic" || brand === "heix" || brand === "mif1") return { mime: "image/heic", ext: "heic", family: "image" };
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "dash"].includes(brand)) return { mime: "video/mp4", ext: "mp4", family: "video" };
    if (brand === "qt  ") return { mime: "video/quicktime", ext: "mov", family: "video" };
  }
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", ext: "webm", family: "video" };
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf", family: "pdf" };
  // Binary glTF: "glTF". The rest of the header is checked against the whole file on upload.
  if (startsWith(head, [0x67, 0x6c, 0x54, 0x46])) return { mime: "model/gltf-binary", ext: "glb", family: "model" };
  return null;
}

export const UPLOAD_KINDS = {
  photo: { label: "Photo", mediaType: "image", families: ["image"], maxBytes: 15 * 1024 * 1024, private: false, maxPerProperty: 30 },
  floor_plan: { label: "Floor plan", mediaType: "floor_plan", families: ["image", "pdf"], maxBytes: 15 * 1024 * 1024, private: false, maxPerProperty: 10 },
  video: { label: "Video", mediaType: "video", families: ["video"], maxBytes: 100 * 1024 * 1024, private: false, maxPerProperty: 3 },
  document: { label: "Document", mediaType: "document", families: ["pdf", "image"], maxBytes: 15 * 1024 * 1024, private: true, maxPerProperty: 10 },
  // The virtual tour: not private, but served only to Plus members and the listing's own team.
  panorama: { label: "360° photo", mediaType: "panorama", families: ["image"], maxBytes: 40 * 1024 * 1024, private: false, maxPerProperty: 20 },
  model_3d: { label: "3D model", mediaType: "model_3d", families: ["model"], maxBytes: 100 * 1024 * 1024, private: false, maxPerProperty: 1 },
} as const;
export type UploadKind = keyof typeof UPLOAD_KINDS;
/** Media types that make up a virtual tour, gated by subscription. */
export const TOUR_MEDIA_TYPES = ["panorama", "model_3d"] as const;

export const isUploadKind = (value: unknown): value is UploadKind => typeof value === "string" && value in UPLOAD_KINDS;
