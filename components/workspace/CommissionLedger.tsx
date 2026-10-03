import Link from "next/link";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { StatusBadge } from "@/components/workspace/ui";
import { COMMISSION_SERVICE_LABELS } from "@/lib/commission/terms";
import { formatDateTime, formatDay } from "@/lib/format";
import type { LedgerRow } from "@/lib/services/commission";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const STATUS: Record<LedgerRow["status"], { label: string; tone: "warning" | "success" | "neutral" | "danger" }> = {
  due: { label: "Due", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  waived: { label: "Waived", tone: "neutral" },
};

/**
 * The commission ledger as a list: what each charge is for, how it was worked out, and where it
 * stands. Partners and the team see the same rows; `actions` adds the team's buttons.
 */
export function CommissionLedger({ rows, showPartner = false, actions }: { rows: LedgerRow[]; showPartner?: boolean; actions?: (row: LedgerRow) => React.ReactNode }) {
  return (
    <ul className="divide-y divide-line-light">
      {rows.map((r) => (
        <li key={r.referenceId} className="grid grid-cols-1 gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_14rem_auto] lg:gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[0.875rem] font-medium">{r.description}</p>
              <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[0.6875rem] text-ink">{COMMISSION_SERVICE_LABELS[r.service]}</span>
              {r.kind === "adjustment" && <span className="rounded-full border border-dashed border-stone px-2 py-0.5 text-[0.6875rem]">Adjustment</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-stone-deep">
              <ReferenceId value={r.referenceId} copy />
              <span>{formatDay(r.createdAt)}</span>
              {showPartner && (
                <span>
                  {r.organization.name} <span className="font-mono">{r.organization.referenceId}</span>
                </span>
              )}
              {r.listing && (
                <Link href={`/properties/${r.listing.referenceId}`} className="underline">
                  {r.listing.title}
                </Link>
              )}
              {r.bookingReferenceId && <span className="font-mono">{r.bookingReferenceId}</span>}
            </div>
            {r.kind === "charge" && r.dealValue !== null && (
              <p className="mt-1.5 text-[0.75rem] text-graphite">
                {r.basis === "brokerage" ? (
                  <>
                    {Number(r.ratePercent)}% of the brokerage ({inr(r.brokerage ?? 0)}) on a deal of {inr(r.dealValue)}
                  </>
                ) : (
                  <>
                    {Number(r.ratePercent)}% of {inr(r.dealValue)}
                  </>
                )}
              </p>
            )}
            {r.status !== "due" && (
              <p className="mt-1.5 text-[0.75rem] text-stone-deep">
                {STATUS[r.status].label} {r.statusChangedAt ? formatDateTime(r.statusChangedAt) : ""}
                {r.statusChangedBy ? ` by ${r.statusChangedBy}` : ""}
                {r.paymentReference ? ` · ref ${r.paymentReference}` : ""}
                {r.statusNote ? ` · “${r.statusNote}”` : ""}
              </p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-[0.75rem] lg:grid-cols-1 lg:gap-0.5 lg:text-right">
            <div className="lg:flex lg:justify-between lg:gap-3">
              <dt className="text-stone-deep">Commission</dt>
              <dd className="tabular-nums">{inr(r.amount)}</dd>
            </div>
            <div className="lg:flex lg:justify-between lg:gap-3">
              <dt className="text-stone-deep">GST {Number(r.gstPercent)}%</dt>
              <dd className="tabular-nums">{inr(r.gstAmount)}</dd>
            </div>
            <div className="lg:flex lg:justify-between lg:gap-3 lg:border-t lg:border-line-light lg:pt-0.5">
              <dt className="text-stone-deep">Total</dt>
              <dd className="text-[0.875rem] font-semibold tabular-nums">{inr(r.total)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:items-end">
            <StatusBadge tone={r.overdue ? "danger" : STATUS[r.status].tone}>{r.overdue ? "Overdue" : STATUS[r.status].label}</StatusBadge>
            {actions?.(r)}
          </div>
        </li>
      ))}
    </ul>
  );
}

export const formatInr = inr;
