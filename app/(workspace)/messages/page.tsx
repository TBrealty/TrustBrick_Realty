import type { Metadata } from "next";
import { ConversationList } from "@/components/messages/ConversationList";
import { Card, EmptyState, PageHeader, Pagination, Tabs } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { parsePage } from "@/lib/services/pagination";
import { hostInboxFilters, listHostConversations } from "@/lib/services/stays/messages";

export const metadata: Metadata = { title: "Messages" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HostMessagesPage({ searchParams }: Props) {
  const actor = await requirePermission("bookings.view", "/messages");
  const params = await searchParams;
  const filters = hostInboxFilters.parse(params);
  const result = await listHostConversations(actor, filters, parsePage(params.page));
  const tab = (show: string) => `/messages${show === "all" ? "" : `?show=${show}`}`;

  return (
    <>
      <PageHeader title="Messages" description="Questions from guests about your stays, before and after they book. Every conversation is kept." />
      <Tabs
        label="Show"
        items={[
          { href: tab("all"), label: "All", active: filters.show === "all" },
          { href: tab("unread"), label: "Unread", count: result.unread, active: filters.show === "unread" },
        ]}
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Search conversations">
          {filters.show !== "all" && <input type="hidden" name="show" value={filters.show} />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Guest name, stay, or an MSG- / LST- reference" className="winput" />
          </div>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        {result.rows.length === 0 ? (
          <EmptyState title={filters.show === "unread" ? "You're all caught up" : "No messages yet"}>
            When a guest asks about one of your stays, the conversation appears here and you get a notification.
          </EmptyState>
        ) : (
          <ConversationList conversations={result.rows} hrefBase="/messages" />
        )}
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/messages" />
      </Card>
    </>
  );
}
