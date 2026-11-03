import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePage } from "@/components/listings/PlacePage";
import type { RawSearchParams } from "@/lib/listings/filters";
import { findPlace, placeMetadata } from "@/lib/listings/places";

type Params = Promise<{ city: string; locality: string }>;

/** PG listings in one locality, e.g. /pg/hyderabad/kondapur. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city, locality } = await params;
  const place = await findPlace("pg", city, locality);
  if (!place) notFound();
  return placeMetadata(place);
}

export default function Page({ params, searchParams }: { params: Params; searchParams: Promise<RawSearchParams> }) {
  return <PlacePage kind="pg" params={params} searchParams={searchParams} />;
}
