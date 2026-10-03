import type { Metadata } from "next";
import Link from "next/link";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, PageHeader, Pagination, When } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { parsePage } from "@/lib/services/pagination";
import { adminConversationFilters, listConversationsForAdmin } from "@/lib/services/stays/messages";

export const metadata: Metadata = { title: "Conversations" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ConversationsPage({ searchParams }: Props) {
  const actor = await requirePermission("conversations.view", "/conversations", "platform");
  const params = await searchParams;
  const filters = adminConversationFilters.parse(params);
  const result = await listConversationsForAdmin(actor, filters, parsePage(params.page));

  return (
    <>
      <PageHeader
        title="Conversations"
        description="Guest–host conversations, for resolving disputes. Only who and which stay are listed here; to read one, you give a reason, which is recorded in the audit log."
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Find a conversation">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Find
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Guest or host name or email, stay, or an MSG- / BKG- / LST- / USR- reference" className="winput" />
          </div>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="Conversations"
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title={filters.q ? "No conversation matches" : "No conversations yet"}>Conversations start when a guest messages a host about a stay.</EmptyState>}
          columns={[
            { header: "Conversation", cell: (r) => <ReferenceId value={r.referenceId} href={`/conversations/${r.referenceId}`} /> },
            {
              header: "Guest",
              cell: (r) => (
                <div>
                  <p className="font-medium">{r.guest.name}</p>
                  <ReferenceId value={r.guest.referenceId} copy={false} />
                </div>
              ),
            },
            {
              header: "Host",
              cell: (r) => (
                <div>
                  <p className="font-medium">{r.host.name}</p>
                  <ReferenceId value={r.host.referenceId} copy={false} />
                </div>
              ),
            },
            {
              header: "Stay",
              cell: (r) => (
                <div className="min-w-44">
                  <Link href={`/properties/${r.listing.referenceId}`} className="hover:underline">
                    {r.listing.title}
                  </Link>
                </div>
              ),
              hideBelow: "lg",
            },
            { header: "Messages", cell: (r) => <span className="tabular-nums">{r.messageCount}</span>, hideBelow: "md" },
            { header: "Bookings", cell: (r) => <span className="tabular-nums">{r.bookings}</span>, hideBelow: "md" },
            { header: "Last message", cell: (r) => <When at={r.lastMessageAt} /> },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/conversations" />
      </Card>
    </>
  );
}
