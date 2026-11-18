import Link from "next/link";
import { cancelTenancyAction, endTenancyAction, removeLandlordAction, resendLandlordInviteAction, resendTenantInviteAction, revokeLandlordInviteAction } from "@/app/(workspace)/properties/rent-actions";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { ConfirmAction, Submit, TextInput } from "@/components/workspace/forms";
import { Card, StatusBadge } from "@/components/workspace/ui";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import type { LandlordPanel } from "@/lib/services/rent/landlords";
import { type TenancyView, ordinal } from "@/lib/services/rent/tenancies";
import { ShareLinkForm } from "./ShareLinkForm";

const LINK_TONE = { awaiting_proof: "warning", under_review: "info", approved: "success", rejected: "danger", ended: "neutral" } as const;
const BANK_LABEL = { verified: "Bank account verified", pending: "Bank account being checked", failed: "Bank account failed", missing: "No bank account yet" } as const;

/**
 * The agent's box on a rented property: its landlord (add a new one with a sign-up link, or an
 * existing one by email, phone or ID), and its tenancy (set up, correct, end). Rent itself is paid by
 * the tenant and settled to the landlord by Trustbrick; the agent sees where things stand.
 */
export function RentCard({ listingRef, panel, tenancy, canInvite, canTenancy, today }: { listingRef: string; panel: LandlordPanel; tenancy: TenancyView | null; canInvite: boolean; canTenancy: boolean; today: string }) {
  const { landlord, invitation } = panel;
  return (
    <Card title="Landlord and rent" description="Rent is paid online by the tenant and settled to the landlord's bank account by Trustbrick.">
      <div className="space-y-6 text-[0.8125rem]">
        <section>
          <h3 className="eyebrow mb-2 text-stone-deep">Landlord</h3>
          {landlord ? (
            <div className="space-y-2">
              <p className="text-[0.9375rem] font-medium">
                {landlord.name} <ReferenceId value={landlord.referenceId} copy={false} />
              </p>
              <p className="text-stone-deep">{landlord.email}</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={LINK_TONE[landlord.status]}>{landlord.statusLabel}</StatusBadge>
                <StatusBadge tone={landlord.bank === "verified" ? "success" : landlord.bank === "failed" ? "danger" : "warning"}>{BANK_LABEL[landlord.bank]}</StatusBadge>
              </div>
              {landlord.status === "rejected" && landlord.reviewNote && <p className="text-graphite">Trustbrick: “{landlord.reviewNote}”. They can upload a better proof.</p>}
              {canInvite && !tenancy && (
                <div className="pt-1">
                  <ConfirmAction
                    label="Remove landlord"
                    title={`Remove ${landlord.name} as the landlord?`}
                    description="The property leaves their My properties. Rent already paid is still settled to them."
                    action={removeLandlordAction}
                    hidden={{ ref: listingRef }}
                    variant="danger"
                    reason={{ required: true }}
                  />
                </div>
              )}
            </div>
          ) : invitation ? (
            <div className="space-y-2">
              <p>
                {invitation.kind === "new" ? "Sign-up link" : "Request"} sent to <strong className="font-medium">{invitation.name}</strong> ({invitation.email}),{" "}
                {invitation.expired ? <span className="text-brick">expired {formatDateTime(invitation.expiresAt)}</span> : <>until {formatDateTime(invitation.expiresAt)}</>}.
              </p>
              <p className="text-stone-deep">{invitation.kind === "new" ? "They create an account with it, then the property is theirs." : "They accept it in their My properties."}</p>
              {canInvite && (
                <div className="flex flex-wrap items-start gap-2 pt-1">
                  <ShareLinkForm
                    action={resendLandlordInviteAction}
                    shareText="Your Trustbrick link to receive rent for the property:"
                    done={invitation.kind === "new" ? "New link created; the old one no longer works." : "Reminder sent."}
                  >
                    <input type="hidden" name="ref" value={listingRef} />
                    <input type="hidden" name="invitation" value={invitation.referenceId} />
                    <Submit variant="secondary" className="wbtn-sm">
                      {invitation.kind === "new" ? "Send a new link" : "Remind them"}
                    </Submit>
                  </ShareLinkForm>
                  <ConfirmAction label="Cancel" title="Cancel this invitation?" action={revokeLandlordInviteAction} hidden={{ ref: listingRef, invitation: invitation.referenceId }} variant="danger" />
                </div>
              )}
            </div>
          ) : canInvite ? (
            <div className="space-y-2">
              <p className="text-stone-deep">No landlord yet. Add the person the rent is paid to.</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/properties/${listingRef}/landlord?mode=new`} className="wbtn wbtn-primary wbtn-sm">
                  Add new landlord
                </Link>
                <Link href={`/properties/${listingRef}/landlord?mode=existing`} className="wbtn wbtn-secondary wbtn-sm">
                  Add existing landlord
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-stone-deep">No landlord yet.</p>
          )}
        </section>

        <section className="border-t border-line-light pt-5">
          <h3 className="eyebrow mb-2 text-stone-deep">Tenancy</h3>
          {tenancy ? (
            <div className="space-y-2">
              <p className="text-[0.9375rem] font-medium">
                {tenancy.tenantName} <ReferenceId value={tenancy.referenceId} copy={false} />
              </p>
              <p className="text-stone-deep">
                {formatMoney(tenancy.monthlyRent)} a month, due on the {ordinal(tenancy.dueDay)} · deposit {tenancy.deposit ? formatMoney(tenancy.deposit) : "none"} · from {formatDay(tenancy.startDate)}
                {tenancy.endDate ? ` to ${formatDay(tenancy.endDate)}` : ""}
              </p>
              <StatusBadge tone={tenancy.status === "active" ? "success" : tenancy.status === "disputed" ? "danger" : "warning"}>{tenancy.statusLabel}</StatusBadge>
              {tenancy.status === "active" && tenancy.firstDueDate && <p className="text-stone-deep">First rent paid online: {formatDay(tenancy.firstDueDate)}.</p>}
              {tenancy.disputeNote && <p className="text-graphite">Landlord: “{tenancy.disputeNote}”</p>}
              {!tenancy.tenantAccepted && tenancy.inviteExpiresAt && (
                <p className={tenancy.inviteExpired ? "text-brick" : "text-stone-deep"}>
                  The tenant&apos;s link {tenancy.inviteExpired ? "expired" : "works until"} {formatDateTime(tenancy.inviteExpiresAt)}.
                </p>
              )}
              {canTenancy && (
                <div className="flex flex-wrap items-start gap-2 pt-1">
                  {!tenancy.tenantAccepted && ["pending", "disputed"].includes(tenancy.status) && (
                    <ShareLinkForm action={resendTenantInviteAction} shareText="Your Trustbrick link to accept your tenancy and pay rent online:" done="New link created; the old one no longer works.">
                      <input type="hidden" name="ref" value={listingRef} />
                      <input type="hidden" name="tenancy" value={tenancy.referenceId} />
                      <Submit variant="secondary" className="wbtn-sm">
                        Send the tenant a new link
                      </Submit>
                    </ShareLinkForm>
                  )}
                  {["pending", "disputed"].includes(tenancy.status) && (
                    <>
                      <Link href={`/properties/${listingRef}/tenancy?edit=${tenancy.referenceId}`} className="wbtn wbtn-secondary wbtn-sm">
                        Correct the terms
                      </Link>
                      <ConfirmAction label="Cancel tenancy" title="Cancel this tenancy?" description="It hasn't started, so no rent is affected." action={cancelTenancyAction} hidden={{ ref: listingRef, tenancy: tenancy.referenceId }} variant="danger" />
                    </>
                  )}
                  {tenancy.status === "active" && (
                    <ConfirmAction
                      label={tenancy.endDate ? "Change end date" : "End tenancy"}
                      title="End this tenancy"
                      description="Rent stops falling due from the end date. Rent due before it is still collected."
                      action={endTenancyAction}
                      hidden={{ ref: listingRef, tenancy: tenancy.referenceId }}
                      variant="danger"
                      reason={{ required: true }}
                    >
                      <TextInput label="Last day" name="endDate" type="date" min={today} defaultValue={tenancy.endDate ?? today} required />
                    </ConfirmAction>
                  )}
                </div>
              )}
            </div>
          ) : landlord && canTenancy ? (
            <div className="space-y-2">
              <p className="text-stone-deep">No tenancy yet. Set it up when the property is let: the tenant gets a link, the landlord confirms the terms.</p>
              <Link href={`/properties/${listingRef}/tenancy`} className="wbtn wbtn-primary wbtn-sm">
                Set up tenancy
              </Link>
            </div>
          ) : (
            <p className="text-stone-deep">{landlord ? "No tenancy yet." : "Add the landlord first; then set up the tenancy."}</p>
          )}
        </section>
      </div>
    </Card>
  );
}
