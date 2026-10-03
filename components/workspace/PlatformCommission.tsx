import Link from "next/link";
import { formatInr } from "@/components/workspace/CommissionLedger";
import { Card, StatCard, StatusBadge } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { COMMISSION_SERVICE_LABELS } from "@/lib/commission/terms";
import { formatDay } from "@/lib/format";
import { OVERDUE_DAYS, commissionOverview } from "@/lib/services/commission";

/** Commission on the admin dashboard: what's owed and collected, who owes most, and what needs a look. */
export async function PlatformCommission({ actor }: { actor: Actor }) {
  if (!can(actor, "commission.view", "platform")) return null;
  const c = await commissionOverview(actor);
  const t = c.totals;

  return (
    <section aria-labelledby="commission" className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="commission" className="text-[0.9375rem] font-semibold">
          Commission
        </h2>
        <Link href="/commissions" className="text-[0.8125rem] underline">
          All charges
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Due from partners" value={formatInr(t.due)} href="/commissions" emphasis hint={`${t.dueCount} charge${t.dueCount === 1 ? "" : "s"} unpaid`} />
        <StatCard label="Overdue" value={formatInr(t.overdue)} href="/commissions" hint={`Due over ${OVERDUE_DAYS} days`} />
        <StatCard label="Charged this month" value={formatInr(t.chargedThisMonth)} href="/commissions?status=all" />
        <StatCard label="Collected this month" value={formatInr(t.paidThisMonth)} href="/commissions?status=paid" />
      </div>

      {(c.unacceptedPartners > 0 || c.closedWithoutCommission > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {c.unacceptedPartners > 0 && (
            <div className="wcard px-4 py-3 text-[0.8125rem]">
              <p>
                <strong className="font-medium text-ink">{c.unacceptedPartners}</strong> partner{c.unacceptedPartners === 1 ? "" : "s"} with live listings {c.unacceptedPartners === 1 ? "hasn't" : "haven't"}{" "}
                accepted commission rates yet.
              </p>
              <p className="mt-0.5 text-stone-deep">Their live listings stay up; they can&apos;t submit new ones until they accept.</p>
            </div>
          )}
          {c.closedWithoutCommission > 0 && (
            <Link href="/commissions#closed" className="wcard block px-4 py-3 text-[0.8125rem] hover:border-ink/40">
              <p>
                <strong className="font-medium text-ink">{c.closedWithoutCommission}</strong> sale{c.closedWithoutCommission === 1 ? "" : "s"} or rental{c.closedWithoutCommission === 1 ? "" : "s"} closed without
                a commission in the last 90 days.
              </p>
              <p className="mt-0.5 text-stone-deep">Marked closed by someone else or taken off the market. Worth a look →</p>
            </Link>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Who owes the most" padded={false}>
          {c.owing.length === 0 ? (
            <p className="p-5 text-[0.8125rem] text-stone-deep">Nothing is due.</p>
          ) : (
            <ul className="divide-y divide-line-light text-[0.8125rem]">
              {c.owing.map((o) => (
                <li key={o.referenceId} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <Link href={`/commissions?q=${o.referenceId}`} className="min-w-0 truncate hover:underline">
                    {o.name}
                    <span className="text-stone-deep">
                      {" "}
                      · {o.charges} charge{o.charges === 1 ? "" : "s"}
                    </span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium tabular-nums">{formatInr(o.due)}</span>
                    {o.overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Latest charges" padded={false}>
          {c.recent.length === 0 ? (
            <p className="p-5 text-[0.8125rem] text-stone-deep">No charges yet. They&apos;re added as partners close deals and guests check in.</p>
          ) : (
            <ul className="divide-y divide-line-light text-[0.8125rem]">
              {c.recent.map((r) => (
                <li key={r.referenceId} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.description}</span>
                    <span className="block truncate text-stone-deep">
                      {r.organization.name} · {COMMISSION_SERVICE_LABELS[r.service]} · {formatDay(r.createdAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium tabular-nums">{formatInr(r.total)}</span>
                    <StatusBadge tone={r.overdue ? "danger" : r.status === "paid" ? "success" : r.status === "due" ? "warning" : "neutral"}>
                      {r.overdue ? "Overdue" : r.status === "paid" ? "Paid" : r.status === "due" ? "Due" : "Waived"}
                    </StatusBadge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}
