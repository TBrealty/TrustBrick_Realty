import type { Metadata } from "next";
import { BrowsePage } from "@/components/listings/BrowsePage";
import { ServicePage } from "@/components/navigation/ServicePage";
import { parseFilters, type RawSearchParams } from "@/lib/listings/filters";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Properties to invest in — Trustbrick",
  description: "New launches, commercial spaces and plots, with filters for possession and declared rental yield.",
};

const shell = SERVICE_SHELLS.invest!;

export default async function InvestPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const current = shell.sectionFor(parseFilters("invest", await searchParams));
  return (
    <ServicePage shell={shell} current={current}>
      <BrowsePage kind="invest" searchParams={searchParams} />
    </ServicePage>
  );
}
