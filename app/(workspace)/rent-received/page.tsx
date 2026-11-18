import type { Metadata } from "next";
import Link from "next/link";
import { Card, DataTable, PageHeader, StatCard, StatusBadge } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { formatDay, formatMoney } from "@/lib/format";
import { type SettlementView, landlordRentTotals, landlordSettlements } from "@/lib/services/rent/payments";

export const metadata: Metadata = { title: "Rent received" };

const TONE = { on_hold: "warning", ready: "info", paid: "success", failed: "danger", cancelled: "neutral" } as const;

/** Every rent payment and when it reached the landlord's bank, with the bank's reference. */
export default async function RentReceivedPage() {
  const actor = await requirePermission("rent.receive", "/rent-received");
  const [rows, totals] = await Promise.all([landlordSettlements(actor.userId), landlordRentTotals(actor.userId)]);
  return (
    <>
      <PageHeader title="Rent received" description="Each rent your tenants paid, and when Trustbrick paid it into your bank account." />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Paid into your bank" value={formatMoney(totals.paidOut)} />
        <StatCard label="On its way" value={formatMoney(totals.waiting)} hint="Usually the next working day" />
        <StatCard label="Waiting on you" value={formatMoney(totals.onHold)} hint="Proof of ownership or bank account" />
      </div>
      <Card padded={false}>
        <DataTable<SettlementView>
          caption="Rent received"
          rows={rows}
          rowKey={(s) => s.referenceId}
          empty={<p className="p-5 text-[0.875rem] text-stone-deep">No rent yet. When a tenant pays, it shows here.</p>}
          columns={[
            {
              header: "Property",
              cell: (s) => (
                <Link href={`/my-properties/${s.propertyReferenceId}`} className="font-medium hover:underline">
                  {s.title}
                </Link>
              ),
            },
            { header: "Tenant", cell: (s) => s.tenantName, hideBelow: "md" },
            { header: "Rent due", cell: (s) => formatDay(s.rentDue) },
            { header: "Amount", cell: (s) => formatMoney(s.amount), align: "right" },
            {
              header: "Status",
              cell: (s) => (
                <div>
                  <StatusBadge tone={TONE[s.status]}>{s.status === "paid" && s.paidAt ? `Paid ${formatDay(s.paidAt)}` : s.statusLabel}</StatusBadge>
                  {s.status === "paid" && s.utr && <p className="mt-1 font-mono text-[0.6875rem] text-stone-deep">UTR {s.utr}</p>}
                  {s.status !== "paid" && s.holdReason && <p className="mt-1 text-[0.75rem] text-stone-deep">{s.holdReason}</p>}
                  {s.status === "ready" && s.dueBy && <p className="mt-1 text-[0.75rem] text-stone-deep">By {formatDay(s.dueBy)}</p>}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
