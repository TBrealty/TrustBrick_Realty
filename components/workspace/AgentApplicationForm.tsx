"use client";

import { applyAsAgentAction } from "@/app/become-an-agent/actions";
import { ActionForm, Select, Submit, TextArea, TextInput } from "./forms";

export function AgentApplicationForm({ cities }: { cities: { id: string; name: string; state: string }[] }) {
  return (
    <ActionForm action={applyAsAgentAction} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextInput label="Phone" name="phone" type="tel" autoComplete="tel" required hint="Customers who enquire on your listings will see this." />
      <Select label="City you work in" name="cityId" required placeholder="Choose" options={cities.map((c) => ({ value: c.id, label: `${c.name}, ${c.state}` }))} />
      <TextInput label="RERA agent registration number" name="reraAgentNumber" hint="Required in most states. It speeds up verification." />
      <TextInput label="Years of experience" name="experienceYears" inputMode="numeric" />
      <TextInput
        label="Brokerage reference (optional)"
        name="organizationReference"
        placeholder="ORG-XXXXXXXX"
        fieldClassName="sm:col-span-2"
        hint="If you work for a brokerage on Trustbrick, ask them for their ORG- reference. Leave blank to work independently."
      />
      <TextArea label="About you (optional)" name="bio" rows={3} maxLength={600} fieldClassName="sm:col-span-2" />
      <div className="sm:col-span-2">
        <Submit>Send application</Submit>
      </div>
    </ActionForm>
  );
}
