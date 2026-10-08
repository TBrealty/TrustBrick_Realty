import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/api/client";
import type { PartnerListing } from "@/api/types";
import { TourPlayer } from "@/components/tour-player";
import { ErrorState, Loading } from "@/components/ui";

/** The listing's tour as Plus members see it, for its own team (no Plus needed). */
export default function PartnerTourPreview() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const listing = useQuery({ queryKey: ["partner-listing", ref], queryFn: () => api<PartnerListing>(`/partner/listings/${ref}`) });
  if (listing.isPending) return <Loading label="Loading the tour" />;
  if (listing.isError) return <ErrorState error={listing.error} onRetry={() => listing.refetch()} />;
  const t = listing.data.tour;
  return <TourPlayer tour={{ rooms: t.rooms, model: t.model ? { url: t.model.url, name: t.model.name } : null, link: t.link }} title={listing.data.title} />;
}
