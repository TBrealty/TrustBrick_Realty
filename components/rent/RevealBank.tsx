"use client";

import { useState } from "react";
import { revealBankAction } from "@/app/(workspace)/rent-collection/actions";
import { ActionForm, Submit, TextInput } from "@/components/workspace/forms";

type Details = { holderName: string; bankName: string | null; ifsc: string | null; accountNumber: string | null; vpa: string | null };

/** Shows a landlord's full bank details to the back office, once a reason is given. Every look is audited. */
export function RevealBank({ landlordRef }: { landlordRef: string }) {
  const [details, setDetails] = useState<Details | null>(null);
  if (details) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[3px] border border-amber/40 bg-amber/5 p-3 text-[0.8125rem]">
        <dt className="text-stone-deep">Holder</dt>
        <dd>{details.holderName}</dd>
        {details.accountNumber && (
          <>
            <dt className="text-stone-deep">Account</dt>
            <dd className="font-mono select-all">{details.accountNumber}</dd>
            <dt className="text-stone-deep">IFSC</dt>
            <dd className="font-mono select-all">{details.ifsc}</dd>
            <dt className="text-stone-deep">Bank</dt>
            <dd>{details.bankName ?? "—"}</dd>
          </>
        )}
        {details.vpa && (
          <>
            <dt className="text-stone-deep">UPI ID</dt>
            <dd className="font-mono select-all">{details.vpa}</dd>
          </>
        )}
      </dl>
    );
  }
  return (
    <details>
      <summary className="cursor-pointer text-[0.8125rem] text-stone-deep">Show full bank details</summary>
      <ActionForm action={revealBankAction} className="mt-3 space-y-3" onSuccess={(r) => setDetails((r as { data?: Details }).data ?? null)}>
        <input type="hidden" name="landlord" value={landlordRef} />
        <TextInput label="Why do you need them?" name="reason" required hint="Recorded in the audit log." />
        <Submit variant="secondary" className="wbtn-sm">
          Show
        </Submit>
      </ActionForm>
    </details>
  );
}
