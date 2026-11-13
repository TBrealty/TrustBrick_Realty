import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PayoutAccountForm } from "@/components/workspace/PayoutAccountForm";
import { BackLink, Card, PageHeader } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { canManagePayoutAccount, payoutAccountFor } from "@/lib/services/stays/payments";

export const metadata: Metadata = { title: "Payout account" };

export default async function PayoutAccountPage() {
  const actor = await requirePermission("commission.view", "/payouts/account");
  if (!canManagePayoutAccount(actor)) forbidden();
  const current = await payoutAccountFor(actor.organization.id);

  return (
    <>
      <BackLink href="/payouts">Payouts</BackLink>
      <PageHeader title={current ? "Change your payout account" : "Add your payout account"} description="Where Trustbrick pays you for stays booked online." />
      {current?.status === "active" && (
        <p className="mb-6 border-l-2 border-line-light bg-paper px-4 py-3 text-[0.875rem] text-graphite">
          Payouts now go to {current.method === "bank" ? `${current.bankName} ····${current.accountLast4}` : `UPI ${current.upiMasked}`}. A new account replaces it once
          it&apos;s verified.
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="Account details">
          <PayoutAccountForm defaultName={actor.name} />
        </Card>
        <Card title="How payouts work">
          <ol className="list-decimal space-y-2.5 pl-4 text-[0.875rem] text-graphite">
            <li>Guests pay online when they book. For requests, the payment is held until you accept.</li>
            <li>A day after check-in, the guest&apos;s payment is paid to this account, less Trustbrick&apos;s commission and the GST on it.</li>
            <li>If a guest cancels late, you keep your share of what your cancellation policy lets you keep. If you cancel, the guest gets everything back.</li>
            <li>Your bank details and PAN are held by our payment partner, which checks them with a ₹1 test deposit. Trustbrick keeps only the last four digits.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
