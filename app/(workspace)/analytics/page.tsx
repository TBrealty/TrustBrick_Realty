import type { Metadata } from "next";
import Link from "next/link";
import { BarList, TrendChart } from "@/components/workspace/charts";
import { RangeFilter } from "@/components/workspace/RangeFilter";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, PageHeader, Status } from "@/components/workspace/ui";
import type { Actor } from "@/lib/authz/actor";
import { requirePermission } from "@/lib/authz/session";
import { STATUS_LABELS } from "@/lib/listings/lifecycle";
import { type DateRange, resolveRange } from "@/lib/range";
import { listingPerformance, platformDashboard, professionalDashboard } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Analytics" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AnalyticsPage({ searchParams }: Props) {
  const actor = await requirePermission("analytics.view", "/analytics");
  const params = await searchParams;
  const range = resolveRange({ range: params.range, from: params.from, to: params.to });
  return actor.workspace === "platform" ? <Platform actor={actor} range={range} excludeSample={params.sample === "exclude"} /> : <Professional actor={actor} range={range} />;
}

const LABEL: Record<string, string> = { sale: "For sale", rent: "For rent", lease: "For lease", pg: "PG / co-living", residential: "Residential", commercial: "Commercial", land: "Land", co_living: "PG & co-living" };

async function Platform({ actor, range, excludeSample }: { actor: Actor; range: DateRange; excludeSample: boolean }) {
  const d = await platformDashboard(actor, range, { excludeSample });
  const sumOf = (s: { count: number }[]) => s.reduce((a, b) => a + b.count, 0);
  return (
    <>
      <PageHeader title="Platform analytics" description="Growth and marketplace mix, straight from the database. Counts of new records are for the selected range." />
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
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(
          [
            ["users", "New users"],
            ["agents", "New agents"],
            ["organizations", "New organizations"],
            ["properties", "New properties"],
            ["listings", "New listings"],
          ] as const
        ).map(([key, title]) => (
          <Card key={key} title={title} description={`${sumOf(d.series[key]).toLocaleString("en-IN")} in ${range.label.toLowerCase()}`}>
            <TrendChart title={title} points={d.series[key]} unit={range.bucket} valueLabel={title.toLowerCase()} />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Live listings by purpose">
          <BarList rows={d.breakdown.purpose.map((r) => ({ label: LABEL[r.key] ?? r.key, value: r.count }))} />
        </Card>
        <Card title="Live listings by category">
          <BarList rows={d.breakdown.category.map((r) => ({ label: LABEL[r.key] ?? r.key, value: r.count }))} />
        </Card>
        <Card title="Sale listings: new development or resale">
          <BarList rows={[{ label: "New development", value: d.breakdown.development.newDevelopment }, { label: "Resale / ready", value: d.breakdown.development.resale }]} />
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
      <p className="mt-6 text-[0.75rem] text-stone-deep">Map-based analytics arrive with the map search. Property locations are already stored as PostGIS points, so no data needs to change.</p>
    </>
  );
}

async function Professional({ actor, range }: { actor: Actor; range: DateRange }) {
  const [d, rows] = await Promise.all([professionalDashboard(actor, range), listingPerformance(actor, range)]);
  return (
    <>
      <PageHeader title="Performance" description="How your live and recently live listings are doing. Views are counted once per visitor per day; your own visits aren't counted. Sharing isn't tracked yet." />
      <RangeFilter value={range.key} from={range.fromDate} to={range.toDate} />
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Views">{d.series.views.length ? <TrendChart title="Views per day" points={d.series.views} unit="day" valueLabel="views" /> : <p className="text-[0.8125rem] text-stone-deep">Choose a range of a few days or more.</p>}</Card>
        <Card title="Leads">
          <TrendChart title="New leads" points={d.series.leads} unit={range.bucket} valueLabel="leads" />
        </Card>
      </div>
      <Card title="By listing" description={range.label} padded={false}>
        <DataTable
          caption="Listing performance"
          rows={rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title="No live listings yet" />}
          columns={[
            {
              header: "Listing",
              cell: (r) => (
                <div>
                  <Link href={`/properties/${r.referenceId}`} className="font-medium hover:underline">
                    {r.title}
                  </Link>
                  <div>
                    <ReferenceId value={r.referenceId} copy={false} />
                  </div>
                </div>
              ),
            },
            { header: "Status", cell: (r) => <Status value={r.status} label={STATUS_LABELS[r.status as keyof typeof STATUS_LABELS]} />, hideBelow: "sm" },
            { header: "Views", cell: (r) => r.views.toLocaleString("en-IN"), align: "right" },
            { header: "Unique viewers", cell: (r) => r.uniqueViewers.toLocaleString("en-IN"), align: "right", hideBelow: "md" },
            { header: "Leads", cell: (r) => r.leads, align: "right" },
            { header: "Visits", cell: (r) => r.visits, align: "right", hideBelow: "md" },
            { header: "Saved", cell: (r) => r.saves, align: "right", hideBelow: "lg" },
            { header: "Enquiry rate", cell: (r) => (r.uniqueViewers ? `${((r.leads / r.uniqueViewers) * 100).toFixed(1)}%` : "—"), align: "right", hideBelow: "lg" },
          ]}
        />
      </Card>
    </>
  );
}
