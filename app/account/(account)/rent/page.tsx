import type { Metadata } from "next";
import Link from "next/link";
import { PayRentButton } from "@/components/rent/PayRentButton";
import { requireSession } from "@/lib/auth/session";
import { formatDay, formatMoney } from "@/lib/format";
import { rentOnline } from "@/lib/services/rent/common";
import { chargesForTenancy } from "@/lib/services/rent/payments";
import { ordinal, tenantTenancies } from "@/lib/services/rent/tenancies";

export const metadata: Metadata = { title: "Rent — Trustbrick" };

const METHOD: Record<string, string> = { card: "Card", upi: "UPI", netbanking: "Net banking", wallet: "Wallet" };

/** A tenant's rent: what's due (with Pay), what's been paid (with receipts), for each tenancy. */
export default async function RentPage() {
  const { user } = await requireSession("/account/rent");
  const [tenancies, online] = await Promise.all([tenantTenancies(user.id), rentOnline()]);
  const withCharges = await Promise.all(tenancies.map(async (t) => ({ t, charges: await chargesForTenancy(t.referenceId) })));

  return (
    <div>
      <p className="eyebrow flex items-center gap-3 text-brick">
        <span aria-hidden className="h-px w-8 bg-current" />
        Rent
      </p>
      <h1 className="display mt-6 mb-10 text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95]">
        Your <em>rent.</em>
      </h1>

      {withCharges.length === 0 && (
        <p className="max-w-lg text-[0.9375rem] text-graphite">
          No tenancies yet. When your agent sets up your tenancy on Trustbrick, you&apos;ll get a link by email to accept it, and your rent appears here.
        </p>
      )}

      <div className="space-y-14">
        {withCharges.map(({ t, charges }) => {
          const due = charges.filter((c) => c.status === "due");
          const paid = charges.filter((c) => c.status === "paid");
          return (
            <section key={t.referenceId} aria-labelledby={`t-${t.referenceId}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-light pb-4">
                <div>
                  <h2 id={`t-${t.referenceId}`} className="text-[1.25rem] font-medium">
                    {t.title}
                  </h2>
                  <p className="text-[0.875rem] text-stone-deep">{t.address}</p>
                </div>
                <p className="text-[0.8125rem] text-stone-deep">
                  {t.status === "active" ? "Active" : t.status === "ended" ? `Ended${t.endDate ? ` ${formatDay(t.endDate)}` : ""}` : t.statusLabel} ·{" "}
                  <span className="font-mono">{t.referenceId}</span>
                </p>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[0.9375rem] sm:grid-cols-4">
                <div>
                  <dt className="text-[0.8125rem] text-stone-deep">Monthly rent</dt>
                  <dd className="font-medium">{formatMoney(t.monthlyRent)}</dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] text-stone-deep">Due on</dt>
                  <dd className="font-medium">The {ordinal(t.dueDay)} of each month</dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] text-stone-deep">Landlord</dt>
                  <dd className="font-medium">{t.landlordName}</dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] text-stone-deep">Deposit</dt>
                  <dd className="font-medium">{t.deposit ? formatMoney(t.deposit) : "None"}</dd>
                </div>
              </dl>

              {t.status !== "active" && t.status !== "ended" && (
                <p className="mt-5 border-l-2 border-amber bg-amber/10 px-4 py-3 text-[0.875rem] text-graphite">
                  {t.landlordConfirmed ? "" : `Waiting for ${t.landlordName} to confirm the terms. `}Rent can be paid here once the tenancy starts.
                </p>
              )}
              {t.status === "active" && !online && (
                <p className="mt-5 border-l-2 border-line-light bg-paper px-4 py-3 text-[0.875rem] text-graphite">
                  Paying rent online isn&apos;t open yet. Pay your landlord as you do now; we&apos;ll tell you when you can pay here.
                </p>
              )}
              {t.status === "active" && online && due.length === 0 && t.firstDueDate && (
                <p className="mt-5 text-[0.875rem] text-stone-deep">Nothing to pay right now. Each month&apos;s rent shows here a week before it&apos;s due.</p>
              )}

              {due.length > 0 && (
                <ul className="mt-6 space-y-3">
                  {due.map((c) => (
                    <li key={c.referenceId} className={`flex flex-wrap items-center justify-between gap-4 border-l-2 px-5 py-4 ${c.overdue ? "border-brick bg-brick/6" : "border-ink bg-paper"}`}>
                      <div>
                        <p className="text-[1.0625rem] font-medium">
                          {formatMoney(c.amount)} {c.overdue ? "overdue" : "due"} {formatDay(c.dueDate)}
                        </p>
                        <p className="text-[0.8125rem] text-stone-deep">UPI, debit card or net banking. No fee.</p>
                      </div>
                      {online && <PayRentButton chargeRef={c.referenceId} amount={c.amount} />}
                    </li>
                  ))}
                </ul>
              )}

              {paid.length > 0 && (
                <div className="mt-8">
                  <h3 className="eyebrow mb-3 text-stone-deep">Paid</h3>
                  <ul className="divide-y divide-line-light border-y border-line-light">
                    {paid.map((c) => (
                      <li key={c.referenceId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[0.9375rem]">
                        <span>
                          Rent due {formatDay(c.dueDate)} · {formatMoney(c.amount)}
                          {c.payment?.method && <span className="text-stone-deep"> · {METHOD[c.payment.method] ?? c.payment.method}</span>}
                        </span>
                        {c.payment && (
                          <Link href={`/account/rent/receipts/${c.payment.referenceId}`} className="text-[0.875rem] underline underline-offset-4">
                            Receipt
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
