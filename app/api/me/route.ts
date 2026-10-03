import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { loadWorkspaces } from "@/lib/authz/actor";

/**
 * Who is logged in, for the statically rendered landing page's header. Returns only what the
 * menu needs: name, email, and whether there is a workspace to link to. Never permissions.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  const workspaces = await loadWorkspaces(session.user.id);
  return NextResponse.json(
    { user: { name: session.user.name, email: session.user.email }, hasWorkspace: workspaces.length > 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
