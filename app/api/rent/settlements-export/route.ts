import { actorForAction, requestContext } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { exportSettlementsCsv } from "@/lib/services/rent/admin";

/**
 * The back office's payment file: every settlement ready to pay, with full bank details, as CSV.
 * POST only, from this site only (the export is audited and holds bank details).
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.BETTER_AUTH_URL).origin) return new Response("Forbidden", { status: 403 });
  try {
    const actor = await actorForAction();
    const { csv } = await exportSettlementsCsv(actor, await requestContext());
    const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).replace(/[: ]/g, "-").slice(0, 16);
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="trustbrick-rent-settlements-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(error.message, { status: error.code === "UNAUTHORIZED" ? 401 : error.code === "FORBIDDEN" ? 403 : 409 });
    log.error("rent.export_failed", { error: error instanceof Error ? error.message : String(error) });
    return new Response("The export failed.", { status: 500 });
  }
}
