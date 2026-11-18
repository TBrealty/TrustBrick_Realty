"use client";

import { useState } from "react";
import { saveBankAccountAction } from "@/app/(workspace)/my-properties/actions";
import { ActionForm, Submit, TextInput } from "@/components/workspace/forms";

/** A bank account or a UPI ID, in the landlord's own name. Checked with the bank before it's used. */
export function BankAccountForm({ name, replacing }: { name: string; replacing: boolean }) {
  const [method, setMethod] = useState<"bank" | "upi">("bank");
  return (
    <ActionForm action={saveBankAccountAction} className="space-y-4" successMessage="Saved." resetOnSuccess>
      {replacing && <p className="text-[0.8125rem] text-stone-deep">Changing it? For your safety, rent waits 48 hours before it&apos;s paid into a changed account, and we email you.</p>}
      <fieldset className="flex gap-4 text-[0.875rem]">
        <legend className="sr-only">How you&apos;re paid</legend>
        {(["bank", "upi"] as const).map((m) => (
          <label key={m} className="inline-flex items-center gap-2">
            <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
            {m === "bank" ? "Bank account" : "UPI ID"}
          </label>
        ))}
      </fieldset>
      <TextInput label="Name on the account" name="holderName" defaultValue={name} required autoComplete="name" hint="It must be your own name: rent isn't paid into anyone else's account." />
      {method === "bank" ? (
        <>
          <TextInput label="Account number" name="accountNumber" inputMode="numeric" autoComplete="off" required />
          <TextInput label="Account number again" name="confirmAccountNumber" inputMode="numeric" autoComplete="off" required />
          <TextInput label="IFSC" name="ifsc" autoComplete="off" required maxLength={11} placeholder="HDFC0001234" className="uppercase" hint="On your cheque book or passbook." />
        </>
      ) : (
        <TextInput label="UPI ID" name="vpa" autoComplete="off" required placeholder="name@bank" />
      )}
      <Submit>{replacing ? "Change account" : "Save account"}</Submit>
    </ActionForm>
  );
}
