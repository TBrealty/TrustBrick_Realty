import type { Metadata } from "next";
import { AutoSubmit } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, FilterSelect, PageHeader, Pagination } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime } from "@/lib/format";
import { AUDIT_EVENTS } from "@/lib/services/audit";
import { auditFilters, listAudit } from "@/lib/services/audit-log";
import { parsePage } from "@/lib/services/pagination";

export const metadata: Metadata = { title: "Audit log" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function Changes({ before, after, metadata }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null; metadata: Record<string, unknown> | null }) {
  const parts: string[] = [];
  if (before || after) {
    for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
      const b = JSON.stringify(before?.[key] ?? null);
      const a = JSON.stringify(after?.[key] ?? null);
      if (b !== a) parts.push(`${key}: ${b} → ${a}`);
    }
  }
  if (metadata) for (const [k, v] of Object.entries(metadata)) parts.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  if (!parts.length) return <span className="text-stone">—</span>;
  return (
    <details className="max-w-md text-[0.75rem]">
      <summary className="cursor-pointer text-stone-deep">{parts.length} detail{parts.length > 1 ? "s" : ""}</summary>
      <ul className="mt-1 space-y-0.5 font-mono break-words text-graphite">
        {parts.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </details>
  );
}

export default async function AuditPage({ searchParams }: Props) {
  const actor = await requirePermission("audit.view", "/audit", "platform");
  const params = await searchParams;
  const filters = auditFilters.parse(params);
  const result = await listAudit(actor, filters, parsePage(params.page));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every consequential action, who took it, from where, and what changed. Append-only: the database refuses to edit or delete these rows, for everyone."
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" aria-label="Filter the audit log">
          <AutoSubmit>
            <FilterSelect name="event" label="Event" value={filters.event} options={AUDIT_EVENTS.map((e) => [e, e])} />
            <FilterSelect
              name="role"
              label="Actor role"
              value={filters.role}
              options={[
                ["superadmin", "SuperAdmin"],
                ["admin", "Admin"],
                ["agent", "Agent"],
                ["customer", "Customer"],
                ["system", "System"],
              ]}
            />
          </AutoSubmit>
          <div>
            <label htmlFor="actor" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Actor reference
            </label>
            <input id="actor" name="actor" defaultValue={filters.actor} placeholder="ADM-…" className="winput w-40" />
          </div>
          <div>
            <label htmlFor="target" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Target reference
            </label>
            <input id="target" name="target" defaultValue={filters.target} placeholder="LST-…" className="winput w-40" />
          </div>
          <div>
            <label htmlFor="from" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              From
            </label>
            <input id="from" name="from" type="date" defaultValue={filters.from} className="winput" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              To
            </label>
            <input id="to" name="to" type="date" defaultValue={filters.to} className="winput" />
          </div>
          <button type="submit" className="wbtn wbtn-secondary">
            Filter
          </button>
        </form>
        <DataTable
          caption="Audit events"
          rows={result.rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No events match" />}
          columns={[
            { header: "When (IST)", cell: (r) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(r.createdAt)}</span> },
            { header: "Event", cell: (r) => <span className="font-mono text-[0.75rem]">{r.eventType}</span> },
            {
              header: "Actor",
              cell: (r) => (
                <div>
                  <p>{r.actorName ?? (r.actorRole === "system" ? "System" : "—")}</p>
                  <p className="text-[0.75rem] text-stone-deep">
                    {r.actorRole}
                    {r.actorReferenceId && (
                      <>
                        {" · "}
                        <ReferenceId value={r.actorReferenceId} copy={false} />
                      </>
                    )}
                  </p>
                </div>
              ),
            },
            { header: "Target", cell: (r) => (r.targetReferenceId ? <ReferenceId value={r.targetReferenceId} /> : (r.targetType ?? "—")), hideBelow: "sm" },
            { header: "Details", cell: (r) => <Changes before={r.before} after={r.after} metadata={r.metadata} />, hideBelow: "md" },
            { header: "IP", cell: (r) => <span className="font-mono text-[0.75rem]">{r.ipAddress ?? "—"}</span>, hideBelow: "xl" },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/audit" />
      </Card>
    </>
  );
}
