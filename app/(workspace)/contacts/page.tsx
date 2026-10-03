import type { Metadata } from "next";
import Link from "next/link";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, PageHeader, Pagination, When } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { listContacts } from "@/lib/services/crm";
import { parsePage } from "@/lib/services/pagination";

export const metadata: Metadata = { title: "Clients" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ContactsPage({ searchParams }: Props) {
  const actor = await requirePermission("contacts.view", "/contacts");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : undefined;
  const result = await listContacts(actor, q || undefined, parsePage(params.page));

  return (
    <>
      <PageHeader title="Clients" description="People who have enquired about your listings, with how to reach them. Each person appears once, however many enquiries they've made." />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder="CON- reference, name, phone or email" className="winput" />
          </div>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="Clients"
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title="No clients yet" />}
          columns={[
            {
              header: "Name",
              cell: (r) => (
                <div>
                  <Link href={`/leads?q=${encodeURIComponent(r.phone ?? r.email ?? r.name)}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div>
                    <ReferenceId value={r.referenceId} copy={false} />
                  </div>
                </div>
              ),
            },
            { header: "Phone", cell: (r) => (r.phone ? <a href={`tel:${r.phone}`} className="underline">{r.phone}</a> : "—") },
            { header: "Email", cell: (r) => r.email ?? "—", hideBelow: "md" },
            { header: "Leads", cell: (r) => r.leads, align: "right" },
            { header: "Last activity", cell: (r) => <When at={r.lastActivityAt} />, hideBelow: "sm" },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/contacts" />
      </Card>
    </>
  );
}
