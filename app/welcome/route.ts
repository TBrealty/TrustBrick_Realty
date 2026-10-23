import type { NextRequest } from "next/server";

/**
 * Where email-confirmation links land. Better Auth redirects here after verifying
 * (already signed in), or with ?error= when the link is expired or reused.
 *
 * It exists as a route handler, not a page, so a failed link is routed to a
 * helpful login message instead of being bounced by the account area's login check.
 *
 * The redirect is relative: behind a proxy (Caddy in production) the request's own URL is the
 * app's internal address (0.0.0.0:3000), not the site's, so it mustn't be built from it.
 */
export function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.has("error") ? "/login?verify=expired" : "/account/profile?welcome=1";
  return new Response(null, { status: 307, headers: { Location: target } });
}
