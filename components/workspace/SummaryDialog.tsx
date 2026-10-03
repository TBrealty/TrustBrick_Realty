"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { loadSummaryAction } from "@/app/(workspace)/summary-actions";
import { formatCount, formatDateTime } from "@/lib/format";
import type { AgentSummary, Journey, ListingBrief, OrganizationSummary, Summary, SummaryKind, UserSummary } from "@/lib/services/summaries";
import { ReferenceId } from "./ReferenceId";
import { Status, When } from "./ui";

const JOURNEY_LABEL: Record<Journey, string> = { buy: "Buy", invest: "Invest", rent: "Rent", lease: "Lease", pg: "PG", stay: "Stay" };
const CLOSED_VERB: Record<Journey, string> = { buy: "bought", invest: "invested", rent: "rented", lease: "leased", pg: "moved in", stay: "stayed" };
const JOURNEYS = Object.keys(JOURNEY_LABEL) as Journey[];

/**
 * The "View" button in the Action column of the Users, Agents and Organizations tables.
 * Opens a card with everything about that record, loaded on demand through a server action
 * that applies the same permission and scope checks as the record's full page.
 */
export function ViewSummary({ kind, referenceId, name }: { kind: SummaryKind; referenceId: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () => {
    dialogRef.current?.showModal();
    setError(null);
    startTransition(async () => {
      const result = await loadSummaryAction(kind, referenceId);
      if (result.ok && result.data) setData(result.data);
      else setError(result.ok ? "Nothing to show." : result.message);
    });
  };

  return (
    <>
      <button type="button" className="wbtn wbtn-secondary wbtn-sm" onClick={open} aria-haspopup="dialog" aria-label={`View ${name}`}>
        View
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-busy={pending}
        className="m-auto max-h-[min(90svh,56rem)] w-[min(60rem,calc(100vw-1.5rem))] overflow-hidden rounded-[4px] border border-line-light bg-card p-0 text-left text-ink shadow-2xl backdrop:bg-ink/50"
        onClick={(e) => {
          // A click on the backdrop (the dialog element itself, outside the panel) closes it.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="flex max-h-[min(90svh,56rem)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line-light px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-medium tracking-[0.12em] text-stone-deep uppercase">{{ user: "User", agent: "Agent", organization: "Organization" }[kind]}</p>
              <h2 id={titleId} className="mt-0.5 truncate text-[1.25rem] font-semibold tracking-[-0.01em]">
                {data?.name ?? name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <ReferenceId value={referenceId} />
                {data && <HeaderBadges data={data} />}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="-mr-2 grid size-9 shrink-0 place-items-center rounded-[3px] text-stone-deep hover:bg-paper hover:text-ink"
              aria-label="Close"
            >
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {error ? (
              <p role="alert" className="rounded-[3px] border-l-2 border-brick bg-brick/10 px-3.5 py-2.5 text-[0.8125rem]">
                {error}
              </p>
            ) : !data || data.referenceId !== referenceId ? (
              <Loading />
            ) : data.kind === "user" ? (
              <UserCard data={data} />
            ) : data.kind === "agent" ? (
              <AgentCard data={data} />
            ) : (
              <OrganizationCard data={data} />
            )}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-light px-5 py-3 sm:px-6">
            <p className="text-[0.75rem] text-stone-deep">{pending && data ? "Refreshing…" : "Read-only summary. Actions are on the full page."}</p>
            <div className="flex gap-2">
              <button type="button" className="wbtn wbtn-secondary wbtn-sm" onClick={() => dialogRef.current?.close()}>
                Close
              </button>
              {data && (
                <Link href={data.href} className="wbtn wbtn-primary wbtn-sm">
                  Open full page
                </Link>
              )}
            </div>
          </footer>
        </div>
      </dialog>
    </>
  );
}

function HeaderBadges({ data }: { data: Summary }) {
  if (data.kind === "user") {
    return (
      <>
        <Status value={data.status} />
        <Status value={data.emailVerified ? "verified" : "unverified"} label={data.emailVerified ? "Email verified" : "Email not verified"} />
      </>
    );
  }
  return (
    <>
      <Status value={data.status} />
      <Status value={data.verificationStatus} />
    </>
  );
}

function Loading() {
  return (
    <div className="space-y-4" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-[3px] bg-paper" />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-[3px] bg-paper" />
      <div className="h-40 animate-pulse rounded-[3px] bg-paper" />
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[0.8125rem] font-semibold">{title}</h3>
        {hint && <p className="text-[0.75rem] text-stone-deep">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Tiles({ items }: { items: { label: string; value: number | string; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((t) => (
        <div key={t.label} className="rounded-[3px] border border-line-light px-3 py-2.5">
          <dt className="text-[0.75rem] text-stone-deep">{t.label}</dt>
          <dd className="mt-0.5 text-[1.25rem] font-semibold tabular-nums">{typeof t.value === "number" ? formatCount(t.value) : t.value}</dd>
          {t.hint && <dd className="text-[0.6875rem] text-stone-deep">{t.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[0.75rem] text-stone-deep">{k}</dt>
          <dd className="mt-0.5 text-[0.875rem] break-words">{v ?? <span className="text-stone">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function JourneyChip({ journey }: { journey: Journey }) {
  return <span className="inline-flex rounded-[3px] bg-paper px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-wide uppercase">{JOURNEY_LABEL[journey]}</span>;
}

function ListingLine({ listing }: { listing: ListingBrief | null }) {
  if (!listing) return <span className="text-stone-deep">Listing no longer available</span>;
  return (
    <span className="block min-w-0">
      <span className="flex flex-wrap items-center gap-1.5">
        <JourneyChip journey={listing.journey} />
        <Link href={`/properties/${listing.referenceId}`} className="font-medium hover:underline">
          {listing.title}
        </Link>
      </span>
      <span className="mt-0.5 block text-[0.75rem] text-stone-deep">
        {[listing.locality, listing.price, listing.referenceId].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

/** A compact list of rows; each row is [main, status, meta]. */
function Rows({ rows, empty }: { rows: { key: string; main: React.ReactNode; status?: React.ReactNode; meta?: React.ReactNode }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-[0.8125rem] text-stone-deep">{empty}</p>;
  return (
    <ul className="divide-y divide-line-light rounded-[3px] border border-line-light">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-2 px-3 py-2.5 text-[0.8125rem] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">{r.main}</div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-[0.75rem] text-stone-deep">
            {r.status}
            {r.meta}
          </div>
        </li>
      ))}
    </ul>
  );
}

const Restricted = ({ what }: { what: string }) => <p className="text-[0.8125rem] text-stone-deep">Your permissions don&apos;t include {what}. The counts above still apply.</p>;

// ── Users ───────────────────────────────────────────────────────────────────

function UserCard({ data }: { data: UserSummary }) {
  const active = JOURNEYS.filter((j) => data.byJourney[j].enquiries > 0);
  return (
    <>
      <Section title="Contact and account">
        <Facts
          items={[
            ["Email", data.email],
            ["Phone", data.phone],
            ["Looking to", data.intent ? data.intent.replace(/^\w/, (c) => c.toUpperCase()) : null],
            ["Joined", formatDateTime(data.joinedAt)],
            ["Last active", <When key="la" at={data.lastActiveAt} />],
            ["Account status", <Status key="st" value={data.status} label={data.statusReason ? `${data.status.replace(/^\w/, (c) => c.toUpperCase())}: ${data.statusReason}` : undefined} />],
          ]}
        />
      </Section>

      <Section title="Activity on Trustbrick">
        <Tiles
          items={[
            { label: "Enquiries", value: data.totals.enquiries },
            { label: "Deals closed", value: data.totals.closed, hint: "Marked converted by the agent" },
            { label: "Site visits", value: data.totals.visits },
            { label: "Saved properties", value: data.totals.bookmarks },
            { label: "Reports filed", value: data.totals.reports },
          ]}
        />
      </Section>

      <Section title="What they're looking for" hint="Buy, invest, rent, lease and PG, from their enquiries">
        {active.length === 0 ? (
          <p className="text-[0.8125rem] text-stone-deep">No enquiries yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {JOURNEYS.map((j) => {
              const v = data.byJourney[j];
              return (
                <div key={j} className={`rounded-[3px] border px-3 py-2.5 ${v.enquiries ? "border-line-light" : "border-dashed border-line-light text-stone-deep"}`}>
                  <p className="text-[0.75rem] font-medium">{JOURNEY_LABEL[j]}</p>
                  <p className="mt-0.5 text-[0.8125rem]">
                    {v.enquiries} {v.enquiries === 1 ? "enquiry" : "enquiries"}
                  </p>
                  <p className="text-[0.75rem] text-stone-deep">{v.closed ? `${v.closed} ${CLOSED_VERB[j]}` : "none closed"}</p>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[0.6875rem] text-stone-deep">
          Purchases and tenancies aren&apos;t recorded on Trustbrick yet. &ldquo;Closed&rdquo; means the agent marked the enquiry as converted.
        </p>
      </Section>

      {data.roles.length > 0 && (
        <Section title="Roles and workspaces">
          <Rows
            empty=""
            rows={data.roles.map((r, i) => ({
              key: `${r.label}-${i}`,
              main: (
                <span>
                  <span className="font-medium">{r.label}</span>
                  {r.detail && <span className="text-stone-deep"> · {r.detail}</span>}
                </span>
              ),
              status: <Status value={r.status} />,
              meta: r.referenceId ? <ReferenceId value={r.referenceId} copy={false} /> : null,
            }))}
          />
        </Section>
      )}

      <Section title="Enquiries and applications" hint="Properties they contacted an agent about, including PGs">
        {data.enquiries === null ? (
          <Restricted what="leads" />
        ) : (
          <Rows
            empty="They haven't contacted anyone yet."
            rows={data.enquiries.map((e) => ({
              key: e.referenceId,
              main: (
                <>
                  <ListingLine listing={e.listing} />
                  {e.message && <span className="mt-1 block text-[0.75rem] text-stone-deep italic">&ldquo;{e.message}&rdquo;</span>}
                </>
              ),
              status: <Status value={e.status} label={e.status === "converted" ? "Closed" : undefined} />,
              meta: (
                <span>
                  {e.agent ? `with ${e.agent} · ` : ""}
                  <When at={e.createdAt} />
                </span>
              ),
            }))}
          />
        )}
      </Section>

      <Section title="Site visits">
        {data.visits === null ? (
          <Restricted what="visits" />
        ) : (
          <Rows
            empty="No visits requested."
            rows={data.visits.map((v) => ({
              key: v.referenceId,
              main: <ListingLine listing={v.listing} />,
              status: <Status value={v.status} />,
              meta: v.at ? formatDateTime(v.at) : null,
            }))}
          />
        )}
      </Section>

      <Section title="Saved properties">
        {data.bookmarks === null ? (
          <Restricted what="saved properties (they're personal; admins who manage users can see them)" />
        ) : (
          <Rows empty="Nothing saved." rows={data.bookmarks.map((b) => ({ key: b.referenceId, main: <ListingLine listing={b} />, status: <Status value={b.status} /> }))} />
        )}
      </Section>

      <Section title="Reports filed">
        {data.reports === null ? (
          <Restricted what="reports" />
        ) : (
          <Rows
            empty="No reports."
            rows={data.reports.map((r) => ({
              key: r.referenceId,
              main: (
                <>
                  <ListingLine listing={r.listing} />
                  <span className="mt-0.5 block text-[0.75rem] text-stone-deep">Reason: {r.reason.replace(/_/g, " ")}</span>
                </>
              ),
              status: <Status value={r.status} />,
              meta: <When at={r.createdAt} />,
            }))}
          />
        )}
      </Section>
    </>
  );
}

// ── Agents and organizations share their work sections ─────────────────────

function WorkSections({ data, who }: { data: AgentSummary | OrganizationSummary; who: string }) {
  const rate = data.leads.total ? `${Math.round((data.leads.converted / data.leads.total) * 100)}%` : "—";
  return (
    <>
      <Section title="Performance">
        <Tiles
          items={[
            { label: "Live listings", value: data.listings.live, hint: `${data.listings.total} in total` },
            { label: "Awaiting review", value: data.listings.inReview, hint: `${data.listings.drafts} drafts` },
            { label: "Leads", value: data.leads.total, hint: `${data.leads.open} open` },
            { label: "Deals closed", value: data.leads.converted, hint: `Conversion ${rate}` },
            { label: "Site visits", value: data.visits.total, hint: `${data.visits.upcoming} upcoming · ${data.visits.completed} done` },
          ]}
        />
      </Section>

      <Section title="By market" hint="Listings, enquiries and closed deals">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {JOURNEYS.map((j) => (
            <div key={j} className="rounded-[3px] border border-line-light px-3 py-2.5">
              <p className="text-[0.75rem] font-medium">{JOURNEY_LABEL[j]}</p>
              <p className="mt-0.5 text-[0.8125rem]">{data.listings.byJourney[j]} listings</p>
              <p className="text-[0.75rem] text-stone-deep">
                {data.leads.byJourney[j].enquiries} enquiries · {data.leads.byJourney[j].closed} closed
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recent listings">
        <Rows
          empty={`${who} has no listings yet.`}
          rows={data.recentListings.map((l) => ({
            key: l.referenceId,
            main: <ListingLine listing={l} />,
            status: <Status value={l.status} />,
            meta: (
              <span>
                {l.agent && data.kind === "organization" ? `${l.agent} · ` : ""}
                <When at={l.updatedAt} />
              </span>
            ),
          }))}
        />
      </Section>

      <Section title="Recent leads">
        {data.recentLeads === null ? (
          <Restricted what="leads" />
        ) : (
          <Rows
            empty="No enquiries yet."
            rows={data.recentLeads.map((l) => ({
              key: l.referenceId,
              main: (
                <>
                  <span className="font-medium">{l.customer}</span>
                  <span className="mt-0.5 block">
                    <ListingLine listing={l.listing} />
                  </span>
                </>
              ),
              status: <Status value={l.status} label={l.status === "converted" ? "Closed" : undefined} />,
              meta: <When at={l.createdAt} />,
            }))}
          />
        )}
      </Section>
    </>
  );
}

function AgentCard({ data }: { data: AgentSummary }) {
  return (
    <>
      <Section title="Profile">
        <Facts
          items={[
            ["Email", data.email],
            ["Phone", data.phone],
            ["Organization", data.organization ? `${data.organization.name} (${data.organization.referenceId})` : "Independent"],
            ["City", data.city],
            ["RERA registration", data.reraAgentNumber],
            ["Experience", data.experienceYears === null ? null : `${data.experienceYears} years`],
            ["Joined", formatDateTime(data.joinedAt)],
            ["Approved", data.approvedAt ? formatDateTime(data.approvedAt) : null],
            ["Last active", <When key="la" at={data.lastActiveAt} />],
          ]}
        />
        {data.statusReason && <p className="mt-3 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3 py-2 text-[0.8125rem]">{data.statusReason}</p>}
        {data.bio && <p className="mt-3 text-[0.8125rem] text-stone-deep">{data.bio}</p>}
      </Section>
      <WorkSections data={data} who="This agent" />
    </>
  );
}

function OrganizationCard({ data }: { data: OrganizationSummary }) {
  return (
    <>
      <Section title="Details">
        <Facts
          items={[
            ["Type", data.orgTypeLabel],
            ["City", data.city],
            ["Contact email", data.contactEmail],
            ["Contact phone", data.contactPhone],
            ["RERA registration", data.reraRegistration],
            ["Added", `${formatDateTime(data.createdAt)}${data.createdBy ? ` by ${data.createdBy}` : ""}`],
          ]}
        />
        {data.statusReason && <p className="mt-3 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3 py-2 text-[0.8125rem]">{data.statusReason}</p>}
      </Section>
      <WorkSections data={data} who="This organization" />
      <Section title={`Members (${data.members.length})`}>
        <Rows
          empty="No members yet."
          rows={data.members.map((m) => ({
            key: m.userReferenceId,
            main: (
              <span>
                <span className="font-medium">{m.name}</span>
                <span className="text-stone-deep"> · {m.roles.join(", ") || "Member"}</span>
              </span>
            ),
            status: <Status value={m.status} />,
            meta: (
              <span className="flex items-center gap-2">
                {m.listings} listings · {m.leads} leads
                <ReferenceId value={m.agentReferenceId ?? m.userReferenceId} copy={false} />
              </span>
            ),
          }))}
        />
      </Section>
      {data.projects.length > 0 && (
        <Section title="Projects">
          <Rows empty="" rows={data.projects.map((p) => ({ key: p.referenceId, main: <span className="font-medium">{p.name}</span>, status: <Status value={p.status} />, meta: <ReferenceId value={p.referenceId} copy={false} /> }))} />
        </Section>
      )}
    </>
  );
}
