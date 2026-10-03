import type { Metadata } from "next";
import Link from "next/link";
import { CommissionLedger, formatInr } from "@/components/workspace/CommissionLedger";
import { ActionForm, AutoSubmit, ConfirmAction, Select, Submit, TextInput } from "@/components/workspace/forms";
import { Card, EmptyState, FilterSelect, PageHeader, Pagination, StatCard, Tabs } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { COMMISSION_SERVICE_LABELS, recentMonths } from "@/lib/commission/terms";
import { formatDay } from "@/lib/format";
import { OVERDUE_DAYS, closedWithoutCommission, ledgerFilters, listLedger } from "@/lib/services/commission";
import { parsePage } from "@/lib/services/pagination";
import { COMMISSION_SERVICES } from "@/lib/vocab";
import { adjustmentAction, markPaidAction, waiveAction } from "./actions";

export const metadata: Metadata = { title: "Commissions" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CommissionsPage({ searchParams }: Props) {
  const actor = await requirePermission("commission.view", "/commissions", "platform");
  const params = await searchParams;
  const filters = ledgerFilters.parse(params);
  const [ledger, unpaidClosures] = await Promise.all([listLedger(actor, filters, parsePage(params.page)), closedWithoutCommission(actor)]);
  const manage = can(actor, "commission.manage", "platform");
  const tab = (status: string) => {
    const q = new URLSearchParams();
    if (status !== "due") q.set("status", status);
    for (const k of ["month", "service", "q"] as const) if (filters[k]) q.set(k, filters[k]!);
    return `/commissions${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Commissions"
        description="Trustbrick's commission from partners: charged when an agent closes a sale or rental, or a guest checks in to a stay. Record payments as they arrive. Partners' own rates are set on their agent, host or organization page; defaults in Platform settings."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Due" value={formatInr(ledger.totals.due)} hint={`${ledger.totals.dueCount} charge${ledger.totals.dueCount === 1 ? "" : "s"}`} emphasis />
        <StatCard label={`Overdue (over ${OVERDUE_DAYS} days)`} value={formatInr(ledger.totals.overdue)} />
        <StatCard label="Collected this month" value={formatInr(ledger.totals.paidThisMonth)} />
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
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Search charges">
          {filters.status !== "due" && <input type="hidden" name="status" value={filters.status} />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="COM-, LST- or ORG- reference, or the partner's name" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect name="service" label="Service" value={filters.service} options={COMMISSION_SERVICES.map((s) => [s, COMMISSION_SERVICE_LABELS[s]] as [string, string])} />
          </AutoSubmit>
          <AutoSubmit>
            <FilterSelect name="month" label="Month" value={filters.month} options={recentMonths()} />
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        {ledger.rows.length === 0 ? (
          <EmptyState title={filters.status === "due" ? "Nothing due" : "No charges here"}>Charges appear as partners close deals and guests check in.</EmptyState>
        ) : (
          <CommissionLedger
            rows={ledger.rows}
            showPartner
            actions={
              manage
                ? (r) =>
                    r.status === "due" ? (
                      <>
                        <ConfirmAction
                          label="Record payment"
                          title={`Record payment of ${formatInr(r.total)}?`}
                          description={`${r.description}, from ${r.organization.name}.`}
                          action={markPaidAction}
                          hidden={{ ref: r.referenceId }}
                          variant="primary"
                          confirmLabel="Mark paid"
                          reason={{ required: false, label: "Note (optional)" }}
                        >
                          <TextInput label="Payment reference" name="paymentReference" required placeholder="UTR, UPI or cheque number" hint="From the bank statement or receipt." />
                        </ConfirmAction>
                        <ConfirmAction
                          label="Waive"
                          title="Waive this charge?"
                          description="The partner no longer owes it. Use an adjustment instead to change the amount."
                          action={waiveAction}
                          hidden={{ ref: r.referenceId }}
                          reason={{ required: true, label: "Why (at least 10 characters)", placeholder: "The partner sees this." }}
                        />
                      </>
                    ) : null
                : undefined
            }
          />
        )}
        <Pagination page={ledger.page} pageSize={ledger.pageSize} total={ledger.total} params={params} basePath="/commissions" />
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div id="closed" className="scroll-mt-20">
          <Card title="Closed without a commission" description="Sales and rentals marked closed in the last 90 days as closed by someone else or taken off the market. Most are genuine; worth a look if a partner has many.">
            {unpaidClosures.length === 0 ? (
              <p className="text-[0.8125rem] text-stone-deep">None.</p>
            ) : (
              <ul className="divide-y divide-line-light text-[0.8125rem]">
                {unpaidClosures.slice(0, 20).map((c) => (
                  <li key={c.listingReferenceId} className="py-2.5">
                    <Link href={`/properties/${c.listingReferenceId}`} className="font-medium underline">
                      {c.title}
                    </Link>
                    <p className="text-stone-deep">
                      {c.organization.name} · {formatDay(c.at)}
                      {c.reason ? ` · “${c.reason}”` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {manage && (
          <Card title="Add a charge or credit" description="For a PG tenant's move-in, or to correct a charge. A negative amount is a credit. GST is added at the current rate.">
            <ActionForm action={adjustmentAction} resetOnSuccess className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput label="Partner" name="organization" required placeholder="ORG-…" className="font-mono" hint="On their organization, agent or host page." />
              <Select label="Service" name="service" required options={COMMISSION_SERVICES.map((s) => ({ value: s, label: COMMISSION_SERVICE_LABELS[s] }))} placeholder="Choose" />
              <TextInput label="Amount before GST (₹)" name="amount" required inputMode="decimal" placeholder="e.g. 1500 or -500" />
              <TextInput label="Listing (optional)" name="listing" placeholder="LST-…" className="font-mono" />
              <TextInput label="Description" name="description" required fieldClassName="sm:col-span-2" placeholder="e.g. PG move-in, 2 tenants, October" hint="The partner sees this." />
              <div className="flex justify-end sm:col-span-2">
                <Submit>Add</Submit>
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
