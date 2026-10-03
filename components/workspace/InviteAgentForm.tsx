"use client";

import { inviteAgentAction } from "@/app/(workspace)/agents/actions";
import { ActionForm, Checkbox, Select, Submit, TextInput } from "./forms";

export function InviteAgentForm({ cities, organizationReference }: { cities: { id: string; name: string; state: string }[]; organizationReference?: string }) {
  return (
    <ActionForm action={inviteAgentAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextInput label="Full name" name="name" required autoComplete="off" />
      <TextInput label="Email" name="email" type="email" required autoComplete="off" hint="The invitation goes here. They set their own password." />
      <TextInput label="Phone" name="phone" type="tel" required autoComplete="off" hint="Customers who enquire on their listings see this." />
      <Select label="City they work in" name="cityId" required placeholder="Choose" options={cities.map((c) => ({ value: c.id, label: `${c.name}, ${c.state}` }))} />
      <TextInput label="RERA agent registration number" name="reraAgentNumber" />
      <TextInput label="Years of experience" name="experienceYears" inputMode="numeric" />
      <TextInput
        label="Organization reference"
        name="organizationReference"
        placeholder="ORG-XXXXXXXX"
        defaultValue={organizationReference}
        hint="The brokerage, developer or operator they work for. Leave blank for an independent agent."
      />
      <Select
        label="Role"
        name="role"
        defaultValue="agent"
        options={[
          { value: "agent", label: "Agent: their own listings and leads" },
          { value: "broker_admin", label: "Broker admin: everything in the organization" },
        ]}
      />
      <div className="sm:col-span-2">
        <Checkbox label="Mark as verified" name="verified" hint="Only if you have checked their identity and RERA registration." />
      </div>
      <div className="flex justify-end sm:col-span-2">
        <Submit>Send invitation</Submit>
      </div>
    </ActionForm>
  );
}
