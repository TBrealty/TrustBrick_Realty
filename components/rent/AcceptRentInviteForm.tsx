"use client";

import { acceptRentInviteAction } from "@/app/invite/rent-actions";
import { ActionForm, Submit, TextInput } from "@/components/workspace/forms";

/** The sign-up form behind a landlord's or tenant's link: name, phone and a password, typed twice. */
export function AcceptRentInviteForm({ token, kind, newAccount, defaultName, defaultPhone }: { token: string; kind: "landlord" | "tenant"; newAccount: boolean; defaultName: string; defaultPhone?: string }) {
  return (
    <ActionForm action={acceptRentInviteAction} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="kind" value={kind} />
      {newAccount && (
        <>
          <TextInput label="Your full name" name="name" defaultValue={defaultName} autoComplete="name" required hint={kind === "landlord" ? "As on your PAN and bank account: rent is paid only into an account in this name." : undefined} />
          <TextInput label="Mobile number" name="phone" type="tel" defaultValue={defaultPhone} autoComplete="tel" inputMode="tel" required />
          <TextInput label="Choose a password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters. Only you know it." />
          <TextInput label="Type the password again" name="confirm" type="password" autoComplete="new-password" required />
        </>
      )}
      <Submit className="w-full">{newAccount ? "Create account and accept" : kind === "landlord" ? "Accept: this property is mine" : "Accept the tenancy"}</Submit>
    </ActionForm>
  );
}
