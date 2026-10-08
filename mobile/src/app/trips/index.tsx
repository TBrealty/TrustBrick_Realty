import { useQuery } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { api } from "@/api/client";
import type { Trip } from "@/api/types";
import { Badge, Body, Button, Card, EmptyState, ErrorState, Loading, Small } from "@/components/ui";
import { formatDay, formatPrice } from "@/lib/format";
import { BOOKING_STATUS_TONES, nightsLabel } from "@/lib/stays/labels";
import { useColors } from "@/theme";

/** The person's stays: requests, upcoming and past. */
export default function Trips() {
  const c = useColors();
  const trips = useQuery({ queryKey: ["trips"], queryFn: () => api<{ items: Trip[] }>("/trips") });
  if (trips.isPending) return <Loading />;
  if (trips.isError) return <ErrorState error={trips.error} onRetry={() => trips.refetch()} />;
  return (
    <FlatList
      data={trips.data.items}
      keyExtractor={(t) => t.referenceId}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={trips.isRefetching} onRefresh={() => trips.refetch()} tintColor={c.brick} />}
      renderItem={({ item }) => (
        <Link href={`/trips/${item.referenceId}`} asChild>
          <Pressable accessibilityRole="link">
            {({ pressed }) => (
              <Card style={{ opacity: pressed ? 0.8 : 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Body style={{ flex: 1 }} numberOfLines={1}>
                    {item.listing.title}
                  </Body>
                  <Badge label={item.statusLabel} tone={BOOKING_STATUS_TONES[item.status]} />
                </View>
                <Small>
                  {formatDay(item.checkIn)} – {formatDay(item.checkOut)} · {nightsLabel(item.nights)} · {item.listing.locality}
                </Small>
                <Small tone="graphite">
                  {formatPrice(item.total, { compact: false })} · host {item.hostName}
                </Small>
              </Card>
            )}
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={
        <EmptyState icon="bed-outline" title="No stays yet" action={<Button label="Find a stay" compact onPress={() => router.navigate("/")} />}>
          Book a home stay and it shows up here, with the address once the host confirms.
        </EmptyState>
      }
    />
  );
}
