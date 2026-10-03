import Link from "next/link";
import { partnerRateAction } from "@/app/(workspace)/commissions/actions";
import { CommissionRates } from "@/components/workspace/CommissionRates";
import { ActionForm, Select, Submit, TextInput } from "@/components/workspace/forms";
import { Card, StatusBadge } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { COMMISSION_SERVICE_LABELS } from "@/lib/commission/terms";
import { formatDay } from "@/lib/format";
import { acceptanceFor, getGstPercent, rateHistory, ratesFor, servicesFor } from "@/lib/services/commission";
import type { CommissionService } from "@/lib/vocab";

/**
 * A partner's commission, on their agent, host or organization page: the rates in force (their
 * own or the defaults), whether they've accepted them, the history, and, for admins who manage
 * commission, setting their own rate. Rates belong to the organization, so an agent in a
 * brokerage points to the brokerage's page.
 */
export async function PartnerCommissionCard({
  actor,
  organization,
  services: only,
  editable = true,
}: {
  actor: Actor;
  organization: { id: string; referenceId: string; name: string };
  services?: readonly CommissionService[];
  /** False for an agent in a brokerage: the brokerage's page is where the rate is set. */
  editable?: boolean;
}) {
  if (!can(actor, "commission.view", "platform")) return null;
  const [rates, gstPercent, history, offered] = await Promise.all([ratesFor(organization.id), getGstPercent(), rateHistory(actor, organization.id), servicesFor(organization.id)]);
  const services = only ?? offered;
  const acceptance = await acceptanceFor(organization.id, undefined, rates);
  const manage = editable && can(actor, "commission.manage", "platform");

  return (
    <Card
      title="Commission"
      description={editable ? undefined : `Set on ${organization.name}, the organization this agent works for.`}
      actions={<StatusBadge tone={acceptance.accepted ? "success" : "warning"}>{acceptance.accepted ? "Accepted" : acceptance.outdated ? "Changed, not yet accepted" : "Not accepted yet"}</StatusBadge>}
    >
      <CommissionRates rates={rates} services={services} you={false} gstPercent={gstPercent} />
      <p className="mt-3 text-[0.75rem] text-stone-deep">
        {acceptance.accepted && acceptance.acceptedAt
          ? `Accepted ${formatDay(acceptance.acceptedAt)}${acceptance.acceptedBy ? ` by ${acceptance.acceptedBy}` : ""}.`
          : "They can't submit listings for approval until they accept."}{" "}
        <Link href={`/commissions?q=${organization.referenceId}&status=all`} className="underline">
          Their charges
        </Link>
        {!editable && (
          <>
            {" · "}
            <Link href={`/organizations/${organization.referenceId}`} className="underline">
              Change on the organization
            </Link>
          </>
        )}
      </p>

      {manage && (
        <details className="mt-4 border-t border-line-light pt-4">
          <summary className="cursor-pointer text-[0.8125rem] font-medium">Set their own rate</summary>
          <ActionForm action={partnerRateAction} resetOnSuccess className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="organization" value={organization.referenceId} />
            <Select label="Service" name="service" required options={services.map((s) => ({ value: s, label: `${COMMISSION_SERVICE_LABELS[s]} (now ${rates[s].percent}%${rates[s].custom ? ", own rate" : ""})` }))} placeholder="Choose" />
            <TextInput label="Their rate (%)" name="percent" inputMode="decimal" placeholder="Blank: back to the default" hint="Of the same basis as the default." />
            <TextInput label="Reason" name="reason" required fieldClassName="sm:col-span-2" placeholder="e.g. Agreed at onboarding: launch partner" hint="Kept with the rate. They'll be asked to accept the new rate." />
            <div className="flex justify-end sm:col-span-2">
              <Submit>Save rate</Submit>
            </div>
          </ActionForm>
        </details>
      )}

      {history.length > 0 && (
        <details className="mt-4 border-t border-line-light pt-4">
          <summary className="cursor-pointer text-[0.8125rem] font-medium">Rate history ({history.length})</summary>
          <ul className="mt-2 space-y-1.5 text-[0.75rem] text-graphite">
            {history.map((h, i) => (
              <li key={i}>
                {formatDay(h.at)} · {COMMISSION_SERVICE_LABELS[h.service]}: {h.percent === null ? "back to the default" : `${h.percent}%`}
                {h.setBy ? ` by ${h.setBy}` : ""} · “{h.reason}”
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
