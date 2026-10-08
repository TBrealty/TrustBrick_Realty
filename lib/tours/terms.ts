/**
 * Virtual tours, in rules and words. Shared by server and client.
 *
 * A listing's tour has up to three parts: 360° photos, one per room (equirectangular images,
 * twice as wide as they are tall); a 3D model (a binary glTF file, .glb, from a scanning app or
 * an architect); and a link to a 3D tour hosted elsewhere. Anyone can see that a listing has a
 * tour; opening it takes Plus (or being the listing's own team, or a reviewer).
 */

/** The subscription feature that opens tours. */
export const TOUR_FEATURE = "virtual_tours";

/** 360° photos must be close to 2:1, the shape of a full sphere. */
export const PANORAMA_RATIO = { min: 1.94, max: 2.06 } as const;
export const PANORAMA_MIN_WIDTH = 2000;
/** The stored original is capped at this width; the viewer loads a 4096-wide rendition. */
export const PANORAMA_MAX_WIDTH = 8192;
export const PANORAMA_VIEW_WIDTH = 4096;

export function isPanoramaShape(width: number, height: number): boolean {
  if (!width || !height) return false;
  const ratio = width / height;
  return ratio >= PANORAMA_RATIO.min && ratio <= PANORAMA_RATIO.max;
}

/**
 * Checks a binary glTF header: "glTF", version 2, and a declared length that matches the file.
 * A JSON .gltf refers to other files by path, so only the self-contained .glb is accepted.
 */
export function glbProblem(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 20) return "That file is too small to be a 3D model.";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) return "That isn't a .glb 3D model.";
  if (view.getUint32(4, true) !== 2) return "Only glTF 2.0 models (.glb) are supported.";
  if (view.getUint32(8, true) !== bytes.byteLength) return "That 3D model appears to be incomplete. Export it again and retry.";
  // The first chunk must be the JSON scene description.
  if (view.getUint32(16, true) !== 0x4e4f534a) return "That 3D model appears to be damaged.";
  return null;
}

// ── Hosted 3D tours ──────────────────────────────────────────────────────────

export type TourProvider = { key: string; name: string; example: string };

export const TOUR_PROVIDERS: TourProvider[] = [
  { key: "matterport", name: "Matterport", example: "https://my.matterport.com/show/?m=…" },
  { key: "kuula", name: "Kuula", example: "https://kuula.co/share/…" },
  { key: "cloudpano", name: "CloudPano", example: "https://app.cloudpano.com/tours/…" },
];

export type TourLink = { provider: TourProvider; url: string };

const ID = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Reads a pasted tour link into the one form we store and embed. Only the providers above are
 * accepted, and the link is rebuilt from its ID, so nothing else from the pasted URL survives.
 */
export function parseTourLink(raw: string): TourLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const provider = (key: string) => TOUR_PROVIDERS.find((p) => p.key === key)!;
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "my.matterport.com" && segments[0] === "show") {
    const m = url.searchParams.get("m");
    return m && ID.test(m) ? { provider: provider("matterport"), url: `https://my.matterport.com/show/?m=${m}` } : null;
  }
  if (host === "kuula.co" && segments[0] === "share") {
    // kuula.co/share/<id> or kuula.co/share/collection/<id>
    const collection = segments[1] === "collection";
    const id = collection ? segments[2] : segments[1];
    if (!id || !ID.test(id) || segments.length !== (collection ? 3 : 2)) return null;
    return { provider: provider("kuula"), url: `https://kuula.co/share/${collection ? "collection/" : ""}${id}` };
  }
  if (host === "app.cloudpano.com" && segments[0] === "tours" && segments[1] && ID.test(segments[1])) {
    return { provider: provider("cloudpano"), url: `https://app.cloudpano.com/tours/${segments[1]}` };
  }
  return null;
}

/** "Matterport, Kuula or CloudPano" */
export const providerNames = TOUR_PROVIDERS.map((p) => p.name).join(", ").replace(/, ([^,]*)$/, " or $1");
export const TOUR_LINK_HELP = `Paste a share link from ${providerNames}.`;

/** What a listing's tour has, for badges and the listing page. */
export type TourSummary = { rooms: number; model: boolean; link: string | null };

export const hasTour = (t: TourSummary | null | undefined): t is TourSummary => Boolean(t && (t.rooms > 0 || t.model || t.link));
/** "3D" covers the model and hosted 3D tours; 360° photos are the walk-through. */
export const has3d = (t: TourSummary | null | undefined) => Boolean(t && (t.model || t.link));

export function describeTour(t: TourSummary): string {
  const parts: string[] = [];
  if (t.rooms > 0) parts.push(`360° tour of ${t.rooms} room${t.rooms === 1 ? "" : "s"}`);
  if (t.model) parts.push("3D model");
  if (t.link) parts.push(`3D tour on ${t.link}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "No virtual tour");
}

/** Short badge text for cards. */
export const tourBadge = (t: TourSummary) => (has3d(t) ? "3D tour" : "360° tour");

/** A tour as the viewer gets it, once the viewer is allowed in. */
export type TourRoom = { id: string; name: string; url: string; thumbnailUrl: string | null };
export type TourData = {
  rooms: TourRoom[];
  model: { url: string; name: string } | null;
  link: { provider: string; url: string } | null;
  /** Set when Trustbrick has hidden the tour from guests and buyers, after a review. */
  hidden?: { at: string; reason: string | null } | null;
};
export type TourView = "rooms" | "model" | "link";
export const isTourView = (v: unknown): v is TourView => v === "rooms" || v === "model" || v === "link";

/**
 * A live listing's tour can be changed without withdrawing it: the change shows straight away and
 * goes to Approvals as a tour review. Everything else on a live listing still needs withdrawing.
 */
export const LIVE_TOUR_STATUSES = ["published", "paused"] as const;
export const isLiveForTours = (status: string) => (LIVE_TOUR_STATUSES as readonly string[]).includes(status);

/** Hiding a tour needs a remark, which the agent or host is shown. */
export const HIDE_REASON_MIN = 10;
