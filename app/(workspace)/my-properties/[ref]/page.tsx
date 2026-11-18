import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { confirmTenancyAction, disputeTenancyAction, endTenancyAction } from "@/app/(workspace)/my-properties/actions";
import { ProofUpload } from "@/components/rent/ProofUpload";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { ActionForm, ConfirmAction, Submit, TextInput } from "@/components/workspace/forms";
import { BackLink, Card, DataTable, PageHeader, StatusBadge } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { landlordProperties } from "@/lib/services/rent/landlords";
import { type ChargeView, type SettlementView, chargesForTenancy, landlordSettlements } from "@/lib/services/rent/payments";
import { landlordTenancies, ordinal } from "@/lib/services/rent/tenancies";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

const TONE = { awaiting_proof: "warning", under_review: "info", approved: "success", rejected: "danger", ended: "neutral" } as const;
const SETTLE_TONE = { on_hold: "warning", ready: "info", paid: "success", failed: "danger", cancelled: "neutral" } as const;

/** One of the landlord's properties: proof of ownership, the tenancy (confirm or dispute), and its rent. */
export default async function MyPropertyPage({ params }: Props) {
  const ref = normalizeReferenceId((await params).ref);
  const actor = await requirePermission("rent.receive", `/my-properties/${ref}`);
  if (!isReferenceId(ref, "PRP")) notFound();
  const [[property], tenancies, settlements] = await Promise.all([landlordProperties(actor.userId, ref), landlordTenancies(actor.userId, ref), landlordSettlements(actor.userId, ref, 24)]);
  if (!property) notFound();
  const tenancy = tenancies.find((t) => ["pending", "disputed", "active"].includes(t.status)) ?? null;
  const charges: ChargeView[] = tenancy ? await chargesForTenancy(tenancy.referenceId) : [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/my-properties">My properties</BackLink>}
        title={property.title}
        description={property.address}
        meta={
          <>
            <StatusBadge tone={TONE[property.status]}>{property.statusLabel}</StatusBadge>
            <span className="inline-flex items-center gap-1">
              Property <ReferenceId value={property.propertyReferenceId} />
            </span>
            {property.agentName && <span>Agent: {property.agentName}</span>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Proof of ownership" description="Trustbrick checks that you own the property before paying its rent to you.">
          {property.proof && (
            <p className="mb-4 text-[0.8125rem]">
              {property.proof.label}
              {property.proof.filename ? ` (${property.proof.filename})` : ""}, uploaded {formatDateTime(property.proof.uploadedAt)}.{" "}
              <a href={`/api/rent/proof-files/${property.linkId}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                View
              </a>
            </p>
          )}
          {property.status === "approved" ? (
            <p className="text-[0.875rem] text-sage">Approved. Nothing more to do here.</p>
          ) : property.status === "under_review" ? (
            <>
              <p className="mb-4 text-[0.875rem]">Being checked. You&apos;ll be told when it&apos;s done, usually within two working days.</p>
              <details>
                <summary className="cursor-pointer text-[0.8125rem] text-stone-deep">Upload a different document instead</summary>
                <div className="mt-3">
                  <ProofUpload propertyRef={property.propertyReferenceId} replacing />
                </div>
              </details>
            </>
          ) : (
            <>
              {property.status === "rejected" && (
                <p className="mb-4 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.8125rem]">
                  Not accepted{property.reviewNote ? `: ${property.reviewNote}` : "."} Please upload another document.
                </p>
              )}
              <ProofUpload propertyRef={property.propertyReferenceId} replacing={Boolean(property.proof)} />
            </>
          )}
        </Card>

        <Card title="Tenancy">
          {!tenancy ? (
            <p className="text-[0.875rem] text-stone-deep">No tenancy yet. Your agent sets it up when the property is let, and you confirm the terms here.</p>
          ) : (
            <div className="space-y-4 text-[0.875rem]">
              <div>
                <p className="font-medium">
                  {tenancy.tenantName} <ReferenceId value={tenancy.referenceId} copy={false} />
                </p>
                <p className="text-stone-deep">{tenancy.statusLabel}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-stone-deep">Monthly rent</dt>
                <dd className="font-medium">{formatMoney(tenancy.monthlyRent)}</dd>
                <dt className="text-stone-deep">Due on</dt>
                <dd>The {ordinal(tenancy.dueDay)} of each month</dd>
                <dt className="text-stone-deep">Deposit</dt>
                <dd>{tenancy.deposit ? formatMoney(tenancy.deposit) : "None"}</dd>
                <dt className="text-stone-deep">From</dt>
                <dd>
                  {formatDay(tenancy.startDate)}
                  {tenancy.endDate ? ` to ${formatDay(tenancy.endDate)}` : ""}
                </dd>
                {tenancy.firstDueDate && (
                  <>
                    <dt className="text-stone-deep">First rent online</dt>
                    <dd>{formatDay(tenancy.firstDueDate)}</dd>
                  </>
                )}
              </dl>
              {tenancy.status === "pending" && !tenancy.landlordConfirmed && (
                <div className="flex flex-wrap gap-2 border-t border-line-light pt-4">
                  <ActionForm action={confirmTenancyAction}>
                    <input type="hidden" name="tenancy" value={tenancy.referenceId} />
                    <input type="hidden" name="property" value={property.propertyReferenceId} />
                    <Submit>These terms are right</Submit>
                  </ActionForm>
                  <ConfirmAction
                    label="Something's wrong"
                    title="What's wrong with the terms?"
                    description="Your agent corrects them and asks you again."
                    action={disputeTenancyAction}
                    hidden={{ tenancy: tenancy.referenceId, property: property.propertyReferenceId }}
                    reason={{ required: true, label: "What should it be?" }}
                    confirmLabel="Send to the agent"
                    size="md"
                  />
                </div>
              )}
              {tenancy.status === "disputed" && <p className="text-graphite">You said: “{tenancy.disputeNote}”. Waiting for the agent to correct it.</p>}
              {tenancy.status === "active" && (
                <div className="border-t border-line-light pt-4">
                  <ConfirmAction
                    label={tenancy.endDate ? "Change end date" : "End tenancy"}
                    title="End this tenancy"
                    description="Rent stops falling due from the last day. Rent due before it is still collected."
                    action={endTenancyAction}
                    hidden={{ tenancy: tenancy.referenceId, property: property.propertyReferenceId }}
                    variant="danger"
                    reason={{ required: true }}
                  >
                    <TextInput label="Last day" name="endDate" type="date" min={today} defaultValue={tenancy.endDate ?? today} required />
                  </ConfirmAction>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {(charges.length > 0 || settlements.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Rent from the tenant" padded={false}>
            <DataTable<ChargeView>
              caption="Rent due and paid"
              rows={charges}
              rowKey={(c) => c.referenceId}
              empty={<p className="p-5 text-[0.8125rem] text-stone-deep">Each month&apos;s rent shows here a week before it&apos;s due.</p>}
              columns={[
                { header: "Due", cell: (c) => formatDay(c.dueDate) },
                { header: "Amount", cell: (c) => formatMoney(c.amount), align: "right" },
                { header: "Status", cell: (c) => <StatusBadge tone={c.status === "paid" ? "success" : c.overdue ? "danger" : "warning"}>{c.status === "paid" ? "Paid" : c.overdue ? "Overdue" : "Due"}</StatusBadge> },
              ]}
            />
          </Card>
          <Card title="Paid to you" padded={false}>
            <DataTable<SettlementView>
              caption="Rent settled to your bank"
              rows={settlements}
              rowKey={(s) => s.referenceId}
              empty={<p className="p-5 text-[0.8125rem] text-stone-deep">Nothing yet.</p>}
              columns={[
                { header: "Rent due", cell: (s) => formatDay(s.rentDue) },
                { header: "Amount", cell: (s) => formatMoney(s.amount), align: "right" },
                { header: "Status", cell: (s) => <StatusBadge tone={SETTLE_TONE[s.status]}>{s.status === "paid" && s.paidAt ? `Paid ${formatDay(s.paidAt)}` : s.statusLabel}</StatusBadge> },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}
