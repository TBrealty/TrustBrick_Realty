import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import { assetUrl } from "@/api/client";
import type { ListingSummary } from "@/api/types";
import { PressableScale, thud } from "@/components/motion";
import { Badge, Body, Small } from "@/components/ui";
import { useSave } from "@/hooks/use-save";
import { keyFacts, priceParts } from "@/lib/listings/describe";
import { tourBadge } from "@/lib/tours/terms";
import { fonts, radius, useColors } from "@/theme";

/** The heart on a listing photo: saves the home, with a little pop and a tap you can feel. */
function SaveHeart({ referenceId, saved, size = 40 }: { referenceId: string; saved?: boolean; size?: number }) {
  const toggle = useSave();
  const [isSaved, setSaved] = useState(Boolean(saved));
  const pop = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <PressableScale
      scaleTo={0.88}
      accessibilityRole="button"
      accessibilityLabel={isSaved ? "Remove from saved homes" : "Save this home"}
      accessibilityState={{ selected: isSaved }}
      hitSlop={8}
      onPress={(e) => {
        // On the web preview the card is a link; the heart mustn't follow it.
        e.preventDefault?.();
        e.stopPropagation?.();
        thud();
        if (!isSaved) pop.set(withSequence(withSpring(1.3, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 10, stiffness: 300 })));
        toggle(referenceId, !isSaved);
        setSaved((s) => !s);
      }}
      style={{ position: "absolute", top: 10, right: 10, width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(13,17,25,0.38)", alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={style}>
        <Ionicons name={isSaved ? "heart" : "heart-outline"} size={size * 0.52} color={isSaved ? "#f08a64" : "#ffffff"} />
      </Animated.View>
    </PressableScale>
  );
}

function Badges({ listing }: { listing: ListingSummary }) {
  const inactive = listing.status !== "published";
  return (
    <View style={{ position: "absolute", top: 12, left: 12, flexDirection: "row", gap: 6, flexWrap: "wrap", right: 60 }}>
      {listing.isSample && <Badge label="Sample" tone="contrast" />}
      {inactive && <Badge label="No longer listed" />}
      {!inactive && listing.offer && <Badge label="Offer" tone="danger" />}
      {!inactive && listing.tour && <Badge label={tourBadge(listing.tour)} tone="contrast" />}
    </View>
  );
}

const open = (referenceId: string) => router.push(`/listing/${referenceId}`);

/** A listing in a list: a large photo, price, title, place and key facts. */
export function ListingCard({ listing, saved }: { listing: ListingSummary; saved?: boolean }) {
  const c = useColors();
  const price = priceParts(listing);
  const facts = keyFacts(listing);
  const inactive = listing.status !== "published";

  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => open(listing.referenceId)}
      accessibilityRole="link"
      accessibilityLabel={`${listing.title}, ${price.prefix ?? ""} ${price.amount} ${price.suffix ?? ""}, ${listing.locality}`}
      style={{ gap: 12, opacity: inactive ? 0.7 : 1 }}
    >
      <View style={{ aspectRatio: 4 / 3, borderRadius: radius.xxl, overflow: "hidden", backgroundColor: c.sand }}>
        {listing.image ? <Image source={{ uri: assetUrl(listing.image) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} /> : null}
        <Badges listing={listing} />
        <SaveHeart referenceId={listing.referenceId} saved={saved} />
      </View>
      <View style={{ gap: 3, paddingHorizontal: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 5 }}>
          {price.prefix ? <Small>{price.prefix}</Small> : null}
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: c.text }}>{price.amount}</Text>
          {price.suffix ? <Small>{price.suffix}</Small> : null}
          {listing.priceNegotiable ? <Small>· Negotiable</Small> : null}
        </View>
        {!inactive && listing.offer ? <Small tone="brick">{listing.offer.title}</Small> : null}
        <Body style={{ fontFamily: fonts.medium }} numberOfLines={2}>
          {listing.title}
        </Body>
        <Small>
          {listing.locality}
          {listing.city ? `, ${listing.city}` : ""}
        </Small>
        {facts.length > 0 && <Small tone="graphite">{facts.join("  ·  ")}</Small>}
      </View>
    </PressableScale>
  );
}

/** A smaller listing card for the home screen's sideways collections. */
export function ListingTile({ listing, saved, width }: { listing: ListingSummary; saved?: boolean; width: number }) {
  const c = useColors();
  const price = priceParts(listing);
  return (
    <PressableScale
      scaleTo={0.97}
      onPress={() => open(listing.referenceId)}
      accessibilityRole="link"
      accessibilityLabel={`${listing.title}, ${price.prefix ?? ""} ${price.amount} ${price.suffix ?? ""}, ${listing.locality}`}
      style={{ width, gap: 10 }}
    >
      <View style={{ height: width * 0.72, borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.sand }}>
        {listing.image ? <Image source={{ uri: assetUrl(listing.image) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} /> : null}
        <Badges listing={listing} />
        <SaveHeart referenceId={listing.referenceId} saved={saved} size={34} />
      </View>
      <View style={{ gap: 2, paddingHorizontal: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: c.text }} numberOfLines={1}>
            {price.amount}
          </Text>
          {price.suffix ? (
            <Small numberOfLines={1} style={{ flexShrink: 1 }}>
              {price.suffix}
            </Small>
          ) : null}
        </View>
        <Body style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 }} numberOfLines={1}>
          {listing.title}
        </Body>
        <Small numberOfLines={1}>
          {listing.locality}
          {listing.city ? `, ${listing.city}` : ""}
        </Small>
      </View>
    </PressableScale>
  );
}
