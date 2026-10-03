import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction, Select } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, PageHeader, Pagination, Status, Tabs, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { STATUS_LABELS } from "@/lib/listings/lifecycle";
import { parsePage } from "@/lib/services/pagination";
import { REPORT_REASON_LABELS, listReports, reportFilters } from "@/lib/services/reports";
import { resolveReportAction } from "./actions";

export const metadata: Metadata = { title: "Reports" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportsPage({ searchParams }: Props) {
  const actor = await requirePermission("reports.view", "/reports", "platform");
  const params = await searchParams;
  const filters = reportFilters.parse(params);
  const result = await listReports(actor, filters, parsePage(params.page));
  const canResolve = can(actor, "reports.manage", "platform");

  return (
    <>
      <PageHeader
        title="Reports"
        description="Customers flagging listings. Resolving a report records what was done; to take a listing down, open it and unpublish or remove it (each is audited)."
      />
      <Tabs
        label="Report status"
        items={(["open", "actioned", "dismissed"] as const).map((s) => ({ href: `/reports?status=${s}`, label: s === "open" ? "Open" : s === "actioned" ? "Actioned" : "Dismissed", active: filters.status === s }))}
      />
      <Card padded={false}>
        <DataTable
          caption="Listing reports"
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title={filters.status === "open" ? "No open reports" : "Nothing here"} />}
          columns={[
            {
              header: "Report",
              cell: (r) => (
                <div className="min-w-52">
                  <p className="font-medium">{REPORT_REASON_LABELS[r.reason as keyof typeof REPORT_REASON_LABELS]}</p>
                  {r.details && <p className="text-[0.8125rem] text-graphite">“{r.details}”</p>}
                  <ReferenceId value={r.referenceId} copy={false} />
                </div>
              ),
            },
            {
              header: "Listing",
              cell: (r) => (
                <div>
                  <Link href={`/properties/${r.listingReferenceId}`} className="line-clamp-1 hover:underline">
                    {r.listingTitle}
                  </Link>
                  <div className="flex items-center gap-2">
                    <ReferenceId value={r.listingReferenceId} copy={false} />
                    <Status value={r.listingStatus} label={STATUS_LABELS[r.listingStatus as keyof typeof STATUS_LABELS]} />
                  </div>
                  {r.otherOpenReports > 0 && <p className="mt-0.5 text-[0.75rem] text-brick">{r.otherOpenReports} other open report(s)</p>}
                </div>
              ),
              hideBelow: "md",
            },
            { header: "By", cell: (r) => r.reporterName ?? "—", hideBelow: "lg" },
            { header: "Reported", cell: (r) => <When at={r.createdAt} />, hideBelow: "sm" },
            ...(filters.status !== "open"
              ? [{ header: "Resolution", cell: (r: (typeof result.rows)[number]) => <span className="text-[0.8125rem]">{r.resolutionNote} {r.resolvedBy ? `— ${r.resolvedBy}` : ""}</span> }]
              : canResolve
                ? [
                    {
                      header: <span className="sr-only">Actions</span>,
                      cell: (r: (typeof result.rows)[number]) => (
                        <ConfirmAction label="Resolve" title="Resolve this report" action={resolveReportAction} hidden={{ ref: r.referenceId }}>
                          <Select
                            label="Outcome"
                            name="outcome"
                            required
                            options={[
                              { value: "actioned", label: "Actioned: the listing was corrected, unpublished or removed" },
                              { value: "dismissed", label: "Dismissed: nothing wrong found" },
                            ]}
                          />
                          <label className="block text-[0.8125rem] font-medium" htmlFor={`note-${r.referenceId}`}>
                            What you did
                          </label>
                          <textarea id={`note-${r.referenceId}`} name="note" rows={3} className="winput" required />
                        </ConfirmAction>
                      ),
                    },
                  ]
                : []),
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/reports" />
      </Card>
    </>
  );
}
