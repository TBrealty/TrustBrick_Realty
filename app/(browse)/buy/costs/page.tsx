import type { Metadata } from "next";
import { CostCalculator } from "@/components/buy/CostCalculator";
import { ToolIntro, numberParam } from "@/components/tools/ToolIntro";
import { ServicePage } from "@/components/navigation/ServicePage";
import { AFFORDABLE_LIMIT, placeFor } from "@/lib/buy/costs";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Cost of buying a home: stamp duty, registration and GST — Trustbrick",
  description: "See what buying a home really costs in Hyderabad, Bengaluru, Mumbai, Pune and Goa: stamp duty, registration, GST and the other one-off costs.",
};

const shell = SERVICE_SHELLS.buy!;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CostsPage({ searchParams }: Props) {
  const q = await searchParams;
  const price = numberParam(q.price, 5_00_000, 20_00_00_000, 75_00_000);
  const start = {
    price,
    place: placeFor(one(q.city)) ?? "hyderabad",
    buyer: one(q.buyer) === "woman" ? ("woman" as const) : ("man" as const),
    underConstruction: one(q.uc) === "1",
    affordable: one(q.affordable) === "1" && price <= AFFORDABLE_LIMIT,
    brokeragePct: numberParam(q.brokerage, 0, 3, 1),
    paperwork: numberParam(q.paperwork, 0, 2_00_000, 15_000),
  };

  return (
    <ServicePage shell={shell} current="costs" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Buying costs" title={<>The price, and <em>everything on top.</em></>}>
        Stamp duty, registration and, for homes still being built, GST are paid on top of the price, usually from your own savings rather than the home loan. See them before you make an offer.
      </ToolIntro>
      <div className="mt-10">
        <CostCalculator start={start} />
      </div>
    </ServicePage>
  );
}
