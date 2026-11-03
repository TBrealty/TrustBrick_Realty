"use client";

import { useState } from "react";
import { inviteMemberAction } from "@/app/(workspace)/team/actions";
import { ActionForm, Select, Submit, TextInput } from "./forms";

type Role = { value: string; label: string; description: string; agent: boolean };

/** Adding someone to the organization. Agents and supervisors also need a phone number customers can call. */
export function InviteMemberForm({ roles, teams }: { roles: Role[]; teams: { id: string; name: string }[] }) {
  const [role, setRole] = useState(roles.find((r) => r.value === "agent")?.value ?? roles[0]?.value ?? "");
  const chosen = roles.find((r) => r.value === role);
  return (
    <ActionForm action={inviteMemberAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextInput label="Full name" name="name" required autoComplete="off" />
      <TextInput label="Email" name="email" type="email" required autoComplete="off" hint="The invitation goes here. They set their own password." />
      <div className="sm:col-span-2">
        <Select
          label="Role"
          name="role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={roles.map((r) => ({ value: r.value, label: r.label }))}
          hint={chosen?.description}
        />
      </div>
      {chosen?.agent && (
        <>
          <TextInput label="Phone" name="phone" type="tel" required autoComplete="off" hint="Customers who enquire on their listings see this." />
          <TextInput label="RERA agent registration number" name="reraAgentNumber" autoComplete="off" hint="Optional. Where your state requires one." />
          {teams.length > 0 && (
            <Select label="Team" name="teamId" placeholder="No team for now" options={teams.map((t) => ({ value: t.id, label: t.name }))} hint="You can change this later." />
          )}
        </>
      )}
      <div className="flex justify-end sm:col-span-2">
        <Submit>Send invitation</Submit>
      </div>
    </ActionForm>
  );
}
