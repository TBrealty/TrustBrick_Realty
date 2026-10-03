import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Select, Submit, TextArea, TextInput } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { VisitControls } from "@/components/workspace/VisitControls";
import { BackLink, Card, DescriptionList, PageHeader, Status, Timeline } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { LEAD_STATUS_LABELS, LEAD_TRANSITIONS, VISIT_STATUS_LABELS, getLead } from "@/lib/services/crm";
import { leadNoteAction, leadStatusAction } from "../actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

const ACTIVITY: Record<string, string> = {
  created: "Enquiry received",
  status_changed: "Stage changed",
  note: "Note",
  visit_requested: "Visit requested",
  visit_updated: "Visit updated",
};

export default async function LeadPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("leads.view", `/leads/${ref}`);
  const lead = await getLead(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const canManage = can(actor, "leads.manage") && actor.workspace === "professional";
  const canVisits = can(actor, "visits.manage") && actor.workspace === "professional";
  const next = LEAD_TRANSITIONS[lead.status];

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/leads">Leads</BackLink>}
        title={lead.contactName}
        meta={
          <>
            <ReferenceId value={lead.referenceId} />
            <Status value={lead.status} label={LEAD_STATUS_LABELS[lead.status]} />
            <span>{lead.source === "visit_request" ? "Asked to visit" : "Enquiry"}</span>
          </>
        }
        actions={
          lead.contactPhone ? (
            <a href={`tel:${lead.contactPhone}`} className="wbtn wbtn-primary">
              Call {lead.contactPhone}
            </a>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          {lead.message && (
            <Card title="Their message">
              <p className="text-[0.875rem] whitespace-pre-line">“{lead.message}”</p>
            </Card>
          )}
          <Card title="Visits">
            {lead.visits.length === 0 ? (
              <p className="text-[0.8125rem] text-stone-deep">No visits requested.</p>
            ) : (
              <ul className="space-y-3">
                {lead.visits.map((v) => (
                  <li key={v.referenceId} className="rounded-[3px] border border-line-light p-3 text-[0.8125rem]">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReferenceId value={v.referenceId} copy={false} />
                      <Status value={v.status} label={VISIT_STATUS_LABELS[v.status]} />
                    </div>
                    <p className="mt-1.5">
                      {v.scheduledAt ? `Confirmed for ${formatDateTime(v.scheduledAt)}` : v.requestedFor ? `Customer asked for ${formatDateTime(v.requestedFor)}` : "No time yet"}
                    </p>
                    {v.notes && <p className="mt-1 text-stone-deep">{v.notes}</p>}
                    {canVisits && (
                      <div className="mt-2.5">
                        <VisitControls visit={v} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Timeline">
            <Timeline
              items={lead.activities.map((a, i) => ({
                id: String(i),
                title: (
                  <>
                    {ACTIVITY[a.type] ?? a.type}
                    {a.toStatus && a.type === "status_changed" && (
                      <>
                        : {LEAD_STATUS_LABELS[a.fromStatus as keyof typeof LEAD_STATUS_LABELS] ?? a.fromStatus} → {LEAD_STATUS_LABELS[a.toStatus as keyof typeof LEAD_STATUS_LABELS] ?? a.toStatus}
                      </>
                    )}
                  </>
                ),
                body: a.body ?? undefined,
                at: a.createdAt,
                actor: a.actorName,
              }))}
            />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Contact">
            <DescriptionList
              columns={1}
              items={[
                ["Phone", lead.contactPhone ? <a key="p" href={`tel:${lead.contactPhone}`} className="underline">{lead.contactPhone}</a> : null],
                ["Email", lead.contactEmail ? <a key="e" href={`mailto:${lead.contactEmail}`} className="underline break-all">{lead.contactEmail}</a> : null],
                ["Client", <ReferenceId key="c" value={lead.contactReferenceId} copy={false} />],
                ["Listing", lead.listingReferenceId ? <Link key="l" href={`/properties/${lead.listingReferenceId}`} className="underline">{lead.listingTitle}</Link> : null],
                ["Agent", lead.agentName],
                ["Received", formatDateTime(lead.createdAt)],
                ["Lost because", lead.lostReason],
              ]}
            />
          </Card>
          {canManage && next.length > 0 && (
            <Card title="Move to stage">
              <ActionForm action={leadStatusAction} className="space-y-3">
                <input type="hidden" name="ref" value={ref} />
                <Select label="New stage" name="status" required options={next.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] }))} />
                <TextInput label="If lost, why?" name="lostReason" hint="Required when marking a lead lost." />
                <TextArea label="Note (optional)" name="note" rows={2} />
                <Submit>Update stage</Submit>
              </ActionForm>
            </Card>
          )}
          {canManage && (
            <Card title="Add a note">
              <ActionForm action={leadNoteAction} className="space-y-3" resetOnSuccess>
                <input type="hidden" name="ref" value={ref} />
                <TextArea label="Note" name="note" rows={3} required />
                <Submit variant="secondary">Add note</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
