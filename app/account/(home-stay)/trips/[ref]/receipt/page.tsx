import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/stays/PrintButton";
import { requireSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { LEGAL } from "@/lib/legal";
import { receiptFor } from "@/lib/services/stays/payments";
import { site } from "@/lib/site";
import { nightsLabel, timeLabel } from "@/lib/stays/labels";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Receipt for ${(await params).ref} — Trustbrick` };
}

const METHOD: Record<string, string> = { card: "Card", upi: "UPI", netbanking: "Net banking", wallet: "Wallet" };

/** A guest's receipt, laid out to print on one A4 page ("Download PDF" prints to PDF). */
export default async function ReceiptPage({ params }: Props) {
  const { ref } = await params;
  const { user } = await requireSession(`/account/trips/${ref}/receipt`);
  const r = await receiptFor(user.id, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const placeholder = (v: string) => (v.startsWith("[") ? null : v);

  return (
    <main className="min-h-dvh bg-paper px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between gap-3 print:hidden">
        <Link href={`/account/trips/${r.booking.referenceId}`} className="text-[0.875rem] text-stone-deep hover:text-ink">
          ← Back to your trip
        </Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-2xl border border-line-light bg-white p-8 text-[0.9375rem] text-ink print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink pb-5">
          <div>
            <p className="display text-[1.75rem] leading-none">{site.name}</p>
            <p className="mt-2 text-[0.8125rem] text-stone-deep">{LEGAL.company}</p>
            {placeholder(LEGAL.registeredOffice) && <p className="text-[0.8125rem] text-stone-deep">{LEGAL.registeredOffice}</p>}
            {placeholder(LEGAL.gstin) && <p className="text-[0.8125rem] text-stone-deep">GSTIN {LEGAL.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-[1.125rem] font-medium">Payment receipt</p>
            <p className="mt-1 font-mono text-[0.8125rem]">{r.receiptNumber}</p>
            <p className="text-[0.8125rem] text-stone-deep">{formatDateTime(r.issuedAt)}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-line-light py-5 sm:grid-cols-2">
          <div>
            <p className="text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Guest</p>
            <p className="mt-1">{r.guest.name}</p>
            <p className="text-[0.8125rem] text-graphite">{r.guest.email}</p>
            <p className="text-[0.8125rem] text-graphite">{r.guest.phone}</p>
          </div>
          <div>
            <p className="text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Stay</p>
            <p className="mt-1">{r.stay.title}</p>
            <p className="text-[0.8125rem] text-graphite">{r.stay.address}</p>
            <p className="text-[0.8125rem] text-graphite">Host: {r.stay.hostName}</p>
          </div>
        </section>

        <section className="border-b border-line-light py-5">
          <p className="text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Booking {r.booking.referenceId}</p>
          <p className="mt-1">
            {formatDay(r.booking.checkIn)} (from {timeLabel(r.booking.checkInTime)}) – {formatDay(r.booking.checkOut)} (by {timeLabel(r.booking.checkOutTime)}) ·{" "}
            {nightsLabel(r.booking.nights)} · {r.booking.guests} guest{r.booking.guests === 1 ? "" : "s"}
          </p>
          <table className="mt-4 w-full">
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.label}>
                  <td className="py-1 text-graphite">{l.label}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(l.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 text-graphite">Trustbrick service fee</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(0)}</td>
              </tr>
              <tr className="border-t border-ink font-medium">
                <td className="pt-2">Total paid</td>
                <td className="pt-2 text-right tabular-nums">{formatMoney(r.total)}</td>
              </tr>
              {r.refunds.map((x) => (
                <tr key={x.referenceId}>
                  <td className="py-1 text-graphite">
                    Refund {x.referenceId}, {formatDay(x.at)}
                    {x.status === "pending" ? " (on its way)" : ""}
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(-x.amount)}</td>
                </tr>
              ))}
              {r.refunds.length > 0 && (
                <tr className="border-t border-line-light font-medium">
                  <td className="pt-2">Paid after refunds</td>
                  <td className="pt-2 text-right tabular-nums">{formatMoney(r.netPaid)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="py-5 text-[0.8125rem] text-graphite">
          <p>
            Paid by {r.payment.method ? METHOD[r.payment.method] ?? r.payment.method : "online payment"} on {formatDateTime(r.payment.paidAt)}. Payment {r.payment.referenceId}
            {r.payment.providerPaymentId ? `, provider reference ${r.payment.providerPaymentId}` : ""}.
          </p>
          <p className="mt-2">Collected by {LEGAL.company} on behalf of the host. This is a receipt for your payment, not a tax invoice.</p>
        </section>
      </article>
    </main>
  );
}
