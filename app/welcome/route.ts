import { type NextRequest, NextResponse } from "next/server";

/**
 * Where email-confirmation links land. Better Auth redirects here after verifying
 * (already signed in), or with ?error= when the link is expired or reused.
 *
 * It exists as a route handler, not a page, so a failed link is routed to a
 * helpful login message instead of being bounced by the account area's login check.
 */
export function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.has("error") ? "/login?verify=expired" : "/account/profile?welcome=1";
  return NextResponse.redirect(new URL(target, request.url));
}
