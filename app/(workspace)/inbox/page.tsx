import type { Metadata } from "next";
import { AutoSubmit, ConfirmAction } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, EmptyState, FilterSelect, PageHeader, Pagination, Status, Tabs, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { CONTACT_TOPICS } from "@/lib/db/schema/platform";
import { formatDateTime } from "@/lib/format";
import { CONTACT_TOPIC_LABELS, inboxFilters, listContactMessages } from "@/lib/services/contact";
import { parsePage } from "@/lib/services/pagination";
import { resolveContactAction } from "./actions";

export const metadata: Metadata = { title: "Contact messages" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InboxPage({ searchParams }: Props) {
  const actor = await requirePermission("support.view", "/inbox", "platform");
  const params = await searchParams;
  const filters = inboxFilters.parse(params);
  const result = await listContactMessages(actor, filters, parsePage(params.page));
  const canResolve = can(actor, "support.manage", "platform");
  const tab = (status: string) => `/inbox${status === "open" ? "" : `?status=${status}`}`;

  return (
    <>
      <PageHeader title="Contact messages" description="Messages sent through the Contact us page. Reply from your own email, then mark them resolved." />
      <Tabs
        label="Message status"
        items={[
          { href: tab("open"), label: "Open", count: result.open, active: filters.status === "open" },
          { href: tab("resolved"), label: "Resolved", active: filters.status === "resolved" },
          { href: tab("all"), label: "All", active: filters.status === "all" },
        ]}
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Search messages">
          {filters.status !== "open" && <input type="hidden" name="status" value={filters.status} />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="TKT- reference, name, email or words in the message" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect name="topic" label="Topic" value={filters.topic} options={CONTACT_TOPICS.map((t) => [t, CONTACT_TOPIC_LABELS[t]] as [string, string])} />
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        {result.rows.length === 0 ? (
          <EmptyState title={filters.status === "open" ? "No open messages" : "No messages here"}>New messages from the Contact us page appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-line-light">
            {result.rows.map((m) => (
              <li key={m.referenceId} className="grid grid-cols-1 gap-3 p-4 sm:p-5 lg:grid-cols-[16rem_minmax(0,1fr)_auto] lg:gap-6">
                <div className="min-w-0 text-[0.8125rem]">
                  <p className="text-[0.875rem] font-medium">{m.name}</p>
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: your message to Trustbrick (${m.referenceId})`)}`} className="block truncate underline">
                    {m.email}
                  </a>
                  {m.phone && <p className="text-stone-deep">{m.phone}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <ReferenceId value={m.referenceId} copy />
                    {m.userReferenceId && <ReferenceId value={m.userReferenceId} href={can(actor, "users.view", "platform") ? `/users/${m.userReferenceId}` : undefined} copy={false} />}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-stone-deep">
                    <span className="rounded-full bg-ink/6 px-2 py-0.5 text-ink">{m.topicLabel}</span>
                    <When at={m.createdAt} />
                  </div>
                  <p className="mt-2 text-[0.875rem] leading-relaxed whitespace-pre-line text-graphite">{m.message}</p>
                  {m.status === "resolved" && (
                    <p className="mt-2 text-[0.75rem] text-stone-deep">
                      Resolved {m.resolvedAt ? formatDateTime(m.resolvedAt) : ""}
                      {m.resolvedBy ? ` by ${m.resolvedBy}` : ""}
                      {m.resolutionNote ? `: “${m.resolutionNote}”` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-2 lg:flex-col lg:items-end">
                  <Status value={m.status} />
                  {m.status === "open" && canResolve && (
                    <ConfirmAction
                      label="Mark resolved"
                      title="Mark this message resolved?"
                      description="Reply to them by email first. The note is only for the team."
                      action={resolveContactAction}
                      hidden={{ ref: m.referenceId }}
                      reason={{ required: false, label: "Note for the team (optional)" }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/inbox" />
      </Card>
    </>
  );
}
