/**
 * The map pin, from a link the agent pastes: Google Maps or Apple Maps, as copied from the
 * app's Share button or the browser's address bar. Pure parsing, shared by the form (for
 * instant feedback) and the server (the authority). Short links (maps.app.goo.gl,
 * goo.gl/maps, maps.apple/p) carry no coordinates; the server follows them first, in
 * lib/services/map-links.ts.
 */

export type Pin = { latitude: number; longitude: number };

export type MapLinkResult = { ok: true; pin: Pin } | { ok: false; reason: "not_a_map_link" | "short_link" | "unreachable" | "no_pin" | "outside_india" };

/** India's bounding box, as the location schema has always used. */
export const INDIA = { minLat: 6, maxLat: 38, minLng: 68, maxLng: 98 } as const;

const GOOGLE = /(^|\.)google\.[a-z.]+$/;
const APPLE = /^(maps\.apple\.com|maps\.apple)$/;

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const PAIR = new RegExp(String.raw`^\s*(?:loc:)?\s*${NUM}\s*,\s*${NUM}\s*$`);

export const isMapHost = (host: string) => GOOGLE.test(host) || APPLE.test(host) || host === "goo.gl" || host === "maps.app.goo.gl";

/** Short links that need following before they show a pin. */
export function isShortLink(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  if (host === "goo.gl") return url.pathname.startsWith("/maps");
  if (host === "maps.apple" || host === "maps.apple.com") return url.pathname.startsWith("/p/");
  return false;
}

function pair(value: string | null | undefined): Pin | null {
  if (!value) return null;
  const m = PAIR.exec(decodeURIComponent(value.replace(/\+/g, " ")));
  return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
}

function inIndia(p: Pin): boolean {
  return p.latitude >= INDIA.minLat && p.latitude <= INDIA.maxLat && p.longitude >= INDIA.minLng && p.longitude <= INDIA.maxLng;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function found(p: Pin | null): MapLinkResult | null {
  if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return null;
  if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) return null;
  const pin = { latitude: round(p.latitude), longitude: round(p.longitude) };
  return inIndia(pin) ? { ok: true, pin } : { ok: false, reason: "outside_india" };
}

/** Google's place data: `!3d<lat>!4d<lng>` is the pin itself, better than the view's centre. */
function googlePin(href: string): Pin | null {
  const place = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(href);
  if (place) return { latitude: Number(place[1]), longitude: Number(place[2]) };
  return null;
}

/** The centre of the map view: `/@<lat>,<lng>,<zoom>z`. A fair pin when nothing better is there. */
function googleView(url: URL): Pin | null {
  const at = /\/@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url.pathname);
  return at ? { latitude: Number(at[1]), longitude: Number(at[2]) } : null;
}

const PARAMS = {
  google: ["q", "query", "ll", "center", "destination", "daddr", "saddr"],
  apple: ["coordinate", "ll", "q", "sll", "daddr", "center"],
} as const;

/**
 * Reads the pin from a link, or from plain "lat, lng" typed or pasted on its own.
 * Never fetches anything.
 */
export function parseMapLink(input: string): MapLinkResult {
  const text = input.trim();
  const plain = pair(text);
  if (plain) return found(plain) ?? { ok: false, reason: "no_pin" };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "not_a_map_link" };
  }
  const host = url.hostname.toLowerCase();
  if (!isMapHost(host)) return { ok: false, reason: "not_a_map_link" };
  if (isShortLink(url)) return { ok: false, reason: "short_link" };

  if (APPLE.test(host)) {
    for (const key of PARAMS.apple) {
      const r = found(pair(url.searchParams.get(key)));
      if (r) return r;
    }
    return { ok: false, reason: "no_pin" };
  }

  // Google: the place pin, then coordinates in the query, then the view's centre.
  const place = found(googlePin(url.href));
  if (place) return place;
  for (const key of PARAMS.google) {
    const r = found(pair(url.searchParams.get(key)));
    if (r) return r;
  }
  // /maps/search/17.44,78.39 and /maps/place/17.44,78.39
  const inPath = /\/maps\/(?:search|place|dir)\/(?:[^/]*\/)?(-?\d+\.\d+),\+?(-?\d+\.\d+)/.exec(decodeURIComponent(url.pathname));
  if (inPath) {
    const r = found({ latitude: Number(inPath[1]), longitude: Number(inPath[2]) });
    if (r) return r;
  }
  return found(googleView(url)) ?? { ok: false, reason: "no_pin" };
}

export const MAP_LINK_MESSAGES: Record<Exclude<MapLinkResult, { ok: true }>["reason"], string> = {
  not_a_map_link: "Paste a Google Maps or Apple Maps link",
  short_link: "Checking the short link…",
  unreachable: "Couldn't open that link. Check it's copied in full, or copy the link from the address bar instead",
  no_pin: "That link doesn't include a location. Drop a pin on the property, then share that",
  outside_india: "That pin isn't in India. Check the link is for this property",
};

/** A link that opens the pin in Google Maps: what the form shows for a saved pin. */
export const googleMapsLink = (p: Pin) => `https://www.google.com/maps?q=${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
