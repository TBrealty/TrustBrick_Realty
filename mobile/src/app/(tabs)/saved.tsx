import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, RefreshControl, View } from "react-native";
import { api } from "@/api/client";
import type { ListingSummary } from "@/api/types";
import { useSession } from "@/auth/session";
import { ListingCard } from "@/components/listing-card";
import { SignedOut } from "@/components/signed-out";
import { Button, Display, EmptyState, ErrorState, Loading, Screen } from "@/components/ui";
import { useColors } from "@/theme";

/** Saved homes. Saving keeps the home, even if its listing changes. */
export default function Saved() {
  const c = useColors();
  const { status } = useSession();
  const saved = useQuery({ queryKey: ["bookmarks"], queryFn: () => api<{ items: ListingSummary[] }>("/bookmarks"), enabled: status === "signedIn" });

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Display size={32}>Saved homes</Display>
      </View>
      {status !== "signedIn" ? (
        <SignedOut icon="heart-outline" title="Keep a shortlist">
          Sign in to save homes and find them again on any device.
        </SignedOut>
      ) : saved.isPending ? (
        <Loading />
      ) : saved.isError ? (
        <ErrorState error={saved.error} onRetry={() => saved.refetch()} />
      ) : (
        <FlatList
          data={saved.data.items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <ListingCard listing={item} saved />}
          contentContainerStyle={{ padding: 16, gap: 26, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={saved.isRefetching} onRefresh={() => saved.refetch()} tintColor={c.brick} />}
          ListEmptyComponent={
            <EmptyState icon="heart-outline" title="Nothing saved yet" action={<Button label="Explore homes" compact onPress={() => router.navigate("/")} />}>
              Tap the heart on any home to keep it here.
            </EmptyState>
          }
        />
      )}
    </Screen>
  );
}
