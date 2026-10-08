import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/api/client";
import { useSession } from "@/auth/session";

/**
 * Saving a home. Signed out, it asks to sign in first. The heart changes straight away and
 * everything showing saved homes refreshes after.
 */
export function useSave() {
  const queryClient = useQueryClient();
  const { status } = useSession();
  const mutation = useMutation({
    mutationFn: ({ referenceId, save }: { referenceId: string; save: boolean }) => api(`/bookmarks/${referenceId}`, { method: save ? "PUT" : "DELETE" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      void queryClient.invalidateQueries({ queryKey: ["listing"] });
    },
  });
  return (referenceId: string, save: boolean) => {
    if (status !== "signedIn") {
      router.push("/sign-in");
      return;
    }
    mutation.mutate({ referenceId, save });
  };
}
