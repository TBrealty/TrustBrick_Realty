import { apiRoute } from "@/lib/api/http";
import { WORKSPACE_HEADER } from "@/lib/authz/session";
import { unreadCount } from "@/lib/services/notifications";
import { guestUnreadCount } from "@/lib/services/stays/messages";
import { overviewFor } from "@/lib/services/subscriptions";

/**
 * Who is signed in: their profile, the workspaces they can switch to (agent, host or staff),
 * their own plan and what it includes, and unread notifications. Never permissions in detail:
 * the server checks those on every request.
 */
export const GET = apiRoute("v1.me", { auth: "user" }, async ({ request, person, workspaces }) => {
  const p = person!;
  const [list, overview, unread, unreadMessages] = await Promise.all([
    workspaces(),
    overviewFor({ kind: "user", userId: p.userId }),
    unreadCount(p.userId),
    guestUnreadCount(p.userId),
  ]);
  const hint = request.headers.get(WORKSPACE_HEADER);
  const active = list.find((w) => w.membershipId === hint) ?? (list.length === 1 ? list[0] : null);
  const s = overview.subscription;
  return {
    user: { referenceId: p.referenceId, name: p.name, email: p.email },
    workspaces: list.map((w) => ({
      membershipId: w.membershipId,
      kind: w.kind,
      roles: w.roles,
      organization: { referenceId: w.organization.referenceId, name: w.organization.name, type: w.organization.orgType },
    })),
    activeWorkspace: active?.membershipId ?? null,
    plan: {
      code: overview.entitledPlan.code,
      name: overview.entitledPlan.name,
      features: overview.entitledPlan.features.filter((f) => !f.comingSoon).map((f) => f.key),
      subscription: s ? { referenceId: s.referenceId, state: s.state, planName: s.plan.name, trialEndsAt: s.trialEndsAt, currentPeriodEnd: s.currentPeriodEnd } : null,
      trialAvailable: overview.trialAvailable,
    },
    unreadNotifications: unread,
    unreadMessages,
  };
});
