"use client";

import { changePasswordAction, preferencesAction } from "@/app/(workspace)/profile/actions";
import { ActionForm, Checkbox, Submit, TextInput } from "./forms";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction} className="grid grid-cols-1 max-w-md gap-4" resetOnSuccess>
      <TextInput label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <TextInput label="New password" name="newPassword" type="password" autoComplete="new-password" required hint="At least 10 characters." />
      <TextInput label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required />
      <div>
        <Submit>Change password</Submit>
      </div>
    </ActionForm>
  );
}

export function PreferencesForm({ types }: { types: { type: string; label: string; enabled: boolean; locked: boolean }[] }) {
  return (
    <ActionForm action={preferencesAction} className="space-y-2.5">
      {types.map((t) =>
        t.locked ? (
          <div key={t.type} className="flex items-start gap-2.5 text-[0.8125rem] text-stone-deep">
            <input type="checkbox" checked disabled className="mt-0.5 size-4" aria-label={t.label} />
            <span>
              {t.label} <span className="text-[0.75rem]">(always on)</span>
            </span>
          </div>
        ) : (
          <Checkbox key={t.type} name="enabled" value={t.type} label={t.label} defaultChecked={t.enabled} />
        ),
      )}
      <div className="pt-2">
        <Submit variant="secondary">Save preferences</Submit>
      </div>
    </ActionForm>
  );
}
