import type { Metadata } from "next";
import { BankAccountForm } from "@/components/rent/BankAccountForm";
import { savePanAction } from "@/app/(workspace)/my-properties/actions";
import { ActionForm, Submit, TextInput } from "@/components/workspace/forms";
import { Card, PageHeader, StatusBadge } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime } from "@/lib/format";
import { landlordHome } from "@/lib/services/rent/landlords";

export const metadata: Metadata = { title: "Bank account" };

/** Where the landlord's rent is paid, and their PAN for tenants' receipts. */
export default async function BankAccountPage() {
  const actor = await requirePermission("rent.receive", "/bank-account");
  const home = await landlordHome(actor);
  const bank = home.bank;

  return (
    <>
      <PageHeader title="Bank account" description="Trustbrick pays your rent into this account, usually the working day after your tenant pays." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Where your rent goes"
          actions={bank && <StatusBadge tone={bank.status === "verified" ? "success" : bank.status === "failed" ? "danger" : "warning"}>{bank.status === "verified" ? "Verified" : bank.status === "failed" ? "Failed" : "Being checked"}</StatusBadge>}
        >
          {bank && (
            <div className="mb-5 border-b border-line-light pb-5 text-[0.875rem]">
              <p className="font-medium">{bank.method === "bank" ? `${bank.bankName ?? "Bank account"} ending ${bank.accountLast4}` : `UPI ${bank.upiMasked}`}</p>
              <p className="text-stone-deep">
                In the name of {bank.holderName}
                {bank.ifsc ? ` · IFSC ${bank.ifsc}` : ""}
                {bank.verifiedAt ? ` · verified ${formatDateTime(bank.verifiedAt)}` : ""}
              </p>
              {bank.statusReason && <p className="mt-2 text-graphite">{bank.statusReason}</p>}
              {bank.holdUntil && <p className="mt-2 text-amber">Changed recently: for your safety, rent waits until {formatDateTime(bank.holdUntil)} before it&apos;s paid into it.</p>}
            </div>
          )}
          <BankAccountForm name={home.name} replacing={Boolean(bank)} />
        </Card>
        <Card title="Your PAN" description="Shown on your tenants' rent receipts: they need it to claim HRA once the year's rent is over ₹1 lakh.">
          {home.panMasked && <p className="mb-4 text-[0.875rem]">On file: {home.panMasked}</p>}
          <ActionForm action={savePanAction} className="space-y-4" successMessage="Saved." resetOnSuccess>
            <TextInput label={home.panMasked ? "Change your PAN" : "PAN"} name="pan" required autoComplete="off" maxLength={10} className="uppercase" placeholder="ABCDE1234F" />
            <Submit>Save PAN</Submit>
          </ActionForm>
          <p className="mt-4 text-[0.75rem] text-stone-deep">Kept encrypted. Only your tenants&apos; receipts show it.</p>
        </Card>
      </div>
    </>
  );
}
