import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmit, ConfirmAction } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, EmptyState, FilterSelect, PageHeader, Pagination, Status, Tabs, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime } from "@/lib/format";
import {
  LEGAL_DOCUMENT_LABELS,
  LEGAL_PROPERTY_LABELS,
  LEGAL_PURPOSE_LABELS,
  LEGAL_SERVICE_INFO,
  LEGAL_STATE_LABELS,
  LEGAL_STATUS_LABELS,
  LEGAL_TRANSITIONS,
} from "@/lib/legal/services";
import { legalFilters, listLegalRequests } from "@/lib/services/legal";
import { parsePage } from "@/lib/services/pagination";
import { LEGAL_SERVICES, LEGAL_STATES, type LegalRequestStatus } from "@/lib/vocab";
import { updateLegalRequestAction } from "./actions";

export const metadata: Metadata = { title: "Legal verification" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const label = <K extends string>(map: Record<K, string>, key: string) => map[key as K] ?? key;

type Move = { button: string; title: string; description: string; reason: { required: boolean; label: string; placeholder?: string } };

/** What each move means, for its confirmation dialog. */
const MOVES: Partial<Record<LegalRequestStatus, Move>> = {
  contacted: {
    button: "Mark contacted",
    title: "Mark as contacted?",
    description: "Once you've called them and agreed the scope and the fee. The applicant sees that you've been in touch.",
    reason: { required: false, label: "Note for the team (optional)", placeholder: "e.g. Title opinion, 30 years, fee sent by email" },
  },
  in_progress: {
    button: "With the advocate",
    title: "Hand it to the advocate?",
    description: "They've accepted the fee and the documents are with the advocate.",
    reason: { required: false, label: "Note for the team (optional)", placeholder: "e.g. The advocate's name, documents received" },
  },
  completed: {
    button: "Mark completed",
    title: "Mark as completed?",
    description: "Only once the signed report has been sent to the applicant.",
    reason: { required: false, label: "Note for the team (optional)" },
  },
  closed: {
    button: "Close",
    title: "Close without a report?",
    description: "For example, they didn't go ahead or couldn't be reached. The applicant sees it as closed.",
    reason: { required: true, label: "Why (at least 10 characters)" },
  },
};

export default async function LegalRequestsPage({ searchParams }: Props) {
  const actor = await requirePermission("support.view", "/legal-requests", "platform");
  const params = await searchParams;
  const filters = legalFilters.parse(params);
  const result = await listLegalRequests(actor, filters, parsePage(params.page));
  const canManage = can(actor, "support.manage", "platform");
  const tab = (status: string) => `/legal-requests${status === "open" ? "" : `?status=${status}`}`;
  const n = (s: LegalRequestStatus) => result.counts[s] ?? 0;

  return (
    <>
      <PageHeader
        title="Legal verification"
        description="Requests from the Legal Verification page. Call the applicant, agree the scope and the fee, pass it to an advocate, and move it along here: they see each step."
      />
      <Tabs
        label="Request status"
        items={[
          { href: tab("open"), label: "Open", count: n("new") + n("contacted") + n("in_progress"), active: filters.status === "open" },
          { href: tab("new"), label: "New", count: n("new") || undefined, active: filters.status === "new" },
          { href: tab("contacted"), label: "Contacted", active: filters.status === "contacted" },
          { href: tab("in_progress"), label: "With the advocate", active: filters.status === "in_progress" },
          { href: tab("completed"), label: "Completed", active: filters.status === "completed" },
          { href: tab("closed"), label: "Closed", active: filters.status === "closed" },
          { href: tab("all"), label: "All", active: filters.status === "all" },
        ]}
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Search requests">
          {filters.status !== "open" && <input type="hidden" name="status" value={filters.status} />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="LGL- or LST- reference, name, email, phone or place" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect name="service" label="Service" value={filters.service} options={LEGAL_SERVICES.map((s) => [s, LEGAL_SERVICE_INFO[s].label] as [string, string])} />
          </AutoSubmit>
          <AutoSubmit>
            <FilterSelect name="state" label="State" value={filters.state} options={LEGAL_STATES.map((s) => [s, LEGAL_STATE_LABELS[s]] as [string, string])} />
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        {result.rows.length === 0 ? (
          <EmptyState title={filters.status === "open" ? "No open requests" : "No requests here"}>New requests from the Legal Verification page appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-line-light">
            {result.rows.map((r) => (
              <li key={r.referenceId} className="grid grid-cols-1 gap-3 p-4 sm:p-5 lg:grid-cols-[16rem_minmax(0,1fr)_auto] lg:gap-6">
                <div className="min-w-0 text-[0.8125rem]">
                  <p className="text-[0.875rem] font-medium">{r.name}</p>
                  <a href={`tel:${r.phone}`} className="block underline">
                    {r.phone}
                  </a>
                  <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Your legal verification request (${r.referenceId})`)}`} className="block truncate underline">
                    {r.email}
                  </a>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <ReferenceId value={r.referenceId} copy />
                    {r.userReferenceId && <ReferenceId value={r.userReferenceId} href={can(actor, "users.view", "platform") ? `/users/${r.userReferenceId}` : undefined} copy={false} />}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-stone-deep">
                    <span className="rounded-full bg-ink/6 px-2 py-0.5 font-medium text-ink">{label(Object.fromEntries(LEGAL_SERVICES.map((s) => [s, LEGAL_SERVICE_INFO[s].label])), r.service)}</span>
                    <When at={r.createdAt} />
                  </div>
                  <p className="mt-2 text-[0.875rem]">
                    {label(LEGAL_PROPERTY_LABELS, r.propertyType)} · {r.location}, {label(LEGAL_STATE_LABELS, r.state)}
                  </p>
                  <p className="text-[0.8125rem] text-stone-deep">{label(LEGAL_PURPOSE_LABELS, r.purpose)}</p>
                  {r.listing && (
                    <p className="mt-1 text-[0.8125rem]">
                      <Link href={`/listings/${r.listing.referenceId}`} className="underline" target="_blank">
                        {r.listing.title}
                      </Link>{" "}
                      <span className="font-mono text-stone-deep">{r.listing.referenceId}</span>
                    </p>
                  )}
                  <p className="mt-2 text-[0.8125rem] text-graphite">
                    <span className="text-stone-deep">Has: </span>
                    {r.documents.length > 0 ? r.documents.map((d) => label(LEGAL_DOCUMENT_LABELS, d)).join(" · ") : "no documents ticked"}
                  </p>
                  {r.details && <p className="mt-2 text-[0.875rem] leading-relaxed whitespace-pre-line text-graphite">{r.details}</p>}
                  {r.statusChangedAt && (
                    <p className="mt-2 text-[0.75rem] text-stone-deep">
                      {LEGAL_STATUS_LABELS[r.status].label} {formatDateTime(r.statusChangedAt)}
                      {r.statusChangedBy ? ` by ${r.statusChangedBy}` : ""}
                      {r.statusNote ? `: “${r.statusNote}”` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:items-end">
                  <Status value={r.status} label={LEGAL_STATUS_LABELS[r.status].label} />
                  {canManage &&
                    LEGAL_TRANSITIONS[r.status].map((to) => {
                      const move = MOVES[to]!;
                      return (
                        <ConfirmAction
                          key={to}
                          label={move.button}
                          title={move.title}
                          description={move.description}
                          action={updateLegalRequestAction}
                          hidden={{ ref: r.referenceId, status: to }}
                          variant={to === "closed" ? "danger" : "secondary"}
                          reason={move.reason}
                        />
                      );
                    })}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/legal-requests" />
      </Card>
    </>
  );
}
