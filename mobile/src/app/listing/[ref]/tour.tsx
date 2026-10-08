import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ApiError, api } from "@/api/client";
import type { ListingDetail, TourData } from "@/api/types";
import { TourPlayer } from "@/components/tour-player";
import { Button, EmptyState, ErrorState, Loading } from "@/components/ui";

/** A listing's virtual tour, for Plus members. */
export default function TourScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const tour = useQuery({ queryKey: ["tour", ref], queryFn: () => api<TourData>(`/listings/${ref}/tour`), staleTime: 5 * 60_000 });
  const title = useQueryClient().getQueryData<ListingDetail>(["listing", ref])?.title ?? "this home";

  if (tour.isPending) return <Loading label="Loading the tour" />;
  if (tour.isError) {
    const e = tour.error;
    if (e instanceof ApiError && (e.reason === "PLUS_REQUIRED" || e.reason === "SIGN_IN_REQUIRED")) {
      return (
        <EmptyState
          icon="lock-closed-outline"
          title="Virtual tours are part of Plus"
          action={<Button label={e.reason === "SIGN_IN_REQUIRED" ? "Sign in" : "See Trustbrick Plus"} variant="accent" onPress={() => router.replace(e.reason === "SIGN_IN_REQUIRED" ? "/sign-in" : "/plans")} />}
        >
          Walk through homes room by room before you visit. Plus starts with a free trial.
        </EmptyState>
      );
    }
    return <ErrorState error={e} onRetry={() => tour.refetch()} />;
  }
  return <TourPlayer tour={tour.data} title={title} />;
}
