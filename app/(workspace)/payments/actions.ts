"use server";

import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { adminRefund, holdPayout, releasePayout, resolveAttention, retryRefund, settlePayments } from "@/lib/services/stays/payments";
import { assertCan } from "@/lib/authz";

type Result = ActionResult<unknown>;
const pages = ["/payments", "/payouts", "/bookings"];

export async function refundAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("payments.refund", (a, ctx) => adminRefund(a, text(form, "ref"), formObject(form), ctx), { revalidate: pages });
  return r.ok ? { ok: true, message: `Refund of ${formatMoney((r.data as { amount: number }).amount)} sent.` } : r;
}

export async function holdPayoutAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("payments.hold", (a, ctx) => holdPayout(a, text(form, "ref"), text(form, "reason"), ctx), { revalidate: pages });
  return r.ok ? { ok: true, message: "Payout held. It won't go out until released." } : r;
}

export async function releasePayoutAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("payments.release", (a, ctx) => releasePayout(a, text(form, "ref"), ctx), { revalidate: pages });
  return r.ok ? { ok: true, message: "Released. It goes out on its date, or now if that has passed." } : r;
}

export async function retryRefundAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("payments.retry_refund", (a, ctx) => retryRefund(a, text(form, "ref"), ctx), { revalidate: pages });
  return r.ok ? { ok: true, message: "Refund sent again." } : r;
}

export async function resolveAttentionAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("payments.resolve", (a, ctx) => resolveAttention(a, text(form, "ref"), text(form, "reason"), ctx), { revalidate: pages });
  return r.ok ? { ok: true, message: "Marked as looked at." } : r;
}

/** Runs the payments job now, rather than waiting up to five minutes. */
export async function settleNowAction(): Promise<Result> {
  const r = await runAction(
    "payments.settle",
    async (a) => {
      assertCan(a, "payments.manage", "platform");
      return settlePayments();
    },
    { revalidate: pages },
  );
  if (!r.ok) return r;
  const s = r.data as Awaited<ReturnType<typeof settlePayments>>;
  return { ok: true, message: `Done: ${s.captured} taken, ${s.released} released, ${s.refunded} refunded, ${s.paidOut} paid out${s.failed ? `, ${s.failed} failed` : ""}.` };
}
