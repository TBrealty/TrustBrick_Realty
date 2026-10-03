import type { Metadata } from "next";
import { BrowsePage } from "@/components/listings/BrowsePage";
import { ServicePage } from "@/components/navigation/ServicePage";
import { parseFilters, type RawSearchParams } from "@/lib/listings/filters";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Homes and plots for sale — Trustbrick",
  description: "Apartments, villas, houses and plots for sale, including new launches, with filters for budget, bedrooms, size and location.",
};

const shell = SERVICE_SHELLS.buy!;

/** Buy is a dedicated service: its own header and footer, and nothing about renting or staying. */
export default async function BuyPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const current = shell.sectionFor(parseFilters("buy", await searchParams));
  return (
    <ServicePage shell={shell} current={current}>
      <BrowsePage kind="buy" searchParams={searchParams} />
    </ServicePage>
  );
}
