import type { Metadata } from "next";
import { YieldCalculator } from "@/components/invest/YieldCalculator";
import { ServicePage } from "@/components/navigation/ServicePage";
import { ToolIntro, numberParam } from "@/components/tools/ToolIntro";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Rental yield calculator — Trustbrick",
  description: "Work out the gross and net rental yield on a property in India, after empty months, maintenance, property tax and buying costs.",
};

const shell = SERVICE_SHELLS.invest!;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function YieldCalculatorPage({ searchParams }: Props) {
  const q = await searchParams;
  const start = {
    price: numberParam(q.price, 5_00_000, 50_00_00_000, 1_00_00_000),
    monthlyRent: numberParam(q.rent, 0, 20_00_000, 35_000),
    vacancyMonths: numberParam(q.vacancy, 0, 6, 1),
    maintenanceMonthly: numberParam(q.maintenance, 0, 1_00_000, 3_000),
    propertyTaxYearly: numberParam(q.tax, 0, 5_00_000, 8_000),
    otherYearly: numberParam(q.other, 0, 10_00_000, 15_000),
    acquisitionPct: numberParam(q.acquisition, 0, 15, 7),
  };

  return (
    <ServicePage shell={shell} current="yield" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Yield calculator" title={<>What does the rent <em>really return?</em></>}>
        The yield a listing quotes is usually gross: a year&apos;s rent over the price. Take off the months it stands empty and the costs an owner pays, and add what it costs to
        buy, to see the net figure.
      </ToolIntro>
      <div className="mt-10">
        <YieldCalculator start={start} />
      </div>
    </ServicePage>
  );
}
