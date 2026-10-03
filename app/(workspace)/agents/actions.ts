"use server";

import { redirect } from "next/navigation";
import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { inviteAgent, revokeAgentInvitation } from "@/lib/services/agent-invitations";
import { approveAgent, reinstateAgent, rejectAgent, setAgentVerification, suspendAgent, updateAgent } from "@/lib/services/agents";

type Result = ActionResult<unknown>;
const paths = (ref: string) => [`/agents/${ref}`, "/agents", "/approvals", "/dashboard"];

export async function approveAgentAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("agent.approve", (a, ctx) => approveAgent(a, ref, { verify: form.get("verify") === "on" }, ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: "Approved. The agent has been notified." } : r;
}

export async function rejectAgentAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("agent.reject", (a, ctx) => rejectAgent(a, ref, text(form, "reason"), ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: "Rejected. The applicant has been told why." } : r;
}

export async function verifyAgentAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("agent.verify", (a, ctx) => setAgentVerification(a, ref, text(form, "verified") === "1", ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: "Verification updated." } : r;
}

export async function suspendAgentAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("agent.suspend", (a, ctx) => suspendAgent(a, ref, text(form, "reason"), ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: `Suspended. ${(r.data as { paused: number }).paused} live listing(s) paused.` } : r;
}

export async function reinstateAgentAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("agent.reinstate", (a, ctx) => reinstateAgent(a, ref, ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: `Reinstated. ${(r.data as { resumed: number }).resumed} listing(s) back live.` } : r;
}

export async function updateAgentAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("agent.update", (a, ctx) => updateAgent(a, ref, formObject(form), ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: "Saved." } : r;
}

export async function inviteAgentAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("agent.invite", (a, ctx) => inviteAgent(a, formObject(form), ctx), { revalidate: ["/agents"] });
  if (r.ok) redirect("/agents?invited=1");
  return r;
}

export async function revokeAgentInvitationAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("agent.invite.revoke", (a, ctx) => revokeAgentInvitation(a, text(form, "ref"), ctx), { revalidate: ["/agents"] });
  return r.ok ? { ok: true, message: "Invitation revoked." } : r;
}
