import type { Metadata } from "next";
import Link from "next/link";
import { Card, DataTable, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime, formatDay, formatMoney, formatPrice } from "@/lib/format";
import { type PayoutRow, hostPayouts } from "@/lib/services/stays/payments";

export const metadata: Metadata = { title: "Payouts" };

const STATUS: Record<PayoutRow["status"], { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  processing: { label: "On its way", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  on_hold: { label: "On hold", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "None", tone: "neutral" },
};

function statusNote(r: PayoutRow) {
  if (r.status === "paid" && r.paidAt) return `${formatDateTime(r.paidAt)}${r.utr ? ` · UTR ${r.utr}` : ""}`;
  if (r.status === "on_hold") return r.holdReason;
  if (r.status === "failed") return "Trustbrick is retrying it";
  if (r.status === "cancelled") return "Guest refunded in full";
  return `On ${formatDateTime(r.releaseAt)}`;
}

/** A host's money from stays paid online: what's been paid, what's coming, and where it goes. */
export default async function PayoutsPage() {
  const actor = await requirePermission("commission.view", "/payouts");
  const p = await hostPayouts(actor);
  const a = p.account;

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Guests pay online when they book. You're paid a day after each check-in, to the account below, less Trustbrick's commission and the GST on it."
      />

      {p.online && a?.status !== "active" && (
        <p role="alert" className="mb-6 border-l-2 border-amber bg-amber/10 px-4 py-3 text-[0.875rem]">
          <strong>Guests can&apos;t book your stays yet.</strong> {a ? "Your payout account isn't verified." : "Add the bank account you want to be paid into."}{" "}
          {p.canManageAccount ? (
            <Link href="/payouts/account" className="font-medium underline">
              {a ? "Fix it" : "Add it now"}
            </Link>
          ) : (
            "Ask your organization's admin to add it."
          )}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Received this month" value={formatPrice(p.totals.receivedThisMonth, { compact: false })} emphasis />
        <StatCard label="Coming up" value={formatPrice(p.totals.upcoming, { compact: false })} hint={`${p.totals.upcomingCount} payout${p.totals.upcomingCount === 1 ? "" : "s"}`} />
        <StatCard label="On hold" value={formatPrice(p.totals.onHold, { compact: false })} />
      </div>

      <Card
        title="Payout account"
        className="mb-6"
        actions={
          a ? (
            <StatusBadge tone={a.status === "active" ? "success" : a.status === "pending" ? "neutral" : "warning"}>
              {a.status === "active" ? "Verified" : a.status === "pending" ? "Being verified" : a.status === "suspended" ? "Suspended" : "Needs attention"}
            </StatusBadge>
          ) : null
        }
      >
        {a ? (
          <div className="flex flex-wrap items-end justify-between gap-4 text-[0.9375rem]">
            <div>
              <p className="font-medium">{a.method === "bank" ? `${a.bankName} ····${a.accountLast4}` : `UPI ${a.upiMasked}`}</p>
              <p className="text-[0.8125rem] text-stone-deep">
                {a.holderName}
                {a.ifsc ? ` · IFSC ${a.ifsc}` : ""}
                {a.verifiedAt ? ` · verified ${formatDay(a.verifiedAt)}` : ""}
              </p>
              {a.statusReason && a.status !== "active" && <p className="mt-1 text-[0.8125rem] text-brick">{a.statusReason}</p>}
            </div>
            {p.canManageAccount && (
              <Link href="/payouts/account" className="btn btn-light btn-compact">
                <span>Change</span>
              </Link>
            )}
          </div>
        ) : (
          <EmptyState
            title="No payout account yet"
            action={
              p.canManageAccount ? (
                <Link href="/payouts/account" className="btn btn-dark btn-compact">
                  <span>Add a bank account</span>
                </Link>
              ) : undefined
            }
          >
            {p.canManageAccount ? "Add the bank account or UPI ID your payouts go to." : "Your organization's admin adds the account payouts go to."}
          </EmptyState>
        )}
      </Card>

      <Card title="Payouts" padded={false}>
        <DataTable
          caption="Payouts"
          rows={p.rows}
          rowKey={(r) => r.referenceId}
          empty={
            <div className="p-5">
              <EmptyState title="No payouts yet">Bookings paid online appear here once they&apos;re confirmed.</EmptyState>
            </div>
          }
          columns={[
            {
              header: "Booking",
              cell: (r) => (
                <div>
                  <Link href={`/bookings/${r.booking.referenceId}`} className="font-medium underline-offset-2 hover:underline">
                    {r.booking.guestName}
                  </Link>
                  <p className="text-[0.75rem] text-stone-deep">
                    {formatDay(r.booking.checkIn)} – {formatDay(r.booking.checkOut)} · {r.booking.title}
                  </p>
                </div>
              ),
            },
            {
              header: "Guest paid",
              align: "right",
              hideBelow: "md",
              cell: (r) => (
                <span>
                  {formatMoney(r.paid)}
                  {r.refunded > 0 && <span className="block text-[0.75rem] text-stone-deep">{formatMoney(-r.refunded)} refunded</span>}
                </span>
              ),
            },
            { header: "Commission + GST", align: "right", hideBelow: "lg", cell: (r) => formatMoney(-(r.commission + r.gst)) },
            { header: "You receive", align: "right", cell: (r) => <span className="font-medium">{formatMoney(r.amount)}</span> },
            {
              header: "Status",
              cell: (r) => (
                <div>
                  <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
                  <p className="mt-1 text-[0.75rem] text-stone-deep">{statusNote(r)}</p>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
