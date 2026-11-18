import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/stays/PrintButton";
import { requireSession } from "@/lib/auth/session";
import { unseal } from "@/lib/crypto/sealed";
import { AppError } from "@/lib/errors";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { LEGAL } from "@/lib/legal";
import { rentReceipt } from "@/lib/services/rent/payments";
import { site } from "@/lib/site";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Rent receipt ${(await params).ref} — Trustbrick`, robots: { index: false, follow: false } };
}

const METHOD: Record<string, string> = { card: "Card", upi: "UPI", netbanking: "Net banking", wallet: "Wallet" };

/**
 * A rent receipt, laid out to print on one A4 page ("Download PDF" prints to PDF). It names the
 * landlord and shows their PAN, which an HRA claim needs once the year's rent is over ₹1 lakh.
 */
export default async function RentReceiptPage({ params }: Props) {
  const { ref } = await params;
  const { user } = await requireSession(`/account/rent/receipts/${ref}`);
  const r = await rentReceipt(user.id, ref, unseal).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const placeholder = (v: string) => (v.startsWith("[") ? null : v);

  return (
    <main className="min-h-dvh bg-paper px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between gap-3 print:hidden">
        <Link href="/account/rent" className="text-[0.875rem] text-stone-deep hover:text-ink">
          ← Back to your rent
        </Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-2xl border border-line-light bg-white p-8 text-[0.9375rem] text-ink print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink pb-5">
          <div>
            <p className="display text-[1.75rem] leading-none">{site.name}</p>
            <p className="mt-2 text-[0.8125rem] text-stone-deep">{LEGAL.company}</p>
            {placeholder(LEGAL.registeredOffice) && <p className="text-[0.8125rem] text-stone-deep">{LEGAL.registeredOffice}</p>}
          </div>
          <div className="text-right">
            <p className="text-[1.125rem] font-medium">Rent receipt</p>
            <p className="mt-1 font-mono text-[0.8125rem]">{r.paymentReferenceId}</p>
            <p className="text-[0.8125rem] text-stone-deep">{formatDateTime(r.paidAt)}</p>
          </div>
        </header>

        <p className="py-5 text-[1rem] leading-relaxed">
          Received from <strong className="font-medium">{r.tenantName}</strong> the sum of <strong className="font-medium">{formatMoney(r.amount)}</strong> as rent for{" "}
          <strong className="font-medium">{r.periodLabel}</strong> for the property at {r.propertyAddress}, on behalf of the landlord, <strong className="font-medium">{r.landlordName}</strong>.
        </p>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-y border-line-light py-5 sm:grid-cols-2">
          <div>
            <dt className="text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Tenant</dt>
            <dd className="mt-1">{r.tenantName}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Landlord</dt>
            <dd className="mt-1">{r.landlordName}</dd>
            <dd className="text-[0.8125rem] text-graphite">PAN {r.landlordPan ?? "not given"}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Property</dt>
            <dd className="mt-1">{r.propertyTitle}</dd>
            <dd className="text-[0.8125rem] text-graphite">{r.propertyAddress}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Rent</dt>
            <dd className="mt-1">
              {r.periodLabel}, due {formatDay(r.dueDate)}
            </dd>
            <dd className="text-[0.8125rem] text-graphite">Tenancy {r.tenancyReferenceId}</dd>
          </div>
        </dl>

        <table className="mt-5 w-full text-left">
          <tbody>
            <tr className="border-b border-line-light">
              <td className="py-2">Rent for {r.periodLabel}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(r.amount)}</td>
            </tr>
            <tr>
              <td className="py-2 font-medium">Paid{r.method ? ` by ${METHOD[r.method] ?? r.method}` : ""}</td>
              <td className="py-2 text-right font-medium tabular-nums">{formatMoney(r.amount)}</td>
            </tr>
          </tbody>
        </table>
        {r.refunded && <p className="mt-3 border-l-2 border-amber px-3 py-2 text-[0.875rem]">This payment was later refunded to you in full.</p>}

        <footer className="mt-8 border-t border-line-light pt-4 text-[0.75rem] text-stone-deep">
          Collected by {LEGAL.company} for the landlord through {site.name}. Keep this receipt for an HRA claim; the landlord&apos;s PAN is needed once the year&apos;s rent is more than
          ₹1,00,000.
        </footer>
      </article>
    </main>
  );
}
