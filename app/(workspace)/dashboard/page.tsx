import type { Metadata } from "next";
import Link from "next/link";
import { BarList, TrendChart } from "@/components/workspace/charts";
import { CommissionSummary } from "@/components/workspace/CommissionSummary";
import { PlatformCommission } from "@/components/workspace/PlatformCommission";
import { RangeFilter } from "@/components/workspace/RangeFilter";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, PageHeader, SampleNotice, StatCard, Status, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { requirePermission } from "@/lib/authz/session";
import { STATUS_LABELS, type ListingStatus } from "@/lib/listings/lifecycle";
import { resolveRange } from "@/lib/range";
import { recentStaffActivity } from "@/lib/services/audit-log";
import { LEAD_STATUS_LABELS } from "@/lib/services/crm";
import { platformDashboard, professionalDashboard } from "@/lib/services/dashboard";
import { formatDay, formatPrice } from "@/lib/format";
import { type BookingRow, hostDashboard, hostingStats, platformStaysStats } from "@/lib/services/stays/bookings";
import { BOOKING_STATUS_TONES, nightsLabel } from "@/lib/stays/labels";
import { StatusBadge } from "@/components/workspace/ui";

export const metadata: Metadata = { title: "Dashboard" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DashboardPage({ searchParams }: Props) {
  const actor = await requirePermission("dashboard.view", "/dashboard");
  const params = await searchParams;
  const range = resolveRange({ range: params.range, from: params.from, to: params.to });
  if (actor.workspace === "platform") return <PlatformView actor={actor} range={range} excludeSample={params.sample === "exclude"} />;
  // Hosts don't work leads or visits; their dashboard is about stays and bookings.
  if (!can(actor, "leads.view") && can(actor, "bookings.view")) return <HostView actor={actor} />;
  return <ProfessionalView actor={actor} range={range} />;
}

function BookingList({ rows, empty, when }: { rows: BookingRow[]; empty: string; when: "expires" | "dates" }) {
  if (rows.length === 0) return <p className="px-5 py-4 text-[0.8125rem] text-stone-deep">{empty}</p>;
  return (
    <ul className="divide-y divide-line-light">
      {rows.map((b) => (
        <li key={b.referenceId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-[0.8125rem]">
          <div className="min-w-0">
            <Link href={`/bookings/${b.referenceId}`} className="font-medium text-ink hover:underline">
              {b.guestName}
            </Link>
            <span className="text-stone-deep">
              {" "}
              · {formatDay(b.checkIn)} – {formatDay(b.checkOut)} · {nightsLabel(b.nights)}
            </span>
            <p className="truncate text-[0.75rem] text-stone-deep">{b.listing.title}</p>
          </div>
          <div className="flex items-center gap-2">
            {when === "expires" && b.expiresAt ? (
              <span className="text-[0.75rem] text-amber">
                Answer <When at={b.expiresAt} />
              </span>
            ) : (
              <StatusBadge tone={BOOKING_STATUS_TONES[b.status]}>{b.statusLabel}</StatusBadge>
            )}
            <span className="tabular-nums">{formatPrice(b.total, { compact: false })}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

async function HostView({ actor }: { actor: Actor }) {
  const d = await hostDashboard(actor);
  const attention = d.stays.filter((s) => s.status === "changes_requested" || s.status === "rejected");
  return (
    <>
      <PageHeader
        title={`Welcome back, ${actor.name.split(" ")[0]}`}
        description="Your stays, requests waiting for an answer, and who's arriving."
        actions={
          can(actor, "listings.create") ? (
            <Link href="/properties/new" className="wbtn wbtn-primary">
              + List a home
            </Link>
          ) : undefined
        }
      />
      {attention.length > 0 && (
        <Card title="Needs your attention" className="mb-6" padded={false}>
          <ul className="divide-y divide-line-light">
            {attention.map((l) => (
              <li key={l.referenceId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[0.8125rem]">
                <Status value={l.status} label={STATUS_LABELS[l.status as ListingStatus]} />
                <Link href={`/properties/${l.referenceId}`} className="font-medium text-ink hover:underline">
                  {l.title}
                </Link>
                {l.statusReason && <p className="basis-full text-stone-deep">“{l.statusReason}”</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requests waiting" value={d.stats.requests} href="/bookings?group=requests" emphasis hint="Answer within 24 hours" />
        <StatCard label="Upcoming stays" value={d.stats.upcoming} href="/bookings" hint={`${d.stats.arrivalsThisWeek} arriving this week`} />
        <StatCard label="Nights booked, next 30 days" value={d.stats.nightsBookedNext30} href="/calendar" hint={`Across ${plural(d.stats.stays, "live stay", "live stays")}`} />
        <StatCard label="Booked this month" value={formatPrice(d.stats.bookedValueThisMonth, { compact: false })} hint="Paid to you at the property" />
      </div>

      <CommissionSummary actor={actor} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Requests" padded={false} actions={<Link href="/bookings?group=requests" className="text-[0.8125rem] underline">All requests</Link>}>
          <BookingList rows={d.requests} empty="No requests waiting." when="expires" />
        </Card>
        <Card title="Arriving soon" padded={false} actions={<Link href="/bookings" className="text-[0.8125rem] underline">All bookings</Link>}>
          <BookingList rows={d.arrivals} empty="No upcoming stays yet." when="dates" />
        </Card>
      </div>
      <Card title="Your stays" className="mt-6" padded={false}>
        {d.stays.length === 0 ? (
          <p className="px-5 py-4 text-[0.8125rem] text-stone-deep">
            You haven&apos;t listed a home yet.{" "}
            <Link href="/properties/new" className="underline">
              List your first home
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-line-light">
            {d.stays.map((s) => (
              <li key={s.referenceId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[0.8125rem]">
                <Link href={`/properties/${s.referenceId}`} className="min-w-0 truncate font-medium hover:underline">
                  {s.title}
                </Link>
                <div className="flex items-center gap-3">
                  {s.price > 0 && <span className="tabular-nums text-stone-deep">{formatPrice(s.price, { compact: false })}/night</span>}
                  <Status value={s.status} label={STATUS_LABELS[s.status as ListingStatus]} />
                  <Link href={`/calendar?stay=${s.referenceId}`} className="wbtn wbtn-secondary wbtn-sm">
                    Calendar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

const PURPOSE: Record<string, string> = { sale: "For sale", rent: "For rent", lease: "For lease", pg: "PG / co-living", stay: "Home Stay" };
const CATEGORY: Record<string, string> = { residential: "Residential", commercial: "Commercial", land: "Land", co_living: "PG & co-living" };

async function PlatformView({ actor, range, excludeSample }: { actor: Actor; range: ReturnType<typeof resolveRange>; excludeSample: boolean }) {
  const canAnalytics = can(actor, "analytics.view", "platform");
  const [d, activity, stays] = await Promise.all([
    platformDashboard(actor, range, { excludeSample }),
    can(actor, "audit.view", "platform") && actor.staff?.level === "superadmin" ? recentStaffActivity(actor) : Promise.resolve(null),
    can(actor, "bookings.view", "platform") ? platformStaysStats(actor) : Promise.resolve(null),
  ]);
  const t = d.totals;
  const p = range.previous.label;
  const hasSample = d.sample.listings + d.sample.organizations + d.sample.properties > 0;

  return (
    <>
      <PageHeader
        title={actor.staff?.level === "superadmin" ? "Platform overview" : "Operations overview"}
        description={`Everything on Trustbrick, counted live from the database. "New" figures are for ${range.label.toLowerCase()}; totals are as of now.`}
      />
      <RangeFilter
        value={range.key}
        from={range.fromDate}
        to={range.toDate}
        extra={
          <label className="flex h-9 items-center gap-2 text-[0.8125rem] text-graphite">
            <input type="checkbox" name="sample" value="exclude" defaultChecked={excludeSample} className="size-4 accent-ink" />
            Exclude sample data
          </label>
        }
      />
      {hasSample && !excludeSample && (
        <SampleNotice>
          These figures include development sample data: {d.sample.listings} listings, {d.sample.properties} properties and {d.sample.organizations} organizations. Tick “Exclude sample data” to hide them.
        </SampleNotice>
      )}

      <section aria-labelledby="attention" className="mb-8">
        <h2 id="attention" className="mb-3 text-[0.9375rem] font-semibold">
          Waiting for a decision
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Listings pending review" value={t.openCases.listing} href="/approvals" emphasis hint={`${t.pendingListings} submitted or in review`} />
          <StatCard label="Agent applications" value={t.openCases.agent} href="/approvals?type=agent_application" emphasis hint={plural(t.pendingAgents, "agent", "agents") + " pending"} />
          <StatCard label="Organizations to verify" value={t.openCases.organization} href="/approvals?type=organization_verification" emphasis hint={`${t.pendingOrganizations} pending`} />
          <StatCard label="Open reports" value={t.openReports} href="/reports" emphasis hint={plural(t.reportedListings, "listing", "listings") + " reported"} />
        </div>
      </section>

      <PlatformCommission actor={actor} />

      <section aria-labelledby="totals" className="mb-8">
        <h2 id="totals" className="mb-3 text-[0.9375rem] font-semibold">
          Platform totals
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Users" value={t.users} change={{ ...d.period.users, periodLabel: p }} hint={`${t.activeUsers.toLocaleString("en-IN")} active in 30 days · ${t.suspendedUsers} suspended`} />
          <StatCard label="Agents" value={t.agents} change={{ ...d.period.agents, periodLabel: p }} hint={`${t.activeAgents} active · ${t.pendingAgents} pending · ${t.suspendedAgents} suspended`} />
          <StatCard
            label="Organizations"
            value={t.organizations}
            change={{ ...d.period.organizations, periodLabel: p }}
            hint={`${t.activeOrganizations} active · ${t.pendingOrganizations} pending · ${t.suspendedOrganizations} suspended`}
          />
          <StatCard label="Properties" value={t.properties} change={{ ...d.period.properties, periodLabel: p }} hint={`${t.verifiedProperties} verified · ${t.unverifiedProperties} unverified`} />
          <StatCard label="Listings" value={t.listings} change={{ ...d.period.listings, periodLabel: p }} hint={`${t.liveListings} live · ${t.pendingListings} pending`} />
          <StatCard
            label="Live listings"
            value={t.liveListings}
            change={{ ...d.period.published, periodLabel: p }}
            hint={`${t.liveOnVerifiedProperties} on verified properties · ${t.liveOnUnverifiedProperties} unverified`}
          />
          <StatCard label="Leads" value={t.leads} change={{ ...d.period.leads, periodLabel: p }} hint={`${t.openLeads} open`} />
          <StatCard label="Visits" value={t.visits} change={{ ...d.period.visits, periodLabel: p }} hint={`${t.upcomingVisits} upcoming`} />
        </div>
        {stays && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Live homestays" value={stays.liveStays} href="/properties?purpose=stay" hint={`${plural(stays.hosts, "active host", "active hosts")}`} />
            <StatCard label="Host applications" value={stays.pendingHosts} href="/hosts?status=pending" hint="Waiting for an identity check" />
            <StatCard label="Booking requests" value={stays.requests} href="/bookings?group=requests" hint="Waiting for hosts" />
            <StatCard label="Upcoming stays" value={stays.upcoming} href="/bookings" hint={`${stays.bookings30d} booked in the last 30 days`} />
          </div>
        )}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="wcard px-4 py-3 text-[0.8125rem]">
            <p className="text-stone-deep">Properties added</p>
            <p className="mt-1 tabular-nums">
              <strong className="text-ink">{d.fixedPeriods.propertiesToday}</strong> today · <strong className="text-ink">{d.fixedPeriods.propertiesThisWeek}</strong> this week ·{" "}
              <strong className="text-ink">{d.fixedPeriods.propertiesThisMonth}</strong> this month
            </p>
          </div>
          <div className="wcard px-4 py-3 text-[0.8125rem]">
            <p className="text-stone-deep">New users</p>
            <p className="mt-1 tabular-nums">
              <strong className="text-ink">{d.fixedPeriods.usersToday}</strong> today · <strong className="text-ink">{d.fixedPeriods.usersThisWeek}</strong> this week ·{" "}
              <strong className="text-ink">{d.fixedPeriods.usersThisMonth}</strong> this month
            </p>
          </div>
          <div className="wcard px-4 py-3 text-[0.8125rem]">
            <p className="text-stone-deep">Not tracked yet</p>
            <p className="mt-1 text-stone-deep">Transactions and revenue appear here once those products exist.</p>
          </div>
        </div>
      </section>

      {canAnalytics && (
        <section aria-labelledby="growth" className="mb-8">
          <h2 id="growth" className="mb-3 text-[0.9375rem] font-semibold">
            Growth · {range.label}
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="New users">
              <TrendChart title="New users" points={d.series.users} unit={range.bucket} valueLabel="new users" />
            </Card>
            <Card title="New listings">
              <TrendChart title="New listings" points={d.series.listings} unit={range.bucket} valueLabel="new listings" />
            </Card>
            <Card title="New properties">
              <TrendChart title="New properties" points={d.series.properties} unit={range.bucket} valueLabel="new properties" />
            </Card>
            <Card title="New agents">
              <TrendChart title="New agents" points={d.series.agents} unit={range.bucket} valueLabel="new agents" />
            </Card>
            <Card title="New organizations">
              <TrendChart title="New organizations" points={d.series.organizations} unit={range.bucket} valueLabel="new organizations" />
            </Card>
          </div>
        </section>
      )}

      <section aria-labelledby="mix" className="mb-8">
        <h2 id="mix" className="mb-3 text-[0.9375rem] font-semibold">
          Live listings
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="By purpose">
            <BarList rows={d.breakdown.purpose.map((r) => ({ label: PURPOSE[r.key] ?? r.key, value: r.count }))} />
          </Card>
          <Card title="By category">
            <BarList rows={d.breakdown.category.map((r) => ({ label: CATEGORY[r.key] ?? r.key, value: r.count }))} />
          </Card>
          <Card title="For sale: new development or resale">
            <BarList
              rows={[
                { label: "New development", value: d.breakdown.development.newDevelopment },
                { label: "Resale / ready", value: d.breakdown.development.resale },
              ]}
            />
          </Card>
          <Card title="By state">
            <BarList rows={d.breakdown.states.map((r) => ({ label: r.name, value: r.count }))} />
          </Card>
          <Card title="By city">
            <BarList rows={d.breakdown.cities.map((r) => ({ label: r.name, value: r.count }))} />
          </Card>
          <Card title="Top localities">
            <BarList rows={d.breakdown.localities.map((r) => ({ label: r.name, sublabel: r.city ?? undefined, value: r.count }))} />
          </Card>
        </div>
      </section>

      <section aria-labelledby="agents" className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Agent activity" description={range.label} className="lg:col-span-2" padded={false}>
          <DataTable
            caption="Agents with the most activity in the selected range"
            rows={d.agentActivity.mostActive}
            rowKey={(r) => r.referenceId}
            empty={<p className="p-5 text-[0.8125rem] text-stone-deep">No agent activity in this range.</p>}
            columns={[
              { header: "Agent", cell: (r) => <div>{r.name}<div><ReferenceId value={r.referenceId} href={can(actor, "agents.view", "platform") ? `/agents/${r.referenceId}` : undefined} copy={false} /></div></div> },
              { header: "Listings created", cell: (r) => r.listingsCreated, align: "right" },
              { header: "Leads received", cell: (r) => r.leads, align: "right" },
              { header: "Visits", cell: (r) => r.visits, align: "right" },
            ]}
          />
          <p className="border-t border-line-light px-5 py-2.5 text-[0.75rem] text-stone-deep">Ordered by total activity, not by quality: it is a workload view, not a ranking.</p>
        </Card>
        <Card title="Leads and visits" description={range.label}>
          <dl className="space-y-3 text-[0.875rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-stone-deep">New leads</dt>
              <dd className="font-semibold tabular-nums">{d.agentActivity.leadsInPeriod}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-deep">Of those, converted</dt>
              <dd className="font-semibold tabular-nums">
                {d.agentActivity.convertedInPeriod}
                {d.agentActivity.leadsInPeriod > 0 && <span className="ml-1 font-normal text-stone-deep">({Math.round((d.agentActivity.convertedInPeriod / d.agentActivity.leadsInPeriod) * 100)}%)</span>}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-deep">Visits scheduled</dt>
              <dd className="font-semibold tabular-nums">{d.agentActivity.visitsScheduledInPeriod}</dd>
            </div>
          </dl>
        </Card>
      </section>

      {d.staff && (
        <section aria-labelledby="staff" className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="Administrators" actions={<Link href="/admins" className="wbtn wbtn-secondary wbtn-sm">Manage</Link>}>
            <dl className="space-y-3 text-[0.875rem]">
              <div className="flex justify-between">
                <dt className="text-stone-deep">Admins and SuperAdmins</dt>
                <dd className="font-semibold tabular-nums">{d.staff.admins}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-deep">Suspended</dt>
                <dd className="font-semibold tabular-nums">{d.staff.suspendedAdmins}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-deep">Invitations waiting</dt>
                <dd className="font-semibold tabular-nums">{d.staff.pendingInvitations}</dd>
              </div>
            </dl>
          </Card>
          {activity && (
            <Card title="Recent administrative activity" className="lg:col-span-2" actions={<Link href="/audit" className="wbtn wbtn-secondary wbtn-sm">Audit log</Link>} padded={false}>
              <DataTable
                caption="Recent actions by administrators"
                rows={activity}
                rowKey={(r) => r.id}
                empty={<p className="p-5 text-[0.8125rem] text-stone-deep">No administrative actions yet.</p>}
                columns={[
                  { header: "Event", cell: (r) => <span className="font-mono text-[0.75rem]">{r.eventType}</span> },
                  { header: "By", cell: (r) => r.actorName ?? r.actorReferenceId ?? "System" },
                  { header: "Target", cell: (r) => (r.targetReferenceId ? <ReferenceId value={r.targetReferenceId} copy={false} /> : "—"), hideBelow: "md" },
                  { header: "When", cell: (r) => <When at={r.createdAt} /> },
                ]}
              />
            </Card>
          )}
        </section>
      )}
    </>
  );
}

const LEAD_ORDER = ["new", "contacted", "qualified", "visit_scheduled", "negotiation", "converted", "lost"] as const;

async function ProfessionalView({ actor, range }: { actor: Actor; range: ReturnType<typeof resolveRange> }) {
  const [d, hosting] = await Promise.all([professionalDashboard(actor, range), hostingStats(actor)]);
  const scope = actor.permissions["listings.view"];
  const whose = scope === "org" ? "your organization's" : scope === "team" ? "your team's" : "your";
  const p = range.previous.label;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${actor.name.split(" ")[0]}`}
        description={`Figures cover ${whose} properties, leads and visits only.`}
        actions={
          can(actor, "listings.create") ? (
            <Link href="/properties/new" className="wbtn wbtn-primary">
              + Onboard property
            </Link>
          ) : undefined
        }
      />
      <RangeFilter value={range.key} from={range.fromDate} to={range.toDate} />

      {d.needsAttention.length > 0 && (
        <Card title="Needs your attention" className="mb-6" padded={false}>
          <ul className="divide-y divide-line-light">
            {d.needsAttention.map((l) => (
              <li key={l.referenceId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[0.8125rem]">
                <Status value={l.status} label={STATUS_LABELS[l.status as ListingStatus]} />
                <Link href={`/properties/${l.referenceId}`} className="font-medium text-ink hover:underline">
                  {l.title}
                </Link>
                <ReferenceId value={l.referenceId} copy={false} />
                {l.reason && <p className="basis-full text-stone-deep">“{l.reason}”</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Live listings" value={d.listings.live} href="/properties?group=active" emphasis hint={`${d.listings.total} properties in total`} />
        <StatCard label="Pending approval" value={d.listings.pending} href="/properties?group=pending" />
        <StatCard label="Drafts" value={d.listings.drafts} href="/properties?group=drafts" hint={`${d.listings.addedThisMonth} added this month`} />
        <StatCard label="Changes requested or rejected" value={d.listings.changesRequested + d.listings.rejected} href="/properties?group=drafts" />
        <StatCard label="New leads" value={d.leads.newInPeriod.current} change={{ ...d.leads.newInPeriod, periodLabel: p }} href="/leads?status=new" />
        <StatCard label="Open leads" value={d.leads.open} href="/leads?open=1" hint={`${d.leads.convertedInPeriod} converted in this range`} />
        <StatCard label="Upcoming visits" value={d.visits.upcoming} href="/visits?upcoming=1" hint={`${d.visits.requested} requests waiting · ${d.visits.completedInPeriod} completed`} />
        <StatCard label="Listing views" value={d.engagement.views.current} change={{ ...d.engagement.views, periodLabel: p }} hint={`${d.engagement.uniqueViewers} unique viewers · ${d.engagement.saves} saves`} />
      </div>

      {hosting && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Stay requests waiting" value={hosting.requests} href="/bookings?group=requests" hint="Answer within 24 hours" />
          <StatCard label="Upcoming stays" value={hosting.upcoming} href="/bookings" hint={`${hosting.arrivalsThisWeek} arriving this week`} />
          <StatCard label="Nights booked, next 30 days" value={hosting.nightsBookedNext30} href="/calendar" hint={plural(hosting.stays, "live stay", "live stays")} />
          <StatCard label="Stays booked this month" value={formatPrice(hosting.bookedValueThisMonth, { compact: false })} hint="Paid to the host at the property" />
        </div>
      )}

      <CommissionSummary actor={actor} />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Listing views" description="Counted once per visitor per day; your own visits aren't counted.">
          {d.series.views.length ? (
            <TrendChart title="Listing views per day" points={d.series.views} unit="day" valueLabel="views" />
          ) : (
            <p className="text-[0.8125rem] text-stone-deep">Choose a range of at least a few days to see views by day.</p>
          )}
        </Card>
        <Card title="New leads">
          <TrendChart title="New leads" points={d.series.leads} unit={range.bucket} valueLabel="new leads" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Lead pipeline" description="All leads, by stage">
          <BarList
            rows={LEAD_ORDER.map((s) => ({ label: LEAD_STATUS_LABELS[s], value: d.leads.byStatus.find((b) => b.status === s)?.count ?? 0 }))}
          />
        </Card>
        <Card title="Top live listings" description={range.label} padded={false}>
          <DataTable
            caption="Live listings with the most views"
            rows={d.topListings}
            rowKey={(r) => r.referenceId}
            empty={<p className="p-5 text-[0.8125rem] text-stone-deep">No live listings yet.</p>}
            columns={[
              { header: "Listing", cell: (r) => <Link href={`/properties/${r.referenceId}`} className="hover:underline">{r.title}</Link> },
              { header: "Views", cell: (r) => r.views, align: "right" },
              { header: "Leads", cell: (r) => r.leads, align: "right" },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
