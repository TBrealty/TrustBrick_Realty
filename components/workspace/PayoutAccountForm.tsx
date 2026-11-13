"use client";

import { useState } from "react";
import { savePayoutAccountAction } from "@/app/(workspace)/payouts/actions";
import { ActionForm, Checkbox, Submit, TextInput } from "@/components/workspace/forms";

/**
 * Where payouts go: a bank account (checked with a ₹1 test deposit) or a UPI ID, and the PAN the
 * payment provider needs for KYC. Sent to the provider; Trustbrick keeps only the last four digits.
 */
export function PayoutAccountForm({ defaultName }: { defaultName: string }) {
  const [method, setMethod] = useState<"bank" | "upi">("bank");
  return (
    <ActionForm action={savePayoutAccountAction} className="max-w-xl space-y-5">
      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium">Paid to</legend>
        <div className="flex gap-2">
          {(["bank", "upi"] as const).map((m) => (
            <label key={m} className={`flex cursor-pointer items-center gap-2 border px-3.5 py-2 text-[0.875rem] ${method === m ? "border-ink bg-ink/5" : "border-line-light"}`}>
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="accent-ink" />
              {m === "bank" ? "Bank account" : "UPI ID"}
            </label>
          ))}
        </div>
      </fieldset>
      <TextInput label="Name on the account" name="holderName" defaultValue={defaultName} autoComplete="name" required hint="Exactly as the bank has it. It's checked against the account." />
      {method === "bank" ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextInput label="Account number" name="accountNumber" inputMode="numeric" autoComplete="off" required />
            <TextInput label="Account number again" name="confirmAccountNumber" inputMode="numeric" autoComplete="off" required />
          </div>
          <TextInput label="IFSC" name="ifsc" autoComplete="off" required hint="11 characters, on your cheque book or passbook, e.g. HDFC0001234." className="uppercase" />
        </>
      ) : (
        <TextInput label="UPI ID" name="upi" autoComplete="off" required hint="e.g. name@okhdfcbank. Payouts by UPI have a daily limit set by your bank." />
      )}
      <TextInput label="PAN" name="pan" autoComplete="off" required hint="The account holder's PAN. Payment providers must check it (KYC); Trustbrick doesn't keep it." className="uppercase" />
      <Checkbox
        name="agree"
        label="I agree that guests' payments for my stays are collected by Trustbrick's payment partner and paid to this account a day after check-in, less Trustbrick's commission and the GST on it, and less any refunds under my cancellation policy."
      />
      <Submit>Verify and save</Submit>
    </ActionForm>
  );
}
