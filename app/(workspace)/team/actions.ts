"use server";

import { redirect } from "next/navigation";
import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import {
  approveJoinRequest,
  changeMemberRole,
  declineJoinRequest,
  createTeam,
  deleteTeam,
  inviteMember,
  removeMember,
  renameTeam,
  revokeMemberInvitation,
  setTeamMember,
} from "@/lib/services/members";

type Result = ActionResult<unknown>;
const paths = (ref?: string) => ["/team", "/team/teams", "/team/invitations", ...(ref ? [`/team/${ref}`] : [])];

export async function inviteMemberAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("member.invite", (a, ctx) => inviteMember(a, formObject(form), ctx), { revalidate: paths() });
  if (r.ok) redirect("/team/invitations?invited=1");
  return r;
}

export async function revokeMemberInvitationAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("member.invite.revoke", (a, ctx) => revokeMemberInvitation(a, text(form, "ref"), ctx), { revalidate: paths() });
  return r.ok ? { ok: true, message: "Invitation revoked." } : r;
}

export async function changeMemberRoleAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("member.role", (a, ctx) => changeMemberRole(a, ref, formObject(form), ctx), { revalidate: paths(ref) });
  if (!r.ok) return r;
  return { ok: true, message: (r.data as { changed: boolean }).changed ? "Role changed. They've been told by email." : "That's already their role." };
}

export async function removeMemberAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("member.remove", (a, ctx) => removeMember(a, ref, formObject(form), ctx), { revalidate: paths(ref) });
  if (r.ok) redirect("/team?removed=1");
  return r;
}

export async function approveJoinAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("member.join.approve", (a, ctx) => approveJoinRequest(a, text(form, "ref"), formObject(form), ctx), { revalidate: [...paths(), "/team/requests"] });
  // Their request card is gone: open their page, where their role and teams can be adjusted.
  if (r.ok) redirect(`/team/${(r.data as { userReferenceId: string }).userReferenceId}?joined=1`);
  return r;
}

export async function declineJoinAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("member.join.decline", (a, ctx) => declineJoinRequest(a, text(form, "ref"), text(form, "reason"), ctx), { revalidate: ["/team/requests"] });
  if (r.ok) redirect("/team/requests?declined=1");
  return r;
}

export async function createTeamAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("team.create", (a, ctx) => createTeam(a, text(form, "name"), ctx), { revalidate: paths() });
  return r.ok ? { ok: true, message: "Team created. Add its people below." } : r;
}

export async function renameTeamAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("team.rename", (a, ctx) => renameTeam(a, text(form, "team"), text(form, "name"), ctx), { revalidate: paths() });
  return r.ok ? { ok: true, message: "Renamed." } : r;
}

export async function deleteTeamAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("team.delete", (a, ctx) => deleteTeam(a, text(form, "team"), ctx), { revalidate: paths() });
  return r.ok ? { ok: true, message: "Team deleted." } : r;
}

export async function teamMemberAction(_p: Result | null, form: FormData): Promise<Result> {
  const member = text(form, "member");
  const add = text(form, "op") === "add";
  const r = await runAction("team.member", (a, ctx) => setTeamMember(a, text(form, "team"), member, add, ctx), { revalidate: paths(member) });
  return r.ok ? { ok: true, message: add ? "Added to the team." : "Taken out of the team." } : r;
}
