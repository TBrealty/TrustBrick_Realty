import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RevealBank } from "@/components/rent/RevealBank";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, StatusBadge } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { landlordForAdmin } from "@/lib/services/rent/admin";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

const TONE = { awaiting_proof: "warning", under_review: "info", approved: "success", rejected: "danger", ended: "neutral" } as const;
const SETTLE_TONE = { on_hold: "warning", ready: "info", paid: "success", failed: "danger", cancelled: "neutral" } as const;

/** One landlord, for Trustbrick: their properties and proofs, bank account, tenancies and settlements. */
export default async function AdminLandlordPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("rent.view", `/rent-collection/landlords/${ref}`, "platform");
  const l = await landlordForAdmin(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/rent-collection?tab=landlords">Rent</BackLink>}
        title={l.name}
        meta={
          <>
            <span className="inline-flex items-center gap-1">
              Landlord <ReferenceId value={l.referenceId} />
            </span>
            <span className="inline-flex items-center gap-1">
              User <ReferenceId value={l.userReferenceId} href={can(actor, "users.view", "platform") ? `/users/${l.userReferenceId}` : undefined} />
            </span>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Details">
          <DescriptionList
            columns={1}
            items={[
              ["Email", l.email],
              ["Phone", l.phone],
              ["PAN", l.panMasked ?? "Not given"],
              ["Landlord since", formatDay(l.since)],
            ]}
          />
        </Card>
        <Card title="Bank account" actions={l.bank && <StatusBadge tone={l.bank.status === "verified" ? "success" : l.bank.status === "failed" ? "danger" : "warning"}>{l.bank.status}</StatusBadge>}>
          {l.bank ? (
            <div className="space-y-3 text-[0.8125rem]">
              <p className="text-[0.875rem] font-medium">{l.bank.method === "bank" ? `${l.bank.bankName ?? "Bank"} ••${l.bank.accountLast4} · ${l.bank.ifsc}` : `UPI ${l.bank.upiMasked}`}</p>
              <p className="text-stone-deep">
                In the name of {l.bank.holderName}
                {l.bank.nameAtBank ? ` · the bank has ${l.bank.nameAtBank}` : ""} · changed {formatDateTime(l.bank.updatedAt)}
              </p>
              {l.bank.statusReason && <p className="text-graphite">{l.bank.statusReason}</p>}
              {can(actor, "rent.manage", "platform") && <RevealBank landlordRef={l.referenceId} />}
            </div>
          ) : (
            <p className="text-[0.875rem] text-stone-deep">No bank account yet.</p>
          )}
        </Card>
      </div>

      <Card title="Properties" className="mt-6">
        <ul className="divide-y divide-line-light text-[0.8125rem]">
          {l.properties.map((p) => (
            <li key={p.linkId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium">
                  {p.title} <ReferenceId value={p.propertyReferenceId} copy={false} />
                </p>
                <p className="text-stone-deep">{p.address}</p>
                {p.reviewNote && <p className="text-graphite">Note: {p.reviewNote}</p>}
              </div>
              <div className="flex items-center gap-3">
                {p.proofKind && (
                  <a href={`/api/rent/proof-files/${p.linkId}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    {p.proofKind}
                  </a>
                )}
                <StatusBadge tone={TONE[p.status]}>{p.statusLabel}</StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {l.tenancies.length > 0 && (
        <Card title="Tenancies" className="mt-6">
          <ul className="divide-y divide-line-light text-[0.8125rem]">
            {l.tenancies.map((t) => (
              <li key={t.referenceId} className="flex flex-wrap justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span>
                  {t.title} · {t.tenantName} · {formatMoney(t.monthlyRent)} from {formatDay(t.startDate)} <ReferenceId value={t.referenceId} copy={false} />
                </span>
                <span className="text-stone-deep">{t.statusLabel}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {l.settlements.length > 0 && (
        <Card title="Settlements" className="mt-6">
          <ul className="divide-y divide-line-light text-[0.8125rem]">
            {l.settlements.map((s) => (
              <li key={s.referenceId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span>
                  {formatMoney(s.amount)} · {s.title}, rent due {formatDay(s.rentDue)} <ReferenceId value={s.referenceId} copy={false} />
                </span>
                <span className="flex items-center gap-2">
                  {s.utr && <span className="font-mono text-[0.6875rem] text-stone-deep">UTR {s.utr}</span>}
                  <StatusBadge tone={SETTLE_TONE[s.status]}>{s.statusLabel}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/rent-collection?tab=settle" className="mt-4 inline-block text-[0.8125rem] underline underline-offset-4">
            All settlements
          </Link>
        </Card>
      )}
    </>
  );
}
