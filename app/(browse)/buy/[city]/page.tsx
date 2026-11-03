import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePage } from "@/components/listings/PlacePage";
import type { RawSearchParams } from "@/lib/listings/filters";
import { findPlace, placeMetadata } from "@/lib/listings/places";

type Params = Promise<{ city: string }>;

/** Buy listings in one city, e.g. /buy/hyderabad. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city } = await params;
  const place = await findPlace("buy", city);
  if (!place) notFound();
  return placeMetadata(place);
}

export default function Page({ params, searchParams }: { params: Params; searchParams: Promise<RawSearchParams> }) {
  return <PlacePage kind="buy" params={params} searchParams={searchParams} />;
}
