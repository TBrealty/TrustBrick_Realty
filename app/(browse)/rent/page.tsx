import type { Metadata } from "next";
import { BrowsePage } from "@/components/listings/BrowsePage";
import { ServicePage } from "@/components/navigation/ServicePage";
import { parseFilters, type RawSearchParams } from "@/lib/listings/filters";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Homes for rent — Trustbrick",
  description: "Apartments, studios and houses to rent, with filters for rent, furnishing and availability.",
};

const shell = SERVICE_SHELLS.rent!;

export default async function RentPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const current = shell.sectionFor(parseFilters("rent", await searchParams));
  return (
    <ServicePage shell={shell} current={current}>
      <BrowsePage kind="rent" searchParams={searchParams} />
    </ServicePage>
  );
}
