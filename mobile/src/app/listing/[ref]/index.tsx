import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Share, Text, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/client";
import type { ListingDetail } from "@/api/types";
import { useSession } from "@/auth/session";
import { PhotoCarousel } from "@/components/photo-carousel";
import { PressableScale, Skeleton, enter, thud } from "@/components/motion";
import { Badge, Body, Button, Card, Chip, Display, ErrorState, Eyebrow, Fact, Small, Title } from "@/components/ui";
import { API_ORIGIN } from "@/config";
import { rememberViewed } from "@/hooks/use-home";
import { useSave } from "@/hooks/use-save";
import { formatArea, formatDate, formatPrice, titleCase } from "@/lib/format";
import { FURNISHING_LABEL, OCCUPANCY_LABEL, keyFacts, priceParts } from "@/lib/listings/describe";
import { CANCELLATION_LABELS, SPACE_TYPE_LABELS, nightsLabel, timeLabel } from "@/lib/stays/labels";
import { describeTour } from "@/lib/tours/terms";
import { fonts, radius, shadow, useColors } from "@/theme";

const HERO = 380;

/** A round button over the photo (back, share, save). */
function HeaderButton({ icon, label, onPress, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: string }) {
  const c = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      scaleTo={0.9}
      onPress={onPress}
      style={[{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }, shadow.soft]}
    >
      <Ionicons name={icon} size={20} color={tone ?? c.text} />
    </PressableScale>
  );
}

/** The page's shape while it loads. */
function ListingSkeleton() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Skeleton height={HERO} rounded={0} />
      <View style={{ padding: 20, gap: 14 }}>
        <Skeleton width="35%" height={12} />
        <Skeleton width="85%" height={30} />
        <Skeleton width="55%" height={16} />
        <Skeleton width="40%" height={34} />
        <Skeleton height={120} rounded={radius.xl} />
      </View>
    </View>
  );
}

/** One listing, as the website's listing page shows it, with the next step pinned to the bottom. */
export default function ListingScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const c = useColors();
  const { status } = useSession();
  const toggleSave = useSave();
  const insets = useSafeAreaInsets();
  const listing = useQuery({ queryKey: ["listing", ref], queryFn: () => api<ListingDetail>(`/listings/${ref}`) });

  // The photo drifts slower than the page (and stretches when pulled down); the header fades in as the photo leaves.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const hero = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value > 0 ? scrollY.value * 0.45 : scrollY.value / 2 }, { scale: scrollY.value < 0 ? 1 - scrollY.value / HERO : 1 }],
  }));
  const bar = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [HERO - 170, HERO - 90], [0, 1], Extrapolation.CLAMP) }));

  useEffect(() => {
    if (listing.data) rememberViewed(listing.data);
  }, [listing.data]);

  if (listing.isPending) return <ListingSkeleton />;
  if (listing.isError) return <ErrorState error={listing.error} onRetry={() => listing.refetch()} />;
  const l = listing.data;
  const price = priceParts(l);
  const stay = l.stay;
  const facts: [string, string | null][] = [
    ["Bedrooms", l.bedrooms === null ? null : l.bedrooms === 0 ? "Studio" : `${l.bedrooms} BHK`],
    ["Bathrooms", l.bathrooms === null ? null : String(l.bathrooms)],
    ["Carpet area", l.carpetAreaSqft ? formatArea(l.carpetAreaSqft) : null],
    ["Built-up area", l.builtUpAreaSqft ? formatArea(l.builtUpAreaSqft) : null],
    ["Plot area", l.plotAreaSqyd ? `${Math.round(l.plotAreaSqyd).toLocaleString("en-IN")} sq yd` : null],
    ["Furnishing", l.furnishing ? (FURNISHING_LABEL[l.furnishing] ?? titleCase(l.furnishing)) : null],
    ["Floor", l.floorNumber === null ? null : l.totalFloors ? `${l.floorNumber} of ${l.totalFloors}` : String(l.floorNumber)],
    ["Facing", l.facing ? titleCase(l.facing) : null],
    ["Balconies", l.balconies === null ? null : String(l.balconies)],
    ["Covered parking", l.coveredParking ? String(l.coveredParking) : null],
    ["Year built", l.yearBuilt ? String(l.yearBuilt) : null],
    ["Security deposit", l.depositAmount ? formatPrice(l.depositAmount, { compact: false }) : null],
    ["Maintenance", l.maintenanceAmount ? `${formatPrice(l.maintenanceAmount, { compact: false })}/month` : null],
    ["Available from", l.availableFrom ? formatDate(l.availableFrom, { day: "numeric", month: "short", year: "numeric" }) : null],
    ["RERA", l.reraId],
  ];

  const openTour = () => {
    if (l.tourAccess === "open") router.push(`/listing/${l.referenceId}/tour`);
    else if (l.tourAccess === "sign_in_required") router.push("/sign-in");
    else router.push("/plans");
  };
  const needsSignIn = (go: () => void) => (status === "signedIn" ? go() : router.push("/sign-in"));

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <Animated.View style={[{ height: HERO }, hero]}>
              <PhotoCarousel images={l.images} height={HERO} />
            </Animated.View>
            <Animated.View
              entering={enter(0)}
              style={{ marginTop: -28, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, backgroundColor: c.background, paddingHorizontal: 20, paddingTop: 24, gap: 22 }}
            >
              {l.isSample && <Badge label="Sample listing: not a real property" tone="contrast" />}
              <View style={{ gap: 6 }}>
                <Eyebrow>
                  {l.typeName}
                  {l.projectName ? ` · ${l.projectName}` : ""}
                </Eyebrow>
                <Display size={30}>{l.title}</Display>
                <Body tone="graphite">
                  {l.locality}
                  {l.city ? `, ${l.city}` : ""}
                  {l.postalCode ? ` ${l.postalCode}` : ""}
                </Body>
                <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {price.prefix ? <Small>{price.prefix}</Small> : null}
                  <Display size={32}>{price.amount}</Display>
                  {price.suffix ? <Small>{price.suffix}</Small> : null}
                  {l.priceNegotiable ? <Small>· Negotiable</Small> : null}
                </View>
                {keyFacts(l).length > 0 && <Small tone="graphite">{keyFacts(l).join("  ·  ")}</Small>}
                {l.offer && <Badge label={l.offer.title} tone="danger" />}
              </View>

              <Card style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="cube-outline" size={20} color={c.brick} />
                  <Title>Virtual tour &amp; 3D view</Title>
                </View>
                {l.tour ? (
                  <>
                    <Body tone="graphite">
                      This {stay ? "stay" : "property"} has a {describeTour(l.tour)}.
                    </Body>
                    {l.tourAccess !== "open" && <Small>Virtual tours are included with Trustbrick Plus, which starts with a free trial.</Small>}
                    <Button
                      label={l.tourAccess === "open" ? "Open the virtual tour" : l.tourAccess === "sign_in_required" ? "Sign in to open the tour" : "Unlock with Plus"}
                      icon={l.tourAccess === "open" ? "play" : "lock-closed"}
                      variant={l.tourAccess === "open" ? "primary" : "accent"}
                      onPress={openTour}
                    />
                  </>
                ) : (
                  <Body tone="muted">This {stay ? "stay" : "property"} doesn&apos;t have a virtual tour or 3D view yet.</Body>
                )}
              </Card>

              {l.description ? (
                <View style={{ gap: 6 }}>
                  <Title>About this {stay ? "stay" : "property"}</Title>
                  <Body tone="graphite">{l.description}</Body>
                </View>
              ) : null}

              {stay && (
                <View style={{ gap: 6 }}>
                  <Title>The stay</Title>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    <Fact label="Guests get" value={SPACE_TYPE_LABELS[stay.spaceType].label} />
                    <Fact label="Sleeps" value={`Up to ${stay.maxGuests} · ${stay.beds} bed${stay.beds === 1 ? "" : "s"}`} />
                    <Fact label="Check-in" value={`From ${timeLabel(stay.checkInTime)}`} />
                    <Fact label="Check-out" value={`By ${timeLabel(stay.checkOutTime)}`} />
                    <Fact label="Stay length" value={stay.minNights === stay.maxNights ? nightsLabel(stay.minNights) : `${stay.minNights} to ${stay.maxNights} nights`} />
                    <Fact label="Booking" value={stay.instantBook ? "Instant book" : "Host approves each request"} />
                    <Fact label="Pets" value={stay.petsAllowed ? "Allowed" : "Not allowed"} />
                    <Fact label="Weekend nights" value={stay.weekendPrice ? `${formatPrice(stay.weekendPrice, { compact: false })}/night` : null} />
                  </View>
                  <Small>{SPACE_TYPE_LABELS[stay.spaceType].hint} The exact address is shared once your booking is confirmed.</Small>
                  {stay.houseRules ? (
                    <View style={{ gap: 4, marginTop: 6 }}>
                      <Title>House rules</Title>
                      <Body tone="graphite">{stay.houseRules}</Body>
                    </View>
                  ) : null}
                  <View style={{ gap: 4, marginTop: 6 }}>
                    <Title>Cancellation</Title>
                    <Body tone="graphite">
                      {CANCELLATION_LABELS[stay.cancellationPolicy].label}. {CANCELLATION_LABELS[stay.cancellationPolicy].rule} You pay the host at the property.
                    </Body>
                  </View>
                  {stay.host && (
                    <Card style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" }}>
                        <Title style={{ color: c.background }}>{stay.host.name.slice(0, 1).toUpperCase()}</Title>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Title>Hosted by {stay.host.name}</Title>
                        <Small>
                          {stay.host.verified ? "✓ Identity checked · " : ""}Hosting since {formatDate(stay.host.since, { month: "long", year: "numeric" })}
                        </Small>
                      </View>
                    </Card>
                  )}
                </View>
              )}

              {l.pg && (
                <View style={{ gap: 8 }}>
                  <Title>Rooms and rent</Title>
                  {l.pg.rooms.map((r) => (
                    <Card key={`${r.occupancy}-${r.hasAc}-${r.attachedBathroom}`} style={{ padding: 12, gap: 2 }}>
                      <Body style={{ fontFamily: fonts.medium }}>
                        {OCCUPANCY_LABEL[r.occupancy] ?? r.occupancy} · {formatPrice(r.rentPerBed, { compact: false })}/month
                      </Body>
                      <Small>
                        {[r.hasAc ? "AC" : "Non-AC", r.attachedBathroom ? "Attached bathroom" : "Shared bathroom", `${r.bedsAvailable} bed${r.bedsAvailable === 1 ? "" : "s"} free`].join(" · ")}
                      </Small>
                    </Card>
                  ))}
                </View>
              )}

              {facts.some(([, v]) => v) && (
                <View style={{ gap: 6 }}>
                  <Title>Details</Title>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {facts.map(([label, value]) => (
                      <Fact key={label} label={label} value={value} />
                    ))}
                  </View>
                </View>
              )}

              {l.amenities.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Title>Amenities</Title>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {l.amenities.map((a) => (
                      <Chip key={a.code} label={a.name} />
                    ))}
                  </View>
                </View>
              )}

              <Small>
                Listed by {l.organizationName} · Listing ID {l.referenceId}
              </Small>
            </Animated.View>
          </Animated.ScrollView>

          {/* The header: buttons over the photo, then a bar with the title once the photo scrolls away */}
          <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 6, paddingHorizontal: 14, paddingBottom: 10 }}>
            <Animated.View
              pointerEvents="none"
              style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.line }, bar]}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <HeaderButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
              <Animated.View style={[{ flex: 1 }, bar]}>
                <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.text }}>
                  {l.title}
                </Text>
              </Animated.View>
              <HeaderButton icon="share-outline" label="Share" onPress={() => Share.share({ message: `${l.title}\n${API_ORIGIN}/listings/${l.referenceId}` })} />
              <HeaderButton
                icon={l.saved ? "heart" : "heart-outline"}
                tone={l.saved ? c.brick : undefined}
                label={l.saved ? "Remove from saved homes" : "Save this home"}
                onPress={() => {
                  thud();
                  toggleSave(l.referenceId, !l.saved);
                }}
              />
            </View>
          </View>
        </View>
        {l.status === "published" && (
          <SafeAreaView edges={["bottom"]} style={[{ borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, backgroundColor: c.surface }, shadow.float]}>
            <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
              {stay ? (
                <>
                  <Button label="Message host" variant="secondary" icon="chatbubble-outline" style={{ flex: 1 }} onPress={() => needsSignIn(() => router.push(`/conversation/new?listing=${l.referenceId}`))} />
                  <Button label="Check dates" icon="calendar-outline" variant="accent" style={{ flex: 1.2 }} onPress={() => needsSignIn(() => router.push(`/listing/${l.referenceId}/book`))} />
                </>
              ) : l.contact && !l.contact.isOwn ? (
                <Button
                  label={l.contact.hasOpenEnquiry ? "Contact the agent again" : "Contact the agent"}
                  icon="call-outline"
                  variant="accent"
                  style={{ flex: 1 }}
                  onPress={() => needsSignIn(() => router.push(`/listing/${l.referenceId}/enquire`))}
                />
              ) : null}
            </View>
          </SafeAreaView>
        )}
      </View>
    </View>
  );
}
