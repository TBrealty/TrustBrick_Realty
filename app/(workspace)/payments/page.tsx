import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ConfirmAction, Submit } from "@/components/workspace/forms";
import { Card, EmptyState, PageHeader, Pagination, StatCard, StatusBadge, Tabs } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime, formatDay, formatMoney, formatPrice } from "@/lib/format";
import { parsePage } from "@/lib/services/pagination";
import { type AdminPaymentRow, PAYMENT_TABS, type PaymentTab, listPayments, paymentFilters, paymentsOverview } from "@/lib/services/stays/payments";
import { BOOKING_STATUS_LABELS } from "@/lib/stays/labels";
import { holdPayoutAction, refundAction, releasePayoutAction, resolveAttentionAction, retryRefundAction, settleNowAction } from "./actions";

export const metadata: Metadata = { title: "Payments" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const PAYMENT: Record<AdminPaymentRow["status"], { label: string; tone: Tone }> = {
  created: { label: "Not paid yet", tone: "neutral" },
  authorized: { label: "Held", tone: "info" },
  captured: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  voided: { label: "Hold released", tone: "neutral" },
  partially_refunded: { label: "Partly refunded", tone: "warning" },
  refunded: { label: "Refunded", tone: "neutral" },
};
const PAYOUT: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  processing: { label: "On its way", tone: "info" },
  paid: { label: "Paid out", tone: "success" },
  on_hold: { label: "On hold", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "No payout", tone: "neutral" },
};

/** Whole rupees, for the stat cards. */
const rupees = (v: number) => formatPrice(v, { compact: false });

/** Every online payment for stays: what guests paid, what went back, and what hosts were paid. */
export default async function PaymentsPage({ searchParams }: Props) {
  const actor = await requirePermission("payments.view", "/payments", "platform");
  const params = await searchParams;
  const filters = paymentFilters.parse(params);
  const [overview, list] = await Promise.all([paymentsOverview(actor), listPayments(actor, filters, parsePage(params.page))]);
  const manage = can(actor, "payments.manage", "platform");
  const href = (tab: PaymentTab) => `/payments${tab === "all" && !filters.q ? "" : `?${new URLSearchParams({ ...(tab !== "all" ? { tab } : {}), ...(filters.q ? { q: filters.q } : {}) })}`}`;

  return (
    <>
      <PageHeader
        title="Payments"
        description="Guests' online payments for stays, refunds, and hosts' payouts. Money moves through the payment provider; this page shows what it has confirmed."
        actions={
          manage ? (
            <ActionForm action={settleNowAction}>
              <Submit variant="secondary">Run payments job now</Submit>
            </ActionForm>
          ) : undefined
        }
      />

      {!overview.online && (
        <p className="mb-6 border-l-2 border-line-light bg-paper px-4 py-3 text-[0.875rem] text-graphite">
          Online payment is switched off: guests pay hosts at the property. It&apos;s switched on in{" "}
          <Link href="/system" className="underline">
            Platform settings
          </Link>
          .
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Collected this month" value={rupees(overview.collected)} emphasis />
        <StatCard label="Refunded this month" value={rupees(overview.refunded)} />
        <StatCard label="Commission + GST kept" value={rupees(overview.commission)} hint="This month, from payouts" />
        <StatCard label="Owed to hosts" value={rupees(overview.owedToHosts)} hint={`${rupees(overview.held)} held on requests`} />
        <StatCard label="Needs attention" value={String(overview.attention)} />
      </div>

      <Tabs
        label="Payments"
        items={(Object.keys(PAYMENT_TABS) as PaymentTab[]).map((t) => ({ href: href(t), label: PAYMENT_TABS[t].label, count: t === "all" ? undefined : list.counts[t] || undefined, active: filters.tab === t }))}
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Search payments">
          {filters.tab !== "all" && <input type="hidden" name="tab" value={filters.tab} />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="PAY-, BKG-, RFD- or PYT- reference, guest name, email or stay" className="winput" />
          </div>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        {list.rows.length === 0 ? (
          <EmptyState title="No payments here">Payments appear as guests pay for stays online.</EmptyState>
        ) : (
          <ul className="divide-y divide-line-light">
            {list.rows.map((p) => (
              <li key={p.referenceId} className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[0.8125rem]">{p.referenceId}</span>
                    {p.status === "created" && p.booking.status !== "pending_payment" ? (
                      <StatusBadge tone="neutral">Not completed</StatusBadge>
                    ) : (
                      <StatusBadge tone={PAYMENT[p.status].tone}>{PAYMENT[p.status].label}</StatusBadge>
                    )}
                    {p.unwanted && <StatusBadge tone="warning">Returned: not needed</StatusBadge>}
                    {p.needsAttention && <StatusBadge tone="danger">Needs attention</StatusBadge>}
                  </p>
                  <p className="mt-1.5 text-[0.9375rem]">
                    <Link href={`/bookings/${p.booking.referenceId}`} className="font-medium underline-offset-2 hover:underline">
                      {p.booking.guestName}
                    </Link>{" "}
                    <span className="text-stone-deep">· {p.booking.guestEmail}</span>
                  </p>
                  <p className="text-[0.8125rem] text-graphite">
                    {p.booking.title} · {formatDay(p.booking.checkIn)} – {formatDay(p.booking.checkOut)} · {BOOKING_STATUS_LABELS[p.booking.status]}
                  </p>
                  <p className="text-[0.75rem] text-stone-deep">
                    {p.booking.organization} · {formatDateTime(p.createdAt)}
                    {p.method ? ` · ${p.method}` : ""}
                    {p.providerPaymentId ? ` · ${p.provider} ${p.providerPaymentId}` : ""}
                  </p>
                  {p.failureReason && p.status === "failed" && <p className="mt-1 text-[0.8125rem] text-brick">{p.failureReason}</p>}
                  {p.attentionNote && (p.needsAttention || p.unwanted) && <p className="mt-1 text-[0.8125rem] text-graphite">{p.attentionNote}</p>}
                </div>

                <div className="text-[0.875rem]">
                  <p className="text-[0.75rem] text-stone-deep">Guest paid</p>
                  <p className="text-[1.0625rem] font-medium tabular-nums">{formatMoney(p.amount)}</p>
                  {p.refunds.map((r) => (
                    <p key={r.referenceId} className="mt-1 text-[0.8125rem]">
                      <span className="tabular-nums">{formatMoney(-r.amount)}</span> <span className="font-mono text-[0.75rem]">{r.referenceId}</span>{" "}
                      <span className={r.status === "failed" ? "text-brick" : "text-stone-deep"}>{r.status === "processed" ? "refunded" : r.status === "pending" ? "on its way" : "failed"}</span>
                      {r.status === "failed" && manage && (
                        <span className="ml-2 inline-block align-middle">
                          <ConfirmAction label="Retry" title={`Send refund ${r.referenceId} again?`} description={r.failureReason ?? undefined} action={retryRefundAction} hidden={{ ref: r.referenceId }} />
                        </span>
                      )}
                    </p>
                  ))}
                </div>

                <div className="text-[0.875rem]">
                  <p className="text-[0.75rem] text-stone-deep">Host payout</p>
                  {p.payout ? (
                    <>
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[1.0625rem] font-medium tabular-nums">{formatMoney(p.payout.amount)}</span>
                        <StatusBadge tone={PAYOUT[p.payout.status].tone}>{PAYOUT[p.payout.status].label}</StatusBadge>
                      </p>
                      <p className="text-[0.75rem] text-stone-deep">
                        <span className="font-mono">{p.payout.referenceId}</span> · commission {formatMoney(p.payout.commission)} + GST {formatMoney(p.payout.gst)}
                      </p>
                      <p className="text-[0.75rem] text-stone-deep">
                        {p.payout.status === "paid" ? `UTR ${p.payout.utr ?? "—"}` : p.payout.status === "on_hold" ? p.payout.holdReason : p.payout.status === "failed" ? p.payout.failureReason : `Due ${formatDateTime(p.payout.releaseAt)}`}
                      </p>
                    </>
                  ) : (
                    <p className="text-stone-deep">{p.status === "authorized" ? "After the host accepts" : "—"}</p>
                  )}
                  {manage && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["captured", "partially_refunded"].includes(p.status) && !p.unwanted && p.payout && !["paid", "processing"].includes(p.payout.status) && (
                        <ConfirmAction
                          label="Refund"
                          title={`Refund ${p.referenceId}`}
                          description={`Up to ${formatMoney(p.amount - p.refunded)}. It comes out of the host's payout and Trustbrick's commission in proportion.`}
                          action={refundAction}
                          hidden={{ ref: p.referenceId }}
                          reason={{ required: true, label: "Reason (the guest sees it)" }}
                        >
                          <label className="mb-3 block">
                            <span className="mb-1.5 block text-[0.8125rem] font-medium">Amount (₹)</span>
                            <input name="amount" type="number" min="1" step="0.01" max={p.amount - p.refunded} defaultValue={p.amount - p.refunded} className="winput" required />
                          </label>
                        </ConfirmAction>
                      )}
                      {p.payout && ["scheduled", "failed"].includes(p.payout.status) && (
                        <ConfirmAction label="Hold payout" title={`Hold payout ${p.payout.referenceId}?`} description="It won't go out until someone releases it." action={holdPayoutAction} hidden={{ ref: p.payout.referenceId }} reason={{ required: true }} />
                      )}
                      {p.payout && ["on_hold", "failed"].includes(p.payout.status) && (
                        <ConfirmAction
                          label={p.payout.status === "failed" ? "Retry payout" : "Release payout"}
                          title={`${p.payout.status === "failed" ? "Retry" : "Release"} payout ${p.payout.referenceId}?`}
                          description="It goes out on its date, or now if that has passed."
                          action={releasePayoutAction}
                          hidden={{ ref: p.payout.referenceId }}
                          variant="primary"
                        />
                      )}
                      {p.needsAttention && (
                        <ConfirmAction label="Mark looked at" title="Clear the flag?" description={p.attentionNote ?? undefined} action={resolveAttentionAction} hidden={{ ref: p.referenceId }} reason={{ required: false, label: "What you found (optional)" }} />
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} params={params} basePath="/payments" />
      </Card>
    </>
  );
}
