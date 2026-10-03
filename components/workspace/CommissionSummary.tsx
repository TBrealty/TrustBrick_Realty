import Link from "next/link";
import { formatInr } from "@/components/workspace/CommissionLedger";
import { Card, StatCard, StatusBadge } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { COMMISSION_SERVICE_LABELS } from "@/lib/commission/terms";
import { formatDay } from "@/lib/format";
import { OVERDUE_DAYS, acceptanceFor, canAcceptTerms, listLedger } from "@/lib/services/commission";

/**
 * Commission on a partner's dashboard: what's owed and the latest charges, and, first of all,
 * a warning when the rates aren't accepted, since that stops listings being submitted.
 */
export async function CommissionSummary({ actor }: { actor: Actor }) {
  if (actor.workspace !== "professional" || !can(actor, "commission.view")) return null;
  const [acceptance, ledger] = await Promise.all([acceptanceFor(actor.organization.id), listLedger(actor, { status: "all" }, 1)]);
  const { totals } = ledger;
  const recent = ledger.rows.slice(0, 4);
  // Hosts only have stays; a sole trader's organization is themselves; a broker admin sees the brokerage.
  const staysOnly = !can(actor, "leads.view");
  const what = staysOnly ? "stays" : "closed deals and stays";
  const description =
    actor.organization.orgType === "personal"
      ? `Trustbrick's commission on your ${what}.`
      : actor.permissions["commission.view"] === "org"
        ? `Trustbrick's commission on ${actor.organization.name}'s ${what}.`
        : `Trustbrick's commission on the ${what} you closed.`;

  return (
    <section aria-labelledby="commission-summary" className="mb-6">
      {!acceptance.accepted && (
        <div role="status" className="mb-3 flex flex-col gap-3 rounded-[3px] border-l-2 border-amber bg-amber/10 px-4 py-3 text-[0.8125rem] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-graphite">
            <strong className="font-medium text-ink">{acceptance.outdated ? "Your commission rates have changed." : "Commission rates not accepted yet."}</strong>{" "}
            {canAcceptTerms(actor) ? "Accept them to submit listings for approval." : "Your organization's admin needs to accept them before listings can be submitted."}
          </p>
          <Link href="/commission" className="wbtn wbtn-primary wbtn-sm shrink-0">
            {canAcceptTerms(actor) ? "Review and accept" : "See the rates"}
          </Link>
        </div>
      )}
      <Card
        title={<span id="commission-summary">Commission</span>}
        description={description}
        actions={
          <Link href="/commission" className="text-[0.8125rem] underline">
            All charges
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Due now" value={formatInr(totals.due)} href="/commission" emphasis hint={`${totals.dueCount} charge${totals.dueCount === 1 ? "" : "s"}`} />
          <StatCard label="Overdue" value={formatInr(totals.overdue)} href="/commission" hint={`Due over ${OVERDUE_DAYS} days`} />
          <StatCard label="Charged this month" value={formatInr(totals.chargedThisMonth)} href="/commission?status=all" />
          <StatCard label="Paid this month" value={formatInr(totals.paidThisMonth)} href="/commission?status=paid" />
        </div>
        {recent.length > 0 ? (
          <ul className="mt-4 divide-y divide-line-light border-t border-line-light text-[0.8125rem]">
            {recent.map((r) => (
              <li key={r.referenceId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0">
                  <span className="font-medium">{r.description}</span>
                  <span className="text-stone-deep">
                    {" "}
                    · {COMMISSION_SERVICE_LABELS[r.service]} · {formatDay(r.createdAt)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{formatInr(r.total)}</span>
                  <StatusBadge tone={r.overdue ? "danger" : r.status === "paid" ? "success" : r.status === "due" ? "warning" : "neutral"}>
                    {r.overdue ? "Overdue" : r.status === "paid" ? "Paid" : r.status === "due" ? "Due" : "Waived"}
                  </StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-t border-line-light pt-3 text-[0.8125rem] text-stone-deep">
            No charges yet. {staysOnly ? "One is added when a guest checks in to one of your stays." : "They're added when you mark a sale or rental closed by you, or a guest checks in to a stay."}
          </p>
        )}
      </Card>
    </section>
  );
}
