import "server-only";
import { type MapLinkResult, isMapHost, isShortLink, parseMapLink } from "@/lib/listings/map-link";
import { log } from "@/lib/log";

/**
 * Reads the pin from a pasted map link, following a short link (maps.app.goo.gl, goo.gl/maps,
 * maps.apple/p) to the full one first. Only HTTPS hops to Google or Apple map hosts are
 * followed, a few at most, with a short timeout: the link is untrusted input, so the server
 * never fetches anywhere else on its behalf.
 */
const MAX_HOPS = 5;
const TIMEOUT_MS = 6_000;

export async function resolveMapLink(input: string): Promise<MapLinkResult> {
  const direct = parseMapLink(input);
  if (direct.ok || direct.reason !== "short_link") return direct;

  let url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (url.protocol !== "https:" || !isMapHost(url.hostname.toLowerCase())) return { ok: false, reason: "not_a_map_link" };
    let location: string | null;
    try {
      const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "Mozilla/5.0 (Trustbrick map-link check)" } });
      location = res.headers.get("location");
      await res.body?.cancel();
    } catch (error) {
      log.warn("map_link.fetch_failed", { host: url.hostname, error: error instanceof Error ? error.message : String(error) });
      return { ok: false, reason: "unreachable" };
    }
    // A short link that doesn't redirect is one that doesn't exist (or has expired).
    if (!location) return { ok: false, reason: hop === 0 ? "unreachable" : "no_pin" };
    url = new URL(location, url);
    const parsed = parseMapLink(url.href);
    if (parsed.ok || parsed.reason !== "short_link") return parsed.ok || parsed.reason !== "not_a_map_link" ? parsed : { ok: false, reason: "no_pin" };
    if (!isShortLink(url)) return { ok: false, reason: "no_pin" };
  }
  return { ok: false, reason: "no_pin" };
}
