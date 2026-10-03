"use client";

import { createOrganizationAction, updateOrganizationAction } from "@/app/(workspace)/organizations/actions";
import { ActionForm, Select, Submit, TextInput } from "./forms";

type Values = { name?: string; orgType?: string; contactEmail?: string | null; contactPhone?: string | null; reraRegistration?: string | null; cityId?: string | null };

export function OrganizationForm({ cities, values, referenceId }: { cities: { id: string; name: string; state: string }[]; values?: Values; referenceId?: string }) {
  const editing = Boolean(referenceId);
  return (
    <ActionForm action={editing ? updateOrganizationAction : createOrganizationAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {referenceId && <input type="hidden" name="ref" value={referenceId} />}
      <TextInput label="Name" name="name" required defaultValue={values?.name} fieldClassName="sm:col-span-2" />
      {!editing && (
        <Select
          label="Type"
          name="orgType"
          required
          placeholder="Choose"
          options={[
            { value: "brokerage", label: "Brokerage" },
            { value: "developer", label: "Developer" },
            { value: "property_manager", label: "Property manager" },
            { value: "pg_operator", label: "PG operator" },
            { value: "vendor", label: "Vendor" },
          ]}
        />
      )}
      <Select label="City" name="cityId" defaultValue={values?.cityId ?? ""} placeholder="Not specified" options={cities.map((c) => ({ value: c.id, label: `${c.name}, ${c.state}` }))} />
      <TextInput label="Contact email" name="contactEmail" type="email" defaultValue={values?.contactEmail ?? ""} />
      <TextInput label="Contact phone" name="contactPhone" defaultValue={values?.contactPhone ?? ""} />
      <TextInput label="RERA registration" name="reraRegistration" defaultValue={values?.reraRegistration ?? ""} hint="Where the state requires one." />
      <div className="flex justify-end sm:col-span-2">
        <Submit>{editing ? "Save changes" : "Add organization"}</Submit>
      </div>
    </ActionForm>
  );
}
