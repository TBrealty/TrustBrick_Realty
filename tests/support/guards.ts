import type { Actor } from "@/lib/authz/actor";
import { AppError } from "@/lib/errors";
import { listAgents } from "@/lib/services/agents";
import { platformDashboard } from "@/lib/services/dashboard";
import { listOrganizations } from "@/lib/services/organizations";
import { listUsers } from "@/lib/services/users";
import { resolveRange } from "@/lib/range";

/** Every platform-wide read an agent might try, collapsed to one error code (or "OK"). */
export async function dashboardGuard(actor: Actor): Promise<string> {
  const attempts = [
    platformDashboard(actor, resolveRange({ range: "30d" }), { excludeSample: false }),
    listUsers(actor, {}, 1),
    listOrganizations(actor, { includeSample: false }, 1),
    listAgents(actor, { sort: "newest" }, 1),
  ];
  const codes = await Promise.all(attempts.map((p) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : "THREW"))));
  return codes.every((c) => c === "FORBIDDEN") ? "FORBIDDEN" : codes.join(",");
}
