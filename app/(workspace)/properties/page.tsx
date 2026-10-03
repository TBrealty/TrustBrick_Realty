import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AutoSubmit } from "@/components/workspace/forms";
import { ViewListing } from "@/components/workspace/ListingCardDialog";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, FilterSelect, PageHeader, Pagination, StatusBadge, Status, Tabs, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { formatListingPrice, formatPrice } from "@/lib/format";
import { STATUS_LABELS, STATUS_TONES, isEditable, type StatusGroup } from "@/lib/listings/lifecycle";
import { CATEGORY_LABELS, PURPOSE_LABELS } from "@/lib/listings/onboarding-schema";
import { parsePage } from "@/lib/services/pagination";
import { shortRate } from "@/lib/commission/terms";
import { type ListingCommissionSummary, commissionForListings } from "@/lib/services/commission";
import { listListingsForActor, listingGroupCounts, listingTableFilters } from "@/lib/services/listings/queries";

export const metadata: Metadata = { title: "Properties" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const GROUP_LABELS: Record<StatusGroup, string> = {
  all: "All",
  active: "Live",
  pending: "Pending",
  drafts: "Drafts & changes",
  rejected: "Rejected",
  archived: "Archived & off-market",
};

export default async function PropertiesPage({ searchParams }: Props) {
  const actor = await requirePermission("listings.view", "/properties");
  const params = await searchParams;
  const filters = listingTableFilters.parse(params);
  const page = parsePage(params.page);
  const [result, counts] = await Promise.all([listListingsForActor(actor, filters, page), listingGroupCounts(actor)]);
  const commission = await commissionForListings(actor, result.rows.map((r) => r.id));

  const scope = actor.permissions["listings.view"];
  const platform = scope === "platform";
  const title = platform ? "Properties & listings" : scope === "org" ? "Organization properties" : scope === "team" ? "Team properties" : "My properties";
  const showAgent = scope !== "own";
  const canEdit = can(actor, "listings.edit");

  const tabHref = (group: StatusGroup) => {
    const q = new URLSearchParams();
    if (group !== "all") q.set("group", group);
    for (const k of ["purpose", "category", "verification", "q", "sort"] as const) if (filters[k]) q.set(k, String(filters[k]));
    const s = q.toString();
    return s ? `/properties?${s}` : "/properties";
  };

  return (
    <>
      <PageHeader
        title={title}
        description={
          platform
            ? "Every property and listing on Trustbrick. A property can have several listings over time; each row is one listing."
            : "Every property you've onboarded, whatever its state. Only live listings are visible to customers."
        }
        actions={
          can(actor, "listings.create") ? (
            <Link href="/properties/new" className="wbtn wbtn-primary">
              + Onboard property
            </Link>
          ) : undefined
        }
      />
      <Tabs
        label="Listing status"
        items={(Object.keys(GROUP_LABELS) as StatusGroup[]).map((g) => ({ href: tabHref(g), label: GROUP_LABELS[g], count: counts[g], active: filters.group === g && !filters.status }))}
      />

      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Filter properties">
          {filters.group !== "all" && <input type="hidden" name="group" value={filters.group} />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="LST- or PRP- reference, title or locality" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect name="purpose" label="Purpose" value={filters.purpose} options={Object.entries(PURPOSE_LABELS)} />
            <FilterSelect name="category" label="Category" value={filters.category} options={Object.entries(CATEGORY_LABELS)} />
            {platform && (
              <FilterSelect
                name="verification"
                label="Property verification"
                value={filters.verification}
                options={[
                  ["verified", "Verified"],
                  ["unverified", "Unverified"],
                  ["pending", "Pending"],
                  ["rejected", "Rejected"],
                ]}
              />
            )}
            <FilterSelect
              name="sort"
              label="Sort"
              value={filters.sort}
              any={false}
              options={[
                ["updated", "Recently updated"],
                ["created", "Newest first"],
                ["price_desc", "Price: high to low"],
                ["price_asc", "Price: low to high"],
              ]}
            />
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
          {(filters.q || filters.purpose || filters.category || filters.verification) && (
            <Link href={tabHref(filters.group)} className="wbtn wbtn-ghost">
              Clear
            </Link>
          )}
        </form>

        <DataTable
          caption={title}
          rows={result.rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              title={filters.q || filters.purpose || filters.category ? "No listings match those filters" : "Nothing here yet"}
              action={
                can(actor, "listings.create") && result.total === 0 && !filters.q ? (
                  <Link href="/properties/new" className="wbtn wbtn-primary">
                    Onboard your first property
                  </Link>
                ) : undefined
              }
            >
              {can(actor, "listings.create") ? "Onboard a property to start. It stays a private draft until you submit it for review." : undefined}
            </EmptyState>
          }
          columns={[
            {
              header: "Property",
              cell: (r) => (
                <div className="flex min-w-64 items-center gap-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-[3px] bg-sand">
                    {r.image && <Image src={r.image} alt="" fill sizes="48px" className="object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <Link href={`/properties/${r.referenceId}`} className="line-clamp-1 font-medium text-ink hover:underline">
                      {r.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <ReferenceId value={r.referenceId} copy={false} />
                      {r.isSample && <span className="rounded-[2px] bg-ink px-1 font-mono text-[0.625rem] tracking-wider text-paper uppercase">Sample</span>}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              header: "Type",
              cell: (r) => (
                <div>
                  <p>{r.typeName}</p>
                  <p className="text-[0.75rem] text-stone-deep">{PURPOSE_LABELS[r.purpose]}</p>
                </div>
              ),
              hideBelow: "md",
            },
            { header: "Location", cell: (r) => <span className="block min-w-28">{[r.locality, r.city].filter(Boolean).join(", ")}</span>, hideBelow: "lg" },
            { header: "Price", cell: (r) => <span className="whitespace-nowrap">{formatListingPrice(r.price, r.purpose)}</span>, align: "right", hideBelow: "sm" },
            ...(commission.size > 0
              ? [
                  {
                    header: "Commission",
                    align: "right" as const,
                    hideBelow: "xl" as const,
                    cell: (r: (typeof result.rows)[number]) => <CommissionCell c={commission.get(r.id)} />,
                  },
                ]
              : []),
            {
              header: "Status",
              cell: (r) => (
                <div title={r.statusReason ?? undefined}>
                  <StatusBadge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</StatusBadge>
                </div>
              ),
            },
            ...(platform ? [{ header: "Verification", cell: (r: (typeof result.rows)[number]) => <Status value={r.verification} />, hideBelow: "xl" as const }] : []),
            ...(showAgent
              ? [
                  {
                    header: platform ? "Agent · organization" : "Agent",
                    cell: (r: (typeof result.rows)[number]) => (
                      <div className="text-[0.8125rem]">
                        <p>{r.agentName ?? "—"}</p>
                        {platform && <p className="text-[0.75rem] text-stone-deep">{r.organizationName}</p>}
                      </div>
                    ),
                    hideBelow: "lg" as const,
                  },
                ]
              : []),
            // Very wide screens only when the commission column is shown; each listing's page has its views.
            { header: "Views", cell: (r) => r.views.toLocaleString("en-IN"), align: "right", hideBelow: commission.size > 0 ? "2xl" : "xl" },
            { header: "Leads", cell: (r) => r.leads, align: "right", hideBelow: "lg" },
            { header: "Updated", cell: (r) => <When at={r.updatedAt} />, hideBelow: "md" },
            {
              header: "Action",
              align: "right",
              cell: (r) => (
                <div className="flex justify-end gap-1.5">
                  <ViewListing referenceId={r.referenceId} title={r.title} />
                  {canEdit && !platform && isEditable(r.status) && (
                    <Link href={`/properties/${r.referenceId}/edit`} className="wbtn wbtn-secondary wbtn-sm" aria-label={`Edit ${r.title}`}>
                      Edit
                    </Link>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/properties" />
      </Card>
    </>
  );
}

/** A listing's commission in the list: what's been charged on it, or else the rate that will apply. */
function CommissionCell({ c }: { c?: ListingCommissionSummary }) {
  if (!c) return <span className="text-stone">—</span>;
  if (c.charges === 0) {
    return (
      <span className="inline-block max-w-[6.5rem] text-[0.75rem] leading-snug text-stone-deep" title="The rate that applies; nothing charged on this listing yet">
        {shortRate(c.service, c.rate)}
        {c.rate.custom && <span className="block text-[0.6875rem] text-sage-deep">own rate</span>}
      </span>
    );
  }
  const paid = c.due === 0;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatPrice(c.charged, { compact: false })}
      <span className="mt-0.5 block">
        <StatusBadge tone={c.overdue ? "danger" : paid ? "success" : "warning"}>{c.overdue ? "Overdue" : paid ? "Paid" : `${formatPrice(c.due, { compact: false })} due`}</StatusBadge>
      </span>
    </span>
  );
}
