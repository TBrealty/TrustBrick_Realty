import type { Metadata } from "next";
import { BrowsePage } from "@/components/listings/BrowsePage";
import { ServicePage } from "@/components/navigation/ServicePage";
import { parseFilters, type RawSearchParams } from "@/lib/listings/filters";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "PGs and co-living — Trustbrick",
  description: "Paying-guest rooms for men, for women and co-living, with filters for room type, food and budget.",
};

const shell = SERVICE_SHELLS.pg!;

export default async function PgPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const current = shell.sectionFor(parseFilters("pg", await searchParams));
  return (
    <ServicePage shell={shell} current={current}>
      <BrowsePage kind="pg" searchParams={searchParams} />
    </ServicePage>
  );
}
