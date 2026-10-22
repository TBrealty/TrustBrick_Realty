import type { Href } from "expo-router";

/**
 * The server speaks in website paths (notification links, listing pages). This maps the ones the
 * app has screens for, customer and partner; anything else stays on the notifications list.
 */
export function routeFor(link: string | null | undefined): Href | null {
  if (!link) return null;
  const path = link.split(/[?#]/)[0];
  let m: RegExpExecArray | null;
  if ((m = /^\/listings\/(LST-[A-Z0-9]+)(\/tour)?$/.exec(path))) return m[2] ? `/listing/${m[1]}/tour` : `/listing/${m[1]}`;
  if ((m = /^\/account\/messages\/([A-Z]+-[A-Z0-9]+)$/.exec(path))) return `/conversation/${m[1]}`;
  if ((m = /^\/account\/trips\/(BKG-[A-Z0-9]+)$/.exec(path))) return `/trips/${m[1]}`;
  if (path === "/account/trips" || path === "/account/bookings") return "/trips";
  if (path === "/account/messages") return "/messages";
  if (path === "/account/subscription" || path === "/plans") return "/plans";
  if (path === "/account/saved") return "/saved";
  // Partner mode: an agent's or host's notifications.
  if ((m = /^\/leads\/(LEAD-[A-Z0-9]+)$/.exec(path))) return `/partner/lead/${m[1]}`;
  if (path === "/leads") return "/leads";
  if ((m = /^\/bookings\/(BKG-[A-Z0-9]+)$/.exec(path))) return `/partner/booking/${m[1]}`;
  if (path === "/bookings") return "/bookings";
  if ((m = /^\/messages\/(MSG-[A-Z0-9]+)$/.exec(path))) return `/partner/conversation/${m[1]}`;
  if ((m = /^\/properties\/(LST-[A-Z0-9]+)\/tour$/.exec(path))) return `/partner/listing/${m[1]}`;
  if ((m = /^\/properties\/(LST-[A-Z0-9]+)(\/edit)?$/.exec(path))) return `/partner/property/${m[1]}`;
  if (path === "/properties") return "/listings";
  if (path === "/properties/new") return "/partner/property/new";
  if (path === "/visits") return "/partner/visits";
  if (path === "/contacts") return "/partner/clients";
  if (path === "/calendar") return "/partner/calendar";
  if (path === "/commission") return "/partner/commission";
  if (path === "/subscription") return "/partner/subscription";
  if (path === "/analytics") return "/partner/performance";
  if (path === "/agents") return "/partner/team";
  return null;
}
