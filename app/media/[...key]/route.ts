import { getWorkspaceContext } from "@/lib/authz/session";
import { resolveMediaForServing } from "@/lib/services/media";
import { canViewTour } from "@/lib/services/tours";
import { log } from "@/lib/log";
import { storage } from "@/lib/storage";

/**
 * Serves uploaded media. Public photos are cacheable (their keys contain random segments);
 * private documents are checked against the viewer's scope on every request and never cached.
 * Virtual tour files are for Plus members and the listing's own team: checked on every request,
 * and cached only by the viewer's own browser.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  const ctx = await getWorkspaceContext();
  const actor = ctx.state === "ready" ? ctx.actor : null;
  const media = await resolveMediaForServing(key, actor);
  if (!media) return new Response("Not found", { status: 404 });
  if (media.tourOfProperty && !(await canViewTour({ userId: ctx.state === "anonymous" ? null : ctx.userId, actor }, media.tourOfProperty))) {
    return new Response("Virtual tours are part of Trustbrick Plus", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  let object: Awaited<ReturnType<ReturnType<typeof storage>["read"]>>;
  try {
    object = await storage().read(media.key);
  } catch (error) {
    log.error("media.storage_unavailable", { error: error instanceof Error ? error.message : String(error) });
    return new Response("Media storage is not configured", { status: 503 });
  }
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.stream, {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(object.size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": media.isPrivate ? "private, no-store" : media.tourOfProperty ? "private, max-age=600" : "public, max-age=31536000, immutable",
      ...(media.mimeType === "application/pdf" ? { "Content-Disposition": "inline" } : {}),
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
