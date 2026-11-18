import type { Metadata } from "next";
import Link from "next/link";
import { decideBankAction, holdSettlementAction, markFailedAction, markPaidAction, refundRentAction, reviewProofAction } from "@/app/(workspace)/rent-collection/actions";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Checkbox, ConfirmAction, TextInput } from "@/components/workspace/forms";
import { Card, DataTable, PageHeader, StatCard, StatusBadge, Tabs } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import {
  type AdminLandlordRow,
  type AdminRentPayment,
  type AdminSettlementRow,
  type BankRow,
  type ProofRow,
  bankAccountsToVerify,
  listLandlords,
  listRentPayments,
  listSettlements,
  proofsToReview,
  rentCounts,
  rentTotals,
} from "@/lib/services/rent/admin";
import { rentOnline } from "@/lib/services/rent/common";

export const metadata: Metadata = { title: "Rent" };

const TABS = {
  settle: "To settle",
  proofs: "Proofs to check",
  banks: "Bank accounts",
  hold: "On hold",
  returned: "Returned",
  paid: "Settled",
  payments: "Payments",
  landlords: "Landlords",
} as const;
type Tab = keyof typeof TABS;

type Props = { searchParams: Promise<{ tab?: string; q?: string }> };

const SETTLE_TONE = { on_hold: "warning", ready: "info", paid: "success", failed: "danger", cancelled: "neutral" } as const;

/**
 * Rent, for Trustbrick: check landlords (proofs of ownership, bank accounts) and settle rent to them
 * from the back office: download what's ready, pay it from the bank, record each with its UTR.
 */
export default async function RentAdminPage({ searchParams }: Props) {
  const actor = await requirePermission("rent.view", "/rent-collection", "platform");
  const params = await searchParams;
  const tab: Tab = params.tab && params.tab in TABS ? (params.tab as Tab) : "settle";
  const manage = can(actor, "rent.manage", "platform");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [counts, totals, online] = await Promise.all([rentCounts(actor), rentTotals(actor), rentOnline()]);
  const count: Partial<Record<Tab, number>> = { settle: counts.ready, proofs: counts.proofs, banks: counts.banks, hold: counts.onHold, returned: counts.failed, payments: counts.attention };

  return (
    <>
      <PageHeader
        title="Rent"
        description="Tenants pay rent to Trustbrick; Trustbrick settles it to landlords from the back office, by the next working day."
        actions={
          manage &&
          counts.ready + counts.failed > 0 && (
            <form method="post" action="/api/rent/settlements-export">
              <button type="submit" className="wbtn wbtn-primary wbtn-sm">
                Download payment file ({counts.ready + counts.failed})
              </button>
            </form>
          )
        }
      />
      {!online && (
        <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
          Collecting rent online is off (Platform settings). Landlords and tenancies can be set up; no rent falls due online.
        </p>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="To settle now" value={formatMoney(totals.ready)} hint={`${counts.ready} payment${counts.ready === 1 ? "" : "s"}`} />
        <StatCard label="On hold" value={formatMoney(totals.onHold)} hint="Waiting on landlords" />
        <StatCard label="Collected this month" value={formatMoney(totals.collectedThisMonth)} />
        <StatCard label="Settled this month" value={formatMoney(totals.paidThisMonth)} />
      </div>
      <Tabs label="Rent" items={(Object.keys(TABS) as Tab[]).map((k) => ({ href: `/rent-collection?tab=${k}`, label: TABS[k], count: count[k] || undefined, active: k === tab }))} />
      <div className="mt-5">
        {tab === "proofs" && <Proofs rows={await proofsToReview(actor)} manage={manage} />}
        {tab === "banks" && <Banks rows={await bankAccountsToVerify(actor)} manage={manage} />}
        {tab === "settle" && <Settlements rows={await listSettlements(actor, "ready")} manage={manage} today={today} empty="Nothing to settle right now." />}
        {tab === "hold" && <Settlements rows={await listSettlements(actor, "on_hold")} manage={manage} today={today} empty="Nothing on hold." />}
        {tab === "returned" && <Settlements rows={await listSettlements(actor, "failed")} manage={manage} today={today} empty="No transfers have come back." />}
        {tab === "paid" && <Settlements rows={await listSettlements(actor, "paid")} manage={manage} today={today} empty="Nothing settled yet." />}
        {tab === "payments" && <Payments rows={await listRentPayments(actor)} manage={manage} />}
        {tab === "landlords" && <Landlords rows={await listLandlords(actor, params.q)} q={params.q} />}
      </div>
    </>
  );
}

function Proofs({ rows, manage }: { rows: ProofRow[]; manage: boolean }) {
  return (
    <Card padded={false}>
      <DataTable<ProofRow>
        caption="Proofs of ownership to check"
        rows={rows}
        rowKey={(r) => r.linkId}
        empty={<p className="p-5 text-[0.875rem] text-stone-deep">No proofs waiting.</p>}
        columns={[
          {
            header: "Landlord",
            cell: (r) => (
              <Link href={`/rent-collection/landlords/${r.landlordReferenceId}`} className="font-medium hover:underline">
                {r.landlordName}
              </Link>
            ),
          },
          {
            header: "Property",
            cell: (r) => (
              <div>
                <p>{r.title}</p>
                <p className="text-[0.75rem] text-stone-deep">{r.address}</p>
              </div>
            ),
          },
          {
            header: "Proof",
            cell: (r) => (
              <a href={`/api/rent/proof-files/${r.linkId}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {r.proofKind}
              </a>
            ),
          },
          { header: "Uploaded", cell: (r) => (r.uploadedAt ? formatDateTime(r.uploadedAt) : "—"), hideBelow: "lg" },
          {
            header: "",
            cell: (r) =>
              manage && (
                <div className="flex justify-end gap-2">
                  <ConfirmAction label="Approve" title={`Approve ${r.landlordName}'s ownership?`} description="Check the name and address on the document match the landlord and the property." action={reviewProofAction} hidden={{ link: r.linkId, decision: "approve" }} reason={{ required: false }} />
                  <ConfirmAction label="Reject" title="Reject this proof?" description="Tell the landlord what to upload instead." action={reviewProofAction} hidden={{ link: r.linkId, decision: "reject" }} variant="danger" reason={{ required: true }} />
                </div>
              ),
          },
        ]}
      />
    </Card>
  );
}

function Banks({ rows, manage }: { rows: BankRow[]; manage: boolean }) {
  return (
    <Card padded={false} description="Accounts the bank check couldn't confirm. Verify one only once you've confirmed it's real and in the landlord's name (a ₹1 transfer, a cancelled cheque).">
      <DataTable<BankRow>
        caption="Bank accounts to verify"
        rows={rows}
        rowKey={(r) => r.landlordReferenceId}
        empty={<p className="p-5 text-[0.875rem] text-stone-deep">No bank accounts waiting.</p>}
        columns={[
          {
            header: "Landlord",
            cell: (r) => (
              <Link href={`/rent-collection/landlords/${r.landlordReferenceId}`} className="font-medium hover:underline">
                {r.landlordName}
              </Link>
            ),
          },
          { header: "Account", cell: (r) => (r.method === "bank" ? `${r.bankName ?? "Bank"} ••${r.accountLast4} · ${r.ifsc}` : `UPI ${r.upiMasked}`) },
          { header: "In the name of", cell: (r) => r.holderName },
          { header: "Changed", cell: (r) => formatDateTime(r.updatedAt), hideBelow: "lg" },
          {
            header: "",
            cell: (r) =>
              manage && (
                <div className="flex justify-end gap-2">
                  <ConfirmAction label="Verify" title="Verify this bank account?" action={decideBankAction} hidden={{ landlord: r.landlordReferenceId, decision: "verify" }} reason={{ required: true, label: "How you checked it" }} />
                  <ConfirmAction label="Reject" title="Reject this bank account?" action={decideBankAction} hidden={{ landlord: r.landlordReferenceId, decision: "reject" }} variant="danger" reason={{ required: true, label: "What's wrong (the landlord sees this)" }} />
                </div>
              ),
          },
        ]}
      />
    </Card>
  );
}

function Settlements({ rows, manage, today, empty }: { rows: AdminSettlementRow[]; manage: boolean; today: string; empty: string }) {
  return (
    <Card padded={false}>
      <DataTable<AdminSettlementRow>
        caption="Settlements"
        rows={rows}
        rowKey={(r) => r.referenceId}
        empty={<p className="p-5 text-[0.875rem] text-stone-deep">{empty}</p>}
        columns={[
          { header: "Settlement", cell: (r) => <ReferenceId value={r.referenceId} copy={false} /> },
          {
            header: "Landlord",
            cell: (r) => (
              <div>
                <Link href={`/rent-collection/landlords/${r.landlordReferenceId}`} className="font-medium hover:underline">
                  {r.landlordName}
                </Link>
                <p className="text-[0.75rem] text-stone-deep">{r.bank}</p>
              </div>
            ),
          },
          {
            header: "For",
            cell: (r) => (
              <div>
                <p>{r.title}</p>
                <p className="text-[0.75rem] text-stone-deep">
                  {r.tenantName}, rent due {formatDay(r.rentDue)}
                </p>
              </div>
            ),
            hideBelow: "lg",
          },
          { header: "Amount", cell: (r) => formatMoney(r.amount), align: "right" },
          {
            header: "Status",
            cell: (r) => (
              <div>
                <StatusBadge tone={SETTLE_TONE[r.status]}>{r.status === "paid" && r.paidAt ? `Paid ${formatDay(r.paidAt)}` : r.statusLabel}</StatusBadge>
                {r.status === "ready" && r.dueBy && <p className={`mt-1 text-[0.75rem] ${r.dueBy < today ? "text-brick" : "text-stone-deep"}`}>By {formatDay(r.dueBy)}</p>}
                {r.utr && <p className="mt-1 font-mono text-[0.6875rem] text-stone-deep">UTR {r.utr}</p>}
                {r.holdReason && r.status !== "paid" && <p className="mt-1 max-w-xs text-[0.75rem] text-stone-deep">{r.holdReason}</p>}
              </div>
            ),
          },
          {
            header: "",
            cell: (r) =>
              manage && (
                <div className="flex flex-wrap justify-end gap-2">
                  {["ready", "failed"].includes(r.status) && (
                    <ConfirmAction label="Mark paid" title={`Record ${formatMoney(r.amount)} paid to ${r.landlordName}`} description={`Into ${r.bank}.`} action={markPaidAction} hidden={{ settlement: r.referenceId }} confirmLabel="Record payment">
                      <TextInput label="Bank reference (UTR)" name="utr" required autoComplete="off" className="font-mono uppercase" />
                      <TextInput label="Paid on" name="paidOn" type="date" max={today} defaultValue={today} />
                    </ConfirmAction>
                  )}
                  {["ready", "failed"].includes(r.status) && <ConfirmAction label="Hold" title="Hold this settlement?" action={holdSettlementAction} hidden={{ settlement: r.referenceId, hold: "hold" }} reason={{ required: true }} />}
                  {r.status === "on_hold" && r.heldByAdmin && <ConfirmAction label="Release" title="Release this settlement?" action={holdSettlementAction} hidden={{ settlement: r.referenceId, hold: "release" }} />}
                  {r.status === "paid" && <ConfirmAction label="Bank returned it" title="The transfer came back?" description="It's owed again once the landlord's bank account is fixed." action={markFailedAction} hidden={{ settlement: r.referenceId }} variant="danger" reason={{ required: true }} />}
                </div>
              ),
          },
        ]}
      />
    </Card>
  );
}

const PAY_TONE = { created: "neutral", paid: "success", failed: "danger", refunded: "warning" } as const;

function Payments({ rows, manage }: { rows: AdminRentPayment[]; manage: boolean }) {
  return (
    <Card padded={false}>
      <DataTable<AdminRentPayment>
        caption="Rent payments"
        rows={rows}
        rowKey={(r) => r.referenceId}
        empty={<p className="p-5 text-[0.875rem] text-stone-deep">No rent payments yet.</p>}
        columns={[
          { header: "Payment", cell: (r) => <ReferenceId value={r.referenceId} copy={false} /> },
          {
            header: "Tenant → landlord",
            cell: (r) => (
              <div>
                <p>
                  {r.tenantName} → {r.landlordName}
                </p>
                <p className="text-[0.75rem] text-stone-deep">
                  {r.title}, due {formatDay(r.dueDate)}
                </p>
              </div>
            ),
          },
          { header: "Amount", cell: (r) => formatMoney(r.amount), align: "right" },
          {
            header: "Status",
            cell: (r) => (
              <div>
                <StatusBadge tone={PAY_TONE[r.status]}>{r.unwanted ? "Paid twice: returned" : r.status === "created" ? "Open" : r.status[0].toUpperCase() + r.status.slice(1)}</StatusBadge>
                {r.refundStatus && <p className="mt-1 text-[0.75rem] text-stone-deep">Refund {r.refundStatus}</p>}
                {r.needsAttention && <p className="mt-1 max-w-xs text-[0.75rem] text-brick">{r.attentionNote}</p>}
                {r.status === "failed" && r.failureReason && <p className="mt-1 max-w-xs text-[0.75rem] text-stone-deep">{r.failureReason}</p>}
              </div>
            ),
          },
          { header: "When", cell: (r) => formatDateTime(r.paidAt ?? r.createdAt), hideBelow: "lg" },
          {
            header: "",
            cell: (r) =>
              manage &&
              r.status === "paid" &&
              !r.refundStatus &&
              r.settlementStatus !== "paid" && (
                <ConfirmAction label="Refund" title={`Refund ${formatMoney(r.amount)} to ${r.tenantName}?`} description="Only before it's been settled to the landlord. The tenant gets it back in full." action={refundRentAction} hidden={{ payment: r.referenceId }} variant="danger" reason={{ required: true }}>
                  <Checkbox label="The month's rent is due again" name="reopen" defaultChecked />
                </ConfirmAction>
              ),
          },
        ]}
      />
    </Card>
  );
}

function Landlords({ rows, q }: { rows: AdminLandlordRow[]; q?: string }) {
  return (
    <Card padded={false}>
      <form className="flex gap-2 border-b border-line-light p-4" action="/rent-collection">
        <input type="hidden" name="tab" value="landlords" />
        <input name="q" defaultValue={q} placeholder="Name, email or LND- ID" className="winput max-w-sm" aria-label="Search landlords" />
        <button type="submit" className="wbtn wbtn-secondary wbtn-sm">
          Search
        </button>
      </form>
      <DataTable<AdminLandlordRow>
        caption="Landlords"
        rows={rows}
        rowKey={(r) => r.referenceId}
        empty={<p className="p-5 text-[0.875rem] text-stone-deep">No landlords{q ? " match" : " yet"}.</p>}
        columns={[
          {
            header: "Landlord",
            cell: (r) => (
              <div>
                <Link href={`/rent-collection/landlords/${r.referenceId}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <p className="text-[0.75rem] text-stone-deep">{r.email}</p>
              </div>
            ),
          },
          { header: "ID", cell: (r) => <ReferenceId value={r.referenceId} copy={false} />, hideBelow: "md" },
          { header: "Properties", cell: (r) => `${r.properties} (${r.approved} approved)` },
          { header: "Bank", cell: (r) => <StatusBadge tone={r.bank === "verified" ? "success" : r.bank === "failed" ? "danger" : "warning"}>{r.bank === "missing" ? "None" : r.bank === "pending" ? "To check" : r.bank[0].toUpperCase() + r.bank.slice(1)}</StatusBadge> },
          { header: "Since", cell: (r) => formatDay(r.createdAt), hideBelow: "lg" },
        ]}
      />
    </Card>
  );
}
