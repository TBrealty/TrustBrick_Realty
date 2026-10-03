import type { Metadata } from "next";
import Link from "next/link";
import { EmiCalculator } from "@/components/buy/EmiCalculator";
import { ToolIntro, numberParam } from "@/components/tools/ToolIntro";
import { ServicePage } from "@/components/navigation/ServicePage";
import { maxLoanToValue } from "@/lib/buy/emi";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Home loan EMI calculator — Trustbrick",
  description: "Work out the monthly EMI, total interest and down payment for a home loan in India, including the RBI's loan-to-value limits.",
};

const shell = SERVICE_SHELLS.buy!;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EmiCalculatorPage({ searchParams }: Props) {
  const q = await searchParams;
  const price = numberParam(q.price, 5_00_000, 20_00_00_000, 75_00_000);
  // Start at a 20% down payment, or the RBI minimum for this price if that's more.
  const fallbackDown = Math.round(Math.max(0.2, 1 - maxLoanToValue(price)) * price);
  const start = {
    price,
    down: numberParam(q.down, 0, price, fallbackDown),
    rate: numberParam(q.rate, 5, 15, 8.5),
    years: Math.round(numberParam(q.years, 1, 30, 20)),
  };

  return (
    <ServicePage shell={shell} current="emi" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="EMI calculator" title={<>What will the loan cost <em>each month?</em></>}>
        Move the price, down payment, rate and tenure to see your EMI, the interest over the life of the loan, and what&apos;s left to pay year by year.
      </ToolIntro>

      <div className="mt-10">
        <EmiCalculator start={start} />
      </div>

      <section aria-labelledby="how-emi" className="mt-16 grid grid-cols-1 gap-10 border-t border-line-light pt-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 id="how-emi" className="text-[1.25rem] font-medium">
            How an EMI works
          </h2>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-graphite">
            An equated monthly instalment stays the same for the whole loan, but what it pays for changes. Early on, most of it is interest on the large balance; as the balance
            falls, more of each EMI repays the loan itself. That&apos;s why a longer tenure lowers the EMI but raises the total interest, and why paying a little extra early on
            saves the most.
          </p>
        </div>
        <div>
          <h2 className="text-[1.25rem] font-medium">How much banks will lend</h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-graphite">
            The Reserve Bank of India caps a housing loan at a share of the home&apos;s value. The rest is your down payment. Stamp duty and registration are usually paid on top.
          </p>
          <table className="mt-4 w-full max-w-md text-left text-[0.9375rem]">
            <caption className="sr-only">Maximum loan by property value</caption>
            <thead className="text-[0.8125rem] text-stone-deep">
              <tr className="border-b border-line-light">
                <th scope="col" className="py-2 font-normal">
                  Property value
                </th>
                <th scope="col" className="py-2 font-normal">
                  Bank can lend up to
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Up to ₹30 lakh", "90%"],
                ["₹30 – 75 lakh", "80%"],
                ["Above ₹75 lakh", "75%"],
              ].map(([band, ltv]) => (
                <tr key={band} className="border-b border-line-light">
                  <td className="py-2">{band}</td>
                  <td className="py-2">{ltv}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-[0.875rem] text-stone-deep">
            Next:{" "}
            <Link href={`/buy/costs?price=${price}`} className="underline">
              add stamp duty, registration and GST
            </Link>{" "}
            to see the full cost of buying.
          </p>
        </div>
      </section>
    </ServicePage>
  );
}
