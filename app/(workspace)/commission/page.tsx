import type { Metadata } from "next";
import { CommissionLedger, formatInr } from "@/components/workspace/CommissionLedger";
import { CommissionRates } from "@/components/workspace/CommissionRates";
import { ActionForm, AutoSubmit, Submit } from "@/components/workspace/forms";
import { Card, EmptyState, FilterSelect, PageHeader, Pagination, StatCard, StatusBadge, Tabs } from "@/components/workspace/ui";
import { purposesForRoles } from "@/lib/authz/catalog";
import { requirePermission } from "@/lib/authz/session";
import { COMMISSION_SERVICE_LABELS, recentMonths } from "@/lib/commission/terms";
import { formatDay } from "@/lib/format";
import { OVERDUE_DAYS, acceptanceFor, canAcceptTerms, getGstPercent, ledgerFilters, listLedger, ratesFor } from "@/lib/services/commission";
import { parsePage } from "@/lib/services/pagination";
import { acceptTermsAction } from "./actions";

export const metadata: Metadata = { title: "Commission" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CommissionPage({ searchParams }: Props) {
  const actor = await requirePermission("commission.view", "/commission");
  const params = await searchParams;
  const filters = ledgerFilters.parse(params);
  const orgId = actor.organization.id;
  const [rates, gstPercent, ledger] = await Promise.all([ratesFor(orgId), getGstPercent(), listLedger(actor, filters, parsePage(params.page))]);
  const acceptance = await acceptanceFor(orgId, undefined, rates);
  const mayAccept = canAcceptTerms(actor);
  const services = purposesForRoles(actor.roles);
  const tab = (status: string) => {
    const q = new URLSearchParams();
    if (status !== "due") q.set("status", status);
    if (filters.month) q.set("month", filters.month);
    return `/commission${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Commission" description={`Trustbrick's commission on the deals and stays you close through the platform. Charges are listed here as they're added; ${actor.organization.name} pays them to Trustbrick.`} />

      <Card
        title="Your rates"
        actions={
          acceptance.accepted ? (
            <StatusBadge tone="success">Accepted</StatusBadge>
          ) : (
            <StatusBadge tone="warning">{acceptance.outdated ? "Changed: accept again" : "Not accepted yet"}</StatusBadge>
          )
        }
        className="mb-6"
      >
        <CommissionRates rates={rates} services={services} gstPercent={gstPercent} />
        <div className="mt-5 border-t border-line-light pt-4">
          {acceptance.accepted ? (
            <p className="text-[0.8125rem] text-stone-deep">
              Accepted {acceptance.acceptedAt ? formatDay(acceptance.acceptedAt) : ""}
              {acceptance.acceptedBy ? ` by ${acceptance.acceptedBy}` : ""}. If Trustbrick changes a rate, you&apos;ll be asked to accept it before submitting more listings; charges already
              added keep the rate they were made at.
            </p>
          ) : mayAccept ? (
            <ActionForm action={acceptTermsAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[60ch] text-[0.8125rem] text-graphite">
                {acceptance.outdated ? "Your rates have changed since you last accepted them. " : ""}
                By accepting, {actor.organization.name} agrees to pay Trustbrick these rates on deals and stays closed through the platform. You need to accept before submitting listings
                for approval.
              </p>
              <Submit>Accept these rates</Submit>
            </ActionForm>
          ) : (
            <p className="text-[0.8125rem] text-graphite">Your organization&apos;s admin needs to accept these rates before listings can be submitted for approval.</p>
          )}
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Due now" value={formatInr(ledger.totals.due)} hint={`${ledger.totals.dueCount} charge${ledger.totals.dueCount === 1 ? "" : "s"}`} emphasis />
        <StatCard label={`Overdue (over ${OVERDUE_DAYS} days)`} value={formatInr(ledger.totals.overdue)} />
        <StatCard label="Paid this month" value={formatInr(ledger.totals.paidThisMonth)} />
      </div>

      <Tabs
        label="Charge status"
        items={[
          { href: tab("due"), label: "Due", count: ledger.totals.dueCount || undefined, active: filters.status === "due" },
          { href: tab("paid"), label: "Paid", active: filters.status === "paid" },
          { href: tab("waived"), label: "Waived", active: filters.status === "waived" },
          { href: tab("all"), label: "All", active: filters.status === "all" },
        ]}
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4 print:hidden" aria-label="Filter charges">
          {filters.status !== "due" && <input type="hidden" name="status" value={filters.status} />}
          <AutoSubmit>
            <FilterSelect name="month" label="Month" value={filters.month} options={recentMonths()} />
          </AutoSubmit>
          <AutoSubmit>
            <FilterSelect name="service" label="Service" value={filters.service} options={services.map((s) => [s, COMMISSION_SERVICE_LABELS[s]] as [string, string])} />
          </AutoSubmit>
          <noscript>
            <button type="submit" className="wbtn wbtn-secondary">
              Filter
            </button>
          </noscript>
        </form>
        {ledger.rows.length === 0 ? (
          <EmptyState title={filters.status === "due" ? "Nothing due" : "No charges here"}>
            {services.length === 1 && services[0] === "stay"
              ? "A charge appears here when a guest checks in to one of your stays."
              : "Charges appear here when you mark a sale or rental closed by you, or a guest checks in to one of your stays."}
          </EmptyState>
        ) : (
          <CommissionLedger rows={ledger.rows} />
        )}
        <Pagination page={ledger.page} pageSize={ledger.pageSize} total={ledger.total} params={params} basePath="/commission" />
      </Card>
      <p className="mt-4 text-[0.75rem] text-stone-deep">
        Pay Trustbrick as the team asks, quoting each charge&apos;s COM- reference; they mark it paid here. Disagree with a charge? Write to the team from Contact us with its reference.
      </p>
    </>
  );
}
