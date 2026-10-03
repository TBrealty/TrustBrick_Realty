import type { Metadata } from "next";
import { ServicePage } from "@/components/navigation/ServicePage";
import { CompareCalculator } from "@/components/pg/CompareCalculator";
import { ToolIntro, numberParam } from "@/components/tools/ToolIntro";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "PG or shared flat? Compare the costs — Trustbrick",
  description: "Compare a PG bed with sharing a rented flat: the monthly cost per person, the money up front, and what each includes.",
};

const shell = SERVICE_SHELLS.pg!;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PgComparePage({ searchParams }: Props) {
  const q = await searchParams;
  const start = {
    pgRent: numberParam(q.pg, 3_000, 40_000, 10_000),
    pgMealsIncluded: one(q.meals) !== undefined ? one(q.meals) === "1" : true,
    pgExtras: numberParam(q.extras, 0, 10_000, 500),
    pgDepositMonths: 1,
    flatRent: numberParam(q.flat, 5_000, 2_00_000, 30_000),
    flatmates: Math.round(numberParam(q.people, 1, 8, 3)),
    flatDepositMonths: 3,
    flatUtilities: numberParam(q.utilities, 0, 20_000, 3_000),
    flatHelp: numberParam(q.help, 0, 30_000, 4_000),
    flatMaintenance: 2_000,
    flatBrokerageMonths: 1,
    foodPerPerson: numberParam(q.food, 0, 30_000, 6_000),
  };

  return (
    <ServicePage shell={shell} current="compare" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="PG or shared flat?" title={<>A bed in a PG, or a room <em>in a shared flat?</em></>}>
        Put in what each would cost and see your share, each month and up front. The starting figures are only examples: change them to what you&apos;re being offered.
      </ToolIntro>
      <div className="mt-10">
        <CompareCalculator start={start} />
      </div>
    </ServicePage>
  );
}
