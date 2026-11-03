import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePage } from "@/components/listings/PlacePage";
import type { RawSearchParams } from "@/lib/listings/filters";
import { findPlace, placeMetadata } from "@/lib/listings/places";

type Params = Promise<{ city: string; locality: string }>;

/** Stay listings in one locality, e.g. /stays/hyderabad/kondapur. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city, locality } = await params;
  const place = await findPlace("stay", city, locality);
  if (!place) notFound();
  return placeMetadata(place);
}

export default function Page({ params, searchParams }: { params: Params; searchParams: Promise<RawSearchParams> }) {
  return <PlacePage kind="stay" params={params} searchParams={searchParams} />;
}
