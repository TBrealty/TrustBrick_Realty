import { type QueryClient, useQuery } from "@tanstack/react-query";
import { ApiError, api } from "@/api/client";
import type { ListingWorkspace, OnboardingOptions } from "@/api/workspace-types";
import { useSession } from "@/auth/session";

/** The partner workspace's shared queries: one listing's workspace, and the onboarding choices. */

export const workspaceKey = (ref: string) => ["partner-workspace", ref] as const;

export function useListingWorkspace(ref: string) {
  return useQuery({ queryKey: workspaceKey(ref), queryFn: () => api<ListingWorkspace>(`/partner/listings/${ref}/workspace`) });
}

export function useOnboardingOptions() {
  const { workspace } = useSession();
  return useQuery({ queryKey: ["onboarding-options", workspace], queryFn: () => api<OnboardingOptions>("/partner/onboarding/options"), staleTime: 10 * 60_000 });
}

/** After a change to a listing: its workspace, the lists it shows in, the tour editor and today's numbers. */
export function refreshListing(queryClient: QueryClient, ref: string) {
  void queryClient.invalidateQueries({ queryKey: workspaceKey(ref) });
  void queryClient.invalidateQueries({ queryKey: ["partner-listing", ref] });
  void queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
  void queryClient.invalidateQueries({ queryKey: ["partner-dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["partner-summary"] });
}

/** The server's messages for a form: a field's message by its name, and anything else. */
export function formErrors(error: unknown): { fields: Record<string, string>; message: string | null } {
  if (!error) return { fields: {}, message: null };
  if (error instanceof ApiError) return { fields: error.fieldErrors ?? {}, message: error.fieldErrors?._form ?? error.message };
  return { fields: {}, message: error instanceof Error ? error.message : "Something went wrong." };
}
