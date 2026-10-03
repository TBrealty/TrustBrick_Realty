"use client";

import { acceptInvitationAction } from "@/app/invite/[token]/actions";
import { ActionForm, Submit, TextInput } from "./forms";

export function AcceptInvitationForm({ token, kind, newAccount, defaultName }: { token: string; kind: "admin" | "agent"; newAccount: boolean; defaultName: string }) {
  return (
    <ActionForm action={acceptInvitationAction} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="kind" value={kind} />
      {newAccount && (
        <>
          <TextInput label="Your name" name="name" defaultValue={defaultName} autoComplete="name" required />
          <TextInput label="Choose a password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters. Only you know it." />
        </>
      )}
      <Submit className="w-full">{newAccount ? "Create account and accept" : "Accept invitation"}</Submit>
    </ActionForm>
  );
}
