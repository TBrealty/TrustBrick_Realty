import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { fakePayAction } from "@/app/(browse)/listings/payment-actions";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { paymentDriver } from "@/lib/payments";
import { FAKE_OUTCOMES } from "@/lib/payments/fake";

export const metadata: Metadata = { title: "Test payment — Trustbrick", robots: { index: false } };

type Props = { params: Promise<{ order: string }>; searchParams: Promise<{ session?: string }> };

/**
 * The fake provider's checkout, for development: choose how the payment goes. Only exists while the
 * fake driver is in use, which is never on the live site.
 */
export default async function TestPaymentPage({ params, searchParams }: Props) {
  const { order } = await params;
  const { session: sessionId } = await searchParams;
  if (paymentDriver()?.name !== "fake") notFound();
  const { user } = await requireSession(`/pay/test/${order}?session=${sessionId ?? ""}`);
  const { rows } = await db.execute(sql`
    SELECT p.amount, p.status, p.capture, p.session_id, l.title, b.reference_id AS booking_ref
      FROM finance.payments p JOIN stays.bookings b ON b.id = p.booking_id JOIN marketplace.listings l ON l.id = b.listing_id
     WHERE p.provider_order_id = ${order} AND p.guest_user_id = ${user.id}`);
  const p = rows[0] as { amount: string; status: string; capture: string; session_id: string | null; title: string; booking_ref: string } | undefined;
  if (!p || (p.session_id && p.session_id !== sessionId)) notFound();

  return (
    <main className="min-h-dvh bg-paper px-4 py-12">
      <div className="mx-auto max-w-md border border-line-light bg-card">
        <div className="border-b border-dashed border-amber bg-amber/10 px-5 py-3 text-[0.8125rem]">
          <strong>Test payment.</strong> This page stands in for the payment provider on a development machine. No money moves.
        </div>
        <div className="p-5">
          <p className="text-[0.8125rem] text-stone-deep">Paying Trustbrick for {p.booking_ref}</p>
          <p className="mt-1 font-medium">{p.title}</p>
          <p className="display mt-4 text-[2.25rem] leading-none">{formatMoney(Number(p.amount))}</p>
          <p className="mt-1 text-[0.8125rem] text-stone-deep">
            {p.capture === "manual" ? "Held on the card or UPI until the host accepts." : "Taken straight away."} Order {order}.
          </p>
          {p.status !== "created" ? (
            <p className="mt-6 border-l-2 border-line-light px-3 py-2 text-[0.9375rem]">This order is already {p.status}.</p>
          ) : (
            <form action={fakePayAction} className="mt-6 space-y-2">
              <input type="hidden" name="order" value={order} />
              {Object.entries(FAKE_OUTCOMES).map(([key, o]) => (
                <button key={key} type="submit" name="outcome" value={key} className="flex w-full flex-col items-start border border-line-light bg-paper px-4 py-3 text-left hover:border-ink">
                  <span className="font-medium">{o.label}</span>
                  <span className="text-[0.8125rem] text-stone-deep">{o.hint}</span>
                </button>
              ))}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
