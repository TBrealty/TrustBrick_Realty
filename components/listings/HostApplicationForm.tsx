"use client";

import { applyAsHostAction } from "@/app/(browse)/listings/stay-actions";
import { ActionForm, Checkbox, Select, Submit, TextArea, TextInput } from "@/components/workspace/forms";
import { HOST_RELATIONSHIP_LABELS } from "@/lib/stays/labels";

export function HostApplicationForm({ cities }: { cities: { id: string; name: string; state: string }[] }) {
  return (
    <ActionForm action={applyAsHostAction} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextInput label="Phone" name="phone" type="tel" autoComplete="tel" required hint="We call to confirm who you are. Guests see it only after they book." />
      <Select label="City your home is in" name="cityId" required placeholder="Choose" options={cities.map((c) => ({ value: c.id, label: `${c.name}, ${c.state}` }))} />
      <Select
        label="Your relationship to the home"
        name="relationship"
        required
        defaultValue="owner"
        options={Object.entries(HOST_RELATIONSHIP_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <TextInput label="Languages you speak" name="languages" placeholder="English, Hindi" hint="Separate with commas." />
      <TextArea
        label="About you (optional)"
        name="about"
        rows={3}
        maxLength={1000}
        fieldClassName="sm:col-span-2"
        hint="Guests see this on your stays. A line or two about you and your home is plenty."
      />
      <div className="sm:col-span-2">
        <Checkbox
          name="agree"
          label="I'm allowed to host paying guests in this home"
          hint="As the owner, or with the owner's and (where needed) the housing society's permission. I'll follow local registration rules, including Form C for foreign guests."
        />
      </div>
      <div className="sm:col-span-2">
        <Submit>Send application</Submit>
      </div>
    </ActionForm>
  );
}
