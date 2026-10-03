"use client";

import { inviteAdminAction, setAdminPermissionsAction } from "@/app/(workspace)/admins/actions";
import type { Permission } from "@/lib/authz/catalog";
import { ActionForm, Submit, TextInput } from "./forms";
import { PermissionPicker } from "./PermissionPicker";

export function InviteAdminForm() {
  return (
    <ActionForm action={inviteAdminAction} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput label="Email" name="email" type="email" required autoComplete="off" />
        <TextInput label="Name (optional)" name="name" />
      </div>
      <PermissionPicker />
      <div className="max-w-sm">
        <TextInput label="Your password" name="password" type="password" required autoComplete="current-password" hint="Inviting an admin needs your password again." />
      </div>
      <div className="flex justify-end">
        <Submit>Send invitation</Submit>
      </div>
    </ActionForm>
  );
}

export function EditPermissionsForm({ referenceId, initial }: { referenceId: string; initial: Permission[] }) {
  return (
    <ActionForm action={setAdminPermissionsAction} className="space-y-5">
      <input type="hidden" name="ref" value={referenceId} />
      <PermissionPicker initial={initial} />
      <div className="flex flex-wrap items-end justify-end gap-3">
        <div className="w-full max-w-xs">
          <TextInput label="Your password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <Submit>Save permissions</Submit>
      </div>
    </ActionForm>
  );
}
