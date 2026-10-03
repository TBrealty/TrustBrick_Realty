import Link from "next/link";
import { formatInr } from "@/components/workspace/CommissionLedger";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, StatusBadge } from "@/components/workspace/ui";
import { describeRate, whenCharged } from "@/lib/commission/terms";
import { formatDay } from "@/lib/format";
import type { ListingCommission } from "@/lib/services/commission";

/**
 * Commission on one listing: the rate that applies, what it comes to at the listed price, and the
 * charges recorded against it. `team` is for admins, who see it about the partner, not "you".
 */
export function ListingCommissionCard({
  data,
  team = false,
  personal = false,
  editPricingHref,
}: {
  data: ListingCommission;
  team?: boolean;
  /** The partner's own organization (a host or an independent agent): "you", not "your organization". */
  personal?: boolean;
  editPricingHref?: string;
}) {
  const { rate, estimate, charges, totals } = data;
  const you = !team;
  const stay = data.service === "stay";
  const pg = data.service === "pg";
  const perUnit = stay ? "a night" : pg ? "a tenant" : null;
  const notAccepted = team
    ? "This partner hasn't accepted their current rates, so they can't submit listings."
    : `${personal ? "You haven't" : "Your organization hasn't"} accepted Trustbrick's current commission rates, so ${stay ? "stays" : "listings"} can't be submitted for approval.`;
  return (
    <Card
      title="Commission"
      actions={
        <Link href={team ? "/commissions" : "/commission"} className="text-[0.8125rem] underline">
          {team ? "All charges" : "Your commission"}
        </Link>
      }
    >
      {!data.accepted && (
        <p className="mb-4 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3 py-2 text-[0.8125rem] text-graphite">
          {notAccepted}{" "}
          {!team && (
            <Link href="/commission" className="font-medium text-ink underline">
              Review the rates
            </Link>
          )}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <div>
          <dt className="text-[0.75rem] text-stone-deep">Trustbrick&apos;s rate</dt>
          <dd className="mt-0.5 text-[0.875rem] text-ink">
            {describeRate(data.service, rate, you)}
            {rate.custom && <span className="ml-2 rounded-full bg-sage/15 px-1.5 py-0.5 text-[0.6875rem] text-sage-deep">{team ? "Partner's own rate" : "Your own rate"}</span>}
            {data.gstPercent > 0 && <span className="block text-[0.75rem] text-stone-deep">Plus {data.gstPercent}% GST</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[0.75rem] text-stone-deep">{stay ? `Per night at ${you ? "your" : "the"} price` : pg ? "Per tenant, at the lowest rent per bed" : "At the listed terms"}</dt>
          <dd className="mt-0.5 text-[0.875rem] text-ink">
            {estimate ? (
              <>
                About <strong className="font-semibold">{formatInr(estimate.total)}</strong>
                {perUnit && ` ${perUnit}`}
                {data.gstPercent > 0 && (
                  <span className="text-stone-deep">
                    {" "}
                    ({formatInr(estimate.amount)} + {formatInr(estimate.gst)} GST)
                  </span>
                )}
                <span className="block text-[0.75rem] text-stone-deep">
                  {stay
                    ? `On each booking it's ${Number(rate.percent)}% of the total, weekend nights and cleaning fee included. Each booking's page shows its own figure.`
                    : pg
                      ? "The team adds it for each tenant who moves in, from their first month's rent."
                      : `On ${estimate.on}. The final figure comes from the actual deal.`}
                </span>
              </>
            ) : (
              <span className="text-stone-deep">
                {you ? "Add your brokerage terms in Pricing to see an estimate." : "No brokerage terms on the listing to estimate from."}{" "}
                {editPricingHref && (
                  <Link href={editPricingHref} className="underline">
                    Pricing
                  </Link>
                )}
              </span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[0.75rem] text-stone-deep">When it&apos;s charged</dt>
          <dd className="mt-0.5 text-[0.875rem] text-ink">{whenCharged(data.service, you).replace(/^./, (c) => c.toUpperCase())}.</dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-line-light pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[0.8125rem] font-medium">Charges on this listing</h3>
          {charges.length > 0 && (
            <p className="text-[0.75rem] text-stone-deep">
              {formatInr(totals.charged)} charged · {formatInr(totals.paid)} paid · <span className={totals.due > 0 ? "font-medium text-ink" : ""}>{formatInr(totals.due)} due</span>
            </p>
          )}
        </div>
        {charges.length === 0 ? (
          <p className="mt-1.5 text-[0.8125rem] text-stone-deep">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line-light text-[0.8125rem]">
            {charges.map((c) => (
              <li key={c.referenceId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span>{c.description}</span>
                  <ReferenceId value={c.referenceId} copy={false} />
                  <span className="text-stone-deep">{formatDay(c.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{formatInr(c.total)}</span>
                  <StatusBadge tone={c.overdue ? "danger" : c.status === "paid" ? "success" : c.status === "due" ? "warning" : "neutral"}>
                    {c.overdue ? "Overdue" : c.status === "paid" ? "Paid" : c.status === "due" ? "Due" : "Waived"}
                  </StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
