import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { api } from "@/api/client";
import type { Category, OnboardingOptions, Purpose } from "@/api/workspace-types";
import { SaveBar } from "@/components/form";
import { PressableScale, thud, tick } from "@/components/motion";
import { Button, ErrorState, Loading, Notice } from "@/components/ui";
import { formErrors, useOnboardingOptions } from "@/partner/data";
import { LocationFields } from "@/partner/location-fields";
import type { Values } from "@/partner/property-fields";
import { fonts, radius, useColors } from "@/theme";

const PURPOSES: Record<Purpose, { label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }> = {
  sale: { label: "Sell", hint: "A home, office, shop or plot for sale.", icon: "key-outline" },
  rent: { label: "Rent out", hint: "Monthly rent, usually 11 months or more.", icon: "home-outline" },
  lease: { label: "Lease", hint: "A longer commercial or land lease.", icon: "document-text-outline" },
  pg: { label: "PG / co-living", hint: "Beds or rooms, rent per bed.", icon: "bed-outline" },
  stay: { label: "Homestay", hint: "Guests book nights on the calendar.", icon: "sunny-outline" },
};
const CATEGORIES: Record<Category, string> = { residential: "Residential", commercial: "Commercial", land: "Land", co_living: "PG & co-living" };

/**
 * Onboarding a property, as on the website: what it's for, what kind of property, and where it
 * is. That creates the draft; the details, price, amenities and photos come next.
 */
export default function NewProperty() {
  const options = useOnboardingOptions();
  return (
    <>
      <Stack.Screen options={{ title: "Onboard a property" }} />
      {options.isPending ? <Loading /> : options.isError ? <ErrorState error={options.error} onRetry={() => options.refetch()} /> : <Wizard options={options.data} />}
    </>
  );
}

function Wizard({ options }: { options: OnboardingOptions }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const [page, setPage] = useState<0 | 1 | 2>(options.purposes.length === 1 ? 1 : 0);
  const [purpose, setPurpose] = useState<Purpose | "">(options.purposes.length === 1 ? options.purposes[0] : "");
  const [type, setType] = useState("");
  const [values, setValues] = useState<Values>({ localityId: "", line1: "", line2: "", landmark: "", postalCode: "", mapLink: "" });
  const types = options.types.filter((t) => purpose && t.purposes.includes(purpose));
  const categories = [...new Set(types.map((t) => t.category))];

  const create = useMutation({
    mutationFn: () => api<{ referenceId: string }>("/partner/listings", { method: "POST", body: { purpose, propertyType: type, ...values } }),
    onSuccess: ({ referenceId }) => {
      tick();
      void queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
      router.replace(`/partner/property/${referenceId}/details?flow=onboard`);
    },
    onError: () => {
      thud();
      scroll.current?.scrollTo({ y: 0, animated: true });
    },
  });
  const { fields, message } = formErrors(create.error);
  const go = (p: 0 | 1 | 2) => {
    tick();
    setPage(p);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 20 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= page ? c.brick : c.sand }} />
          ))}
        </View>
        {message && <Notice>{message}</Notice>}

        {page === 0 && (
          <Animated.View key="p0" entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(150)} style={{ gap: 12 }}>
            <Heading title="What's it for?" detail="This decides the details and price you'll add." />
            {options.purposes.map((p) => (
              <Choice
                key={p}
                icon={PURPOSES[p].icon}
                title={PURPOSES[p].label}
                hint={PURPOSES[p].hint}
                selected={purpose === p}
                onPress={() => {
                  setPurpose(p);
                  if (!options.types.some((t) => t.code === type && t.purposes.includes(p))) setType("");
                  go(1);
                }}
              />
            ))}
          </Animated.View>
        )}

        {page === 1 && (
          <Animated.View key="p1" entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(150)} style={{ gap: 18 }}>
            <Heading title="What kind of property?" detail={purpose ? `To ${PURPOSES[purpose].label.toLowerCase()}.` : undefined} />
            {fields.propertyType && <Notice>{fields.propertyType}</Notice>}
            {categories.map((cat) => (
              <View key={cat} style={{ gap: 10 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: c.muted }}>{CATEGORIES[cat]}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {types
                    .filter((t) => t.category === cat)
                    .map((t) => {
                      const on = type === t.code;
                      return (
                        <PressableScale
                          key={t.code}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          onPress={() => {
                            setType(t.code);
                            go(2);
                          }}
                          style={{ paddingHorizontal: 16, height: 44, justifyContent: "center", borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}
                        >
                          <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: on ? c.background : c.text }}>{t.name}</Text>
                        </PressableScale>
                      );
                    })}
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        {page === 2 && (
          <Animated.View key="p2" entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(150)} style={{ gap: 18 }}>
            <Heading title="Where is it?" detail={`${options.types.find((t) => t.code === type)?.name ?? ""} · ${purpose ? PURPOSES[purpose].label : ""}`} />
            <LocationFields options={options} values={values} errors={fields} onChange={(n, v) => setValues((x) => ({ ...x, [n]: v }))} />
          </Animated.View>
        )}
      </ScrollView>
      <SaveBar>
        {page > 0 && !(page === 1 && options.purposes.length === 1) && <Button label="Back" variant="ghost" onPress={() => go((page - 1) as 0 | 1)} />}
        {page === 2 ? (
          <Button label="Create draft" variant="accent" loading={create.isPending} disabled={!values.localityId || String(values.line1).trim().length < 3} onPress={() => create.mutate()} style={{ flex: 1 }} />
        ) : (
          <Button label="Next" disabled={page === 0 ? !purpose : !type} onPress={() => go((page + 1) as 1 | 2)} style={{ flex: 1 }} />
        )}
      </SaveBar>
    </KeyboardAvoidingView>
  );
}

function Heading({ title, detail }: { title: string; detail?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: c.text }}>{title}</Text>
      {detail ? <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{detail}</Text> : null}
    </View>
  );
}

function Choice({ icon, title, hint, selected, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: selected ? 2 : 1, borderColor: selected ? c.ink : c.line }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brickSoft, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={22} color={c.brick} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.text }}>{title}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.faint} />
    </PressableScale>
  );
}
