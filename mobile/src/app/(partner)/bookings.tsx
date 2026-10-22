import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { api, query } from "@/api/client";
import type { BookingGroup, HostBooking, Page } from "@/api/types";
import { useSession } from "@/auth/session";
import { useTabBarSpace } from "@/components/tab-bar";
import { Badge, Body, Chip, Display, EmptyState, ErrorState, Loading, Screen, Small } from "@/components/ui";
import { formatDateTime, formatDay, formatPrice } from "@/lib/format";
import { BOOKING_STATUS_TONES, nightsLabel } from "@/lib/stays/labels";
import { fonts, useColors } from "@/theme";

const GROUPS: [BookingGroup, string][] = [
  ["requests", "Requests"],
  ["upcoming", "Upcoming"],
  ["past", "Past"],
  ["cancelled", "Cancelled"],
];

/** Bookings for the host's stays: requests to answer first, then upcoming arrivals. */
export default function Bookings() {
  const c = useColors();
  const space = useTabBarSpace();
  const { workspace } = useSession();
  const [group, setGroup] = useState<BookingGroup>("requests");
  const list = useQuery({
    queryKey: ["partner-bookings", workspace, group],
    queryFn: () => api<Page<HostBooking> & { counts: Record<BookingGroup, number> }>(`/partner/bookings${query({ group })}`),
  });

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <Display size={34}>Bookings</Display>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {GROUPS.map(([key, label]) => (
            <Chip key={key} label={list.data && list.data.counts[key] ? `${label} ${list.data.counts[key]}` : label} selected={group === key} onPress={() => setGroup(key)} />
          ))}
        </ScrollView>
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={list.data.rows}
          keyExtractor={(b) => b.referenceId}
          contentContainerStyle={{ padding: 16, gap: 2, flexGrow: 1, paddingBottom: space }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => (
            <Link href={`/partner/booking/${item.referenceId}`} asChild>
              <Pressable accessibilityRole="link" style={({ pressed }) => ({ paddingVertical: 12, gap: 3, opacity: pressed ? 0.7 : 1, borderBottomWidth: 1, borderBottomColor: c.line })}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Body style={{ fontFamily: fonts.medium, flex: 1 }} numberOfLines={1}>
                    {item.guestName}
                  </Body>
                  <Badge label={item.statusLabel} tone={BOOKING_STATUS_TONES[item.status]} />
                </View>
                <Small numberOfLines={1}>{item.listing.title}</Small>
                <Small style={{ fontSize: 12 }}>
                  {formatDay(item.checkIn)} – {formatDay(item.checkOut)} · {nightsLabel(item.nights)} · {item.adults + item.children} guests · {formatPrice(item.total, { compact: false })}
                </Small>
                {item.status === "requested" && item.expiresAt && <Small tone="amber">Answer by {formatDateTime(item.expiresAt)}</Small>}
              </Pressable>
            </Link>
          )}
          ListEmptyComponent={
            <EmptyState icon="calendar-outline" title={group === "requests" ? "No requests to answer" : "Nothing here"}>
              New booking requests arrive here and as notifications.
            </EmptyState>
          }
        />
      )}
    </Screen>
  );
}
