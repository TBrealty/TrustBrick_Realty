import type { Metadata } from "next";
import Link from "next/link";
import { respondToRequestAction } from "@/app/(workspace)/my-properties/actions";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { ActionForm, Submit } from "@/components/workspace/forms";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { landlordHome } from "@/lib/services/rent/landlords";
import { landlordRentTotals } from "@/lib/services/rent/payments";
import { landlordTenancies, ordinal } from "@/lib/services/rent/tenancies";

export const metadata: Metadata = { title: "My properties" };

const TONE = { awaiting_proof: "warning", under_review: "info", approved: "success", rejected: "danger", ended: "neutral" } as const;

/**
 * The landlord's home: properties their agents added (each needs proof of ownership), requests to
 * accept, and what's left to set up before rent can reach them.
 */
export default async function MyPropertiesPage() {
  const actor = await requirePermission("rent.receive", "/my-properties");
  const [home, tenancies, totals] = await Promise.all([landlordHome(actor), landlordTenancies(actor.userId), landlordRentTotals(actor.userId)]);
  const current = new Map(tenancies.filter((t) => ["pending", "disputed", "active"].includes(t.status)).map((t) => [t.propertyReferenceId, t]));
  const steps = [
    { done: home.properties.some((p) => p.status === "approved"), label: "Proof of ownership approved", hint: "Upload it on each property below.", href: null },
    { done: home.bank?.status === "verified", label: home.bank ? (home.bank.status === "verified" ? "Bank account verified" : "Bank account being checked") : "Add your bank account", hint: "Rent is paid into it.", href: "/bank-account" },
    { done: Boolean(home.panMasked), label: "Add your PAN", hint: "Your tenants' rent receipts show it, for their HRA claims.", href: "/bank-account" },
  ];

  return (
    <>
      <PageHeader title="My properties" description="Your tenants pay rent online; Trustbrick pays it into your bank account." meta={<span className="inline-flex items-center gap-1">Landlord <ReferenceId value={home.referenceId} /></span>} />

      {home.requests.length > 0 && (
        <Card title="Waiting for your answer" className="mb-6">
          <ul className="divide-y divide-line-light">
            {home.requests.map((r) => (
              <li key={r.referenceId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="text-[0.875rem]">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-stone-deep">
                    {r.address} · added by {r.agentName} · answer by {formatDateTime(r.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ActionForm action={respondToRequestAction}>
                    <input type="hidden" name="invitation" value={r.referenceId} />
                    <input type="hidden" name="answer" value="accept" />
                    <Submit className="wbtn-sm">It&apos;s mine: accept</Submit>
                  </ActionForm>
                  <ActionForm action={respondToRequestAction}>
                    <input type="hidden" name="invitation" value={r.referenceId} />
                    <input type="hidden" name="answer" value="decline" />
                    <Submit variant="secondary" className="wbtn-sm">
                      Not mine
                    </Submit>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {steps.some((s) => !s.done) && (
        <Card title="Before rent can reach you" className="mb-6">
          <ol className="space-y-2.5 text-[0.875rem]">
            {steps.map((s) => (
              <li key={s.label} className="flex items-start gap-3">
                <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem] ${s.done ? "bg-sage text-paper" : "border border-line-light"}`}>
                  {s.done ? "✓" : ""}
                </span>
                <span>
                  {s.href && !s.done ? (
                    <Link href={s.href} className="font-medium underline underline-offset-4">
                      {s.label}
                    </Link>
                  ) : (
                    <span className={s.done ? "text-stone-deep" : "font-medium"}>{s.label}</span>
                  )}
                  {!s.done && <span className="block text-[0.8125rem] text-stone-deep">{s.hint}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {(totals.paidOut > 0 || totals.waiting > 0 || totals.onHold > 0) && (
        <p className="mb-6 text-[0.875rem] text-stone-deep">
          Paid into your bank: <strong className="font-medium text-ink">{formatMoney(totals.paidOut)}</strong>
          {totals.waiting > 0 && <> · on its way: <strong className="font-medium text-ink">{formatMoney(totals.waiting)}</strong></>}
          {totals.onHold > 0 && <> · waiting on the steps above: <strong className="font-medium text-ink">{formatMoney(totals.onHold)}</strong></>} ·{" "}
          <Link href="/rent-received" className="underline underline-offset-4">
            Rent received
          </Link>
        </p>
      )}

      {home.properties.length === 0 ? (
        <EmptyState title="No properties yet">When an agent adds you as a property&apos;s landlord, it appears here.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {home.properties.map((p) => {
            const t = current.get(p.propertyReferenceId);
            return (
              <li key={p.linkId}>
                <Link href={`/my-properties/${p.propertyReferenceId}`} className="wcard block p-4 transition-colors hover:border-ink/40 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.title}</p>
                      <p className="truncate text-[0.8125rem] text-stone-deep">{p.address}</p>
                    </div>
                    <StatusBadge tone={TONE[p.status]}>{p.statusLabel}</StatusBadge>
                  </div>
                  <p className="mt-3 text-[0.8125rem] text-graphite">
                    {t
                      ? `${t.tenantName} · ${formatMoney(t.monthlyRent)} a month, due on the ${ordinal(t.dueDay)} · ${t.status === "active" ? "active" : t.landlordConfirmed ? "waiting for the tenant" : "please confirm the terms"}`
                      : "No tenancy yet"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
