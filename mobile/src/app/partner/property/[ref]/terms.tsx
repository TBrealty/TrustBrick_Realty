import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { api } from "@/api/client";
import type { ListingWorkspace } from "@/api/workspace-types";
import { FormSection, FormText, SaveBar } from "@/components/form";
import { thud, tick } from "@/components/motion";
import { Button, ErrorState, Loading, Notice } from "@/components/ui";
import { formErrors, refreshListing, useListingWorkspace } from "@/partner/data";
import type { Section, Values } from "@/partner/property-fields";
import { SpecForm } from "@/partner/spec-form";
import { fonts, radius, useColors } from "@/theme";

/**
 * Quick edit for a live listing, as on the website: price, deposit, maintenance, availability,
 * an offer (and a PG's room rents and free beds, or a homestay's nightly prices). Live at once,
 * with no new review; price changes go into the price history.
 */
export default function QuickEdit() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const ws = useListingWorkspace(ref);
  return (
    <>
      <Stack.Screen options={{ title: "Quick edit" }} />
      {ws.isPending ? (
        <Loading />
      ) : ws.isError ? (
        <ErrorState error={ws.error} onRetry={() => ws.refetch()} />
      ) : !ws.data.quickEdit ? (
        <View style={{ padding: 16 }}>
          <Notice tone="info">Quick edit is for live listings. Edit this one&apos;s steps instead.</Notice>
        </View>
      ) : (
        <TermsForm ws={ws.data} />
      )}
    </>
  );
}

const str = (x: unknown) => (x === null || x === undefined ? "" : String(Number.isFinite(Number(x)) && x !== "" ? Number(x) : x));

function sectionsFor(ws: ListingWorkspace): Section[] {
  const p = ws.listing.purpose;
  const offer: Section = {
    title: "Offer",
    description: "A short line shown on the listing, like “No brokerage this month” or “First month's rent free”.",
    fields: [
      { kind: "text", name: "offerTitle", label: "Offer", maxLength: 60 },
      { kind: "multiline", name: "offerDetails", label: "Details", maxLength: 280 },
      { kind: "date", name: "offerValidUntil", label: "Valid until" },
    ],
  };
  if (p === "stay")
    return [
      {
        title: "Prices",
        fields: [
          { kind: "money", name: "price", label: "Price per night", required: true },
          { kind: "money", name: "weekendPrice", label: "Weekend price per night" },
          { kind: "money", name: "cleaningFee", label: "Cleaning fee" },
        ],
      },
      {
        title: "Stays",
        fields: [
          { kind: "number", name: "minNights", label: "Shortest stay", suffix: "nights", required: true },
          { kind: "number", name: "maxNights", label: "Longest stay", suffix: "nights", required: true },
          { kind: "toggle", name: "instantBook", label: "Instant book" },
        ],
      },
      offer,
    ];
  if (p === "pg") return [{ title: "Availability", fields: [{ kind: "date", name: "availableFrom", label: "Beds available from" }] }, offer];
  const rentLike = p === "rent" || p === "lease";
  return [
    {
      title: "Price",
      fields: [
        { kind: "money", name: "price", label: rentLike ? "Monthly rent" : "Price", required: true },
        { kind: "toggle", name: "priceNegotiable", label: rentLike ? "Rent is negotiable" : "Price is negotiable" },
        ...(rentLike ? [{ kind: "money" as const, name: "depositAmount", label: "Security deposit" }] : []),
        { kind: "money", name: "maintenanceAmount", label: "Maintenance per month" },
        { kind: "date", name: "availableFrom", label: rentLike ? "Available from" : "Possession from" },
      ],
    },
    offer,
  ];
}

function TermsForm({ ws }: { ws: ListingWorkspace }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const t = ws.card.terms;
  const sections = sectionsFor(ws);
  const [values, setValues] = useState<Values>(() => ({
    price: str(t.price),
    priceNegotiable: t.priceNegotiable,
    depositAmount: str(t.depositAmount),
    maintenanceAmount: str(t.maintenanceAmount),
    availableFrom: t.availableFrom ?? "",
    weekendPrice: str(t.weekendPrice),
    cleaningFee: str(t.cleaningFee),
    minNights: str(t.minNights),
    maxNights: str(t.maxNights),
    instantBook: t.instantBook,
    offerTitle: t.offerTitle ?? "",
    offerDetails: t.offerDetails ?? "",
    offerValidUntil: t.offerValidUntil ?? "",
  }));
  const [rooms, setRooms] = useState(() => ws.card.rooms.map((r) => ({ id: r.id, label: r.label, rentPerBed: String(r.rentPerBed), bedsAvailable: String(r.bedsAvailable) })));

  const save = useMutation({
    mutationFn: () => {
      const names = sections.flatMap((s) => s.fields.map((f) => f.name));
      const body: Record<string, unknown> = Object.fromEntries(names.map((n) => [n, values[n] ?? ""]));
      if (ws.listing.purpose === "pg") body.rooms = rooms.map(({ id, rentPerBed, bedsAvailable }) => ({ id, rentPerBed, bedsAvailable }));
      return api(`/partner/listings/${ws.listing.referenceId}/terms`, { method: "PUT", body });
    },
    onSuccess: () => {
      tick();
      refreshListing(queryClient, ws.listing.referenceId);
      router.back();
    },
    onError: () => {
      thud();
      scroll.current?.scrollTo({ y: 0, animated: true });
    },
  });
  const { fields, message } = formErrors(save.error);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 28 }}>
        {message && <Notice>{message}</Notice>}
        {rooms.length > 0 && (
          <FormSection title="Rooms" description="Rent per bed and how many beds are free now.">
            {rooms.map((r, i) => (
              <View key={r.id} style={{ gap: 12, padding: 14, borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{r.label}</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <FormText label="Rent per bed" required prefix="₹" keyboardType="number-pad" value={r.rentPerBed} error={fields[`rooms.${i}.rentPerBed`]} onChangeText={(v) => setRooms((rs) => rs.map((x) => (x.id === r.id ? { ...x, rentPerBed: v.replace(/\D/g, "") } : x)))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormText label="Beds free" required keyboardType="number-pad" value={r.bedsAvailable} error={fields[`rooms.${i}.bedsAvailable`]} onChangeText={(v) => setRooms((rs) => rs.map((x) => (x.id === r.id ? { ...x, bedsAvailable: v.replace(/\D/g, "") } : x)))} />
                  </View>
                </View>
              </View>
            ))}
          </FormSection>
        )}
        <SpecForm sections={sections} values={values} errors={fields} onChange={(n, v) => setValues((x) => ({ ...x, [n]: v }))} />
        {ws.card.priceHistory.length > 1 && (
          <FormSection title="Price history">
            {ws.card.priceHistory.map((h, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }}>{h.price}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>
                  {h.from} – {h.to ?? "now"}
                </Text>
              </View>
            ))}
          </FormSection>
        )}
      </ScrollView>
      <SaveBar>
        <Button label="Save changes" variant="accent" loading={save.isPending} onPress={() => save.mutate()} style={{ flex: 1 }} />
      </SaveBar>
    </KeyboardAvoidingView>
  );
}
