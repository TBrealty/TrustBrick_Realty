import type { Metadata } from "next";
import { ServicePage } from "@/components/navigation/ServicePage";
import { MoveInCalculator } from "@/components/rent/MoveInCalculator";
import { ToolIntro, numberParam } from "@/components/tools/ToolIntro";
import { SERVICE_SHELLS } from "@/lib/listings/services";
import type { Brokerage } from "@/lib/rent/move-in";

export const metadata: Metadata = {
  title: "Move-in costs for a rented home — Trustbrick",
  description: "Work out the cash you need to rent a home in India: security deposit, advance rent, brokerage and the agreement, and what you'll pay each month.",
};

const shell = SERVICE_SHELLS.rent!;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MoveInCostsPage({ searchParams }: Props) {
  const q = await searchParams;
  const brokerage = one(q.brokerage);
  const start = {
    rent: numberParam(q.rent, 3_000, 3_00_000, 25_000),
    depositMonths: Math.round(numberParam(q.deposit, 0, 12, 3)),
    advanceMonths: Math.round(numberParam(q.advance, 0, 3, 1)),
    brokerage: (brokerage === "none" || brokerage === "half" || brokerage === "one" ? brokerage : "one") as Brokerage,
    maintenance: numberParam(q.maintenance, 0, 25_000, 0),
    agreement: numberParam(q.agreement, 0, 25_000, 2_000),
    moving: numberParam(q.moving, 0, 1_00_000, 0),
    termMonths: Math.round(numberParam(q.term, 1, 36, 11)),
  };

  return (
    <ServicePage shell={shell} current="move-in" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Move-in costs" title={<>What it takes to <em>get the keys.</em></>}>
        Renting needs more than the first month&apos;s rent. Add the deposit, the advance, any brokerage and the agreement to see the cash you&apos;ll need on the day, and what
        you&apos;ll pay each month after.
      </ToolIntro>
      <div className="mt-10">
        <MoveInCalculator start={start} />
      </div>
    </ServicePage>
  );
}
