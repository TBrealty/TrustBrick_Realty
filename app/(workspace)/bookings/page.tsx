import type { Metadata } from "next";
import Link from "next/link";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, PageHeader, Pagination, StatusBadge, Tabs, When } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { formatDay, formatPrice } from "@/lib/format";
import { parsePage } from "@/lib/services/pagination";
import { type BookingCommission, commissionForBookings } from "@/lib/services/commission";
import { type BookingGroup, bookingFilters, listBookingsForActor } from "@/lib/services/stays/bookings";
import { BOOKING_STATUS_TONES, nightsLabel } from "@/lib/stays/labels";

export const metadata: Metadata = { title: "Bookings" };

const GROUP_LABELS: Record<BookingGroup, string> = { upcoming: "Upcoming", requests: "Requests", past: "Past", cancelled: "Cancelled & declined", all: "All" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BookingsPage({ searchParams }: Props) {
  const actor = await requirePermission("bookings.view", "/bookings");
  const params = await searchParams;
  const filters = bookingFilters.parse(params);
  const result = await listBookingsForActor(actor, filters, parsePage(params.page));
  const commission = await commissionForBookings(actor, result.rows.map((r) => r.id));
  const platform = actor.permissions["bookings.view"] === "platform";
  const tab = (g: BookingGroup) => {
    const qs = new URLSearchParams();
    if (g !== "upcoming") qs.set("group", g);
    if (filters.q) qs.set("q", filters.q);
    return `/bookings${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Bookings"
        description={platform ? "Every homestay booking on Trustbrick. Guests pay hosts at the property." : "Requests and stays at your homes. Answer requests within 24 hours, or they expire."}
      />
      <Tabs
        label="Booking groups"
        items={(Object.keys(GROUP_LABELS) as BookingGroup[]).map((g) => ({ href: tab(g), label: GROUP_LABELS[g], count: result.counts[g], active: filters.group === g }))}
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Search bookings">
          {filters.group !== "upcoming" && <input type="hidden" name="group" value={filters.group} />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="BKG- or LST- reference, guest name or email, stay" className="winput" />
          </div>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="Bookings"
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={
            <EmptyState title={filters.group === "requests" ? "No requests waiting" : "No bookings here"}>
              {filters.group === "upcoming" ? "Confirmed stays appear here. Make sure your stays are live and your calendar is open." : undefined}
            </EmptyState>
          }
          columns={[
            {
              header: "Guest",
              cell: (r) => (
                <div className="min-w-40">
                  <Link href={`/bookings/${r.referenceId}`} className="font-medium hover:underline">
                    {r.guestName}
                  </Link>
                  <div>
                    <ReferenceId value={r.referenceId} copy={false} />
                  </div>
                </div>
              ),
            },
            {
              header: "Dates",
              cell: (r) => (
                <div className="text-[0.8125rem]">
                  {/* On each line: a global rule resets white-space on paragraphs. */}
                  <p className="whitespace-nowrap">
                    {formatDay(r.checkIn)} – {formatDay(r.checkOut)}
                  </p>
                  <p className="whitespace-nowrap text-stone-deep">
                    {nightsLabel(r.nights)} · {r.adults + r.children} guest{r.adults + r.children === 1 ? "" : "s"}
                  </p>
                </div>
              ),
            },
            { header: "Stay", cell: (r) => <span className="line-clamp-2 min-w-40 text-[0.8125rem]">{r.listing.title}</span>, hideBelow: "md" },
            ...(platform ? [{ header: "Host", cell: (r: (typeof result.rows)[number]) => r.hostName, hideBelow: "lg" as const }] : []),
            { header: "Total", cell: (r) => formatPrice(r.total, { compact: false }), align: "right", hideBelow: "sm" },
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
                <div>
                  <StatusBadge tone={BOOKING_STATUS_TONES[r.status]}>{r.statusLabel}</StatusBadge>
                  {r.status === "requested" && r.expiresAt && (
                    <p className="mt-1 text-[0.6875rem] text-stone-deep">
                      Expires <When at={r.expiresAt} />
                    </p>
                  )}
                </div>
              ),
            },
            // Wide screens only: the commission column comes first.
            { header: "Booked", cell: (r) => <When at={r.createdAt} />, hideBelow: commission.size > 0 ? "2xl" : "xl" },
            {
              header: "Action",
              align: "right",
              cell: (r) => (
                <Link href={`/bookings/${r.referenceId}`} className="wbtn wbtn-secondary wbtn-sm">
                  {r.status === "requested" && !platform ? "Respond" : "View"}
                </Link>
              ),
            },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/bookings" />
      </Card>
    </>
  );
}

/** A booking's commission in the list: the charge and its status, an estimate before check-in, or a dash. */
function CommissionCell({ c }: { c?: BookingCommission }) {
  if (!c || c.state === "none" || c.state === "unrecorded") return <span className="text-stone">—</span>;
  const amount = formatPrice(c.total, { compact: false });
  if (c.state === "upcoming") {
    return (
      <span className="text-stone-deep tabular-nums" title="An estimate: it's charged when the guest checks in, at the rate in force then">
        ~{amount}
        <span className="block text-[0.6875rem]">at check-in</span>
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {amount}
      <span className="mt-0.5 block">
        <StatusBadge tone={c.overdue ? "danger" : c.status === "paid" ? "success" : c.status === "due" ? "warning" : "neutral"}>
          {c.overdue ? "Overdue" : c.status === "paid" ? "Paid" : c.status === "due" ? "Due" : "Waived"}
        </StatusBadge>
      </span>
    </span>
  );
}
