import { getSession } from "@/lib/auth/session";
import { getWorkspaceContext } from "@/lib/authz/session";
import { log } from "@/lib/log";
import { ownershipProofForServing } from "@/lib/services/rent/landlords";
import { storage } from "@/lib/storage";

/**
 * A proof-of-ownership document, for its landlord or a Trustbrick admin who checks proofs. Checked on
 * every request, never cached, and sandboxed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response("Not found", { status: 404 });
  const ctx = await getWorkspaceContext();
  const proof = await ownershipProofForServing({ userId: session.user.id, actor: ctx.state === "ready" ? ctx.actor : null }, id);
  if (!proof) return new Response("Not found", { status: 404 });
  let object: Awaited<ReturnType<ReturnType<typeof storage>["read"]>>;
  try {
    object = await storage().read(proof.key);
  } catch (error) {
    log.error("rent.proof_storage_unavailable", { error: error instanceof Error ? error.message : String(error) });
    return new Response("Storage is not configured", { status: 503 });
  }
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.stream, {
    headers: {
      "Content-Type": proof.mimeType,
      "Content-Length": String(object.size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${proof.filename.replace(/["\\]/g, "")}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
