import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { api } from "@/api/client";
import type { ListingWorkspace, OnboardingOptions } from "@/api/workspace-types";
import { FormChips, FormSection, FormText, FormToggle, SaveBar } from "@/components/form";
import { PressableScale, thud, tick } from "@/components/motion";
import { Button, ErrorState, Loading, Notice } from "@/components/ui";
import { AmenitiesFields } from "@/partner/amenities-fields";
import { formErrors, refreshListing, useListingWorkspace, useOnboardingOptions } from "@/partner/data";
import { LocationFields } from "@/partner/location-fields";
import { OCCUPANCY, type PgRoom, type Values, detailsSections, detailsValues, locationValues, pgRooms, pricingSections, pricingValues, visibleValues } from "@/partner/property-fields";
import { SpecForm } from "@/partner/spec-form";
import { fonts, radius, useColors } from "@/theme";

const STEPS = ["location", "details", "pricing", "amenities"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = { location: "Location", details: "Details", pricing: "Price and terms", amenities: "Amenities" };

/**
 * One of a property's onboarding steps, as on the website: Location, Details (by category),
 * Price and terms (by purpose; rooms for a PG) or Amenities. `?flow=onboard` walks on to the next
 * step after saving, ending at the photos.
 */
export default function PropertyStep() {
  const { ref, step, flow } = useLocalSearchParams<{ ref: string; step: string; flow?: string }>();
  const ws = useListingWorkspace(ref);
  const options = useOnboardingOptions();
  const known = (STEPS as readonly string[]).includes(step);

  return (
    <>
      <Stack.Screen options={{ title: known ? TITLES[step as Step] : "Edit" }} />
      {!known ? (
        <ErrorState error={new Error("There's no such step.")} />
      ) : ws.isPending || options.isPending ? (
        <Loading />
      ) : ws.isError || options.isError ? (
        <ErrorState error={ws.error ?? options.error} onRetry={() => (ws.refetch(), options.refetch())} />
      ) : !ws.data.editable ? (
        <View style={{ padding: 16 }}>
          <Notice tone="info">
            {ws.data.quickEdit ? "This listing is live. Change its price and offer with Quick edit; anything else means withdrawing it first." : `This listing is ${ws.data.statusLabel.toLowerCase()}, so it can't be edited now.`}
          </Notice>
        </View>
      ) : (
        <StepForm step={step as Step} ws={ws.data} options={options.data} onboarding={flow === "onboard"} />
      )}
    </>
  );
}

function StepForm({ step, ws, options, onboarding }: { step: Step; ws: ListingWorkspace; options: OnboardingOptions; onboarding: boolean }) {
  const c = useColors();
  const l = ws.listing;
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const sections = step === "details" ? detailsSections(l) : step === "pricing" && l.purpose !== "pg" ? pricingSections(l) : [];
  const [values, setValues] = useState<Values>(() => (step === "location" ? locationValues(l) : step === "details" ? detailsValues(l) : step === "pricing" ? pricingValues(l) : {}));
  const [rooms, setRooms] = useState<PgRoom[]>(() => pgRooms(l));
  const [amenities, setAmenities] = useState({ selected: l.amenities, custom: l.customAmenities });

  const save = useMutation({
    mutationFn: () => {
      const body =
        step === "amenities"
          ? { amenities: amenities.selected, custom: amenities.custom }
          : step === "pricing" && l.purpose === "pg"
            ? { availableFrom: values.availableFrom ?? "", rooms: rooms.map(({ key: _key, ...r }) => r) }
            : step === "location"
              ? values
              : visibleValues(sections, values);
      return api(`/partner/listings/${l.referenceId}/${step}`, { method: "PUT", body });
    },
    onSuccess: () => {
      tick();
      refreshListing(queryClient, l.referenceId);
      if (!onboarding) return router.back();
      const next = STEPS[STEPS.indexOf(step) + 1];
      router.replace(next ? `/partner/property/${l.referenceId}/${next}?flow=onboard` : `/partner/property/${l.referenceId}/media?flow=onboard`);
    },
    onError: () => {
      thud();
      scroll.current?.scrollTo({ y: 0, animated: true });
    },
  });
  const { fields, message } = formErrors(save.error);
  const set = (name: string, value: string | boolean) => setValues((v) => ({ ...v, [name]: value }));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 24 }}>
        {onboarding && <StepDots step={step} />}
        {message && <Notice>{message}</Notice>}
        {step === "location" && <LocationFields options={options} values={values} errors={fields} onChange={set} />}
        {step === "amenities" && <AmenitiesFields options={options} category={l.type.category} selected={amenities.selected} custom={amenities.custom} error={fields.custom ?? fields.amenities} onChange={setAmenities} />}
        {step === "pricing" && l.purpose === "pg" && <PgRooms rooms={rooms} setRooms={setRooms} availableFrom={String(values.availableFrom ?? "")} onAvailableFrom={(v) => set("availableFrom", v)} errors={fields} />}
        {sections.length > 0 && <SpecForm sections={sections} values={values} errors={fields} onChange={set} />}
      </ScrollView>
      <SaveBar>
        {onboarding && <Button label="Later" variant="ghost" onPress={() => router.replace(`/partner/property/${l.referenceId}`)} />}
        <Button label={onboarding ? "Save and continue" : "Save"} variant="accent" loading={save.isPending} onPress={() => save.mutate()} style={{ flex: 1 }} />
      </SaveBar>
    </KeyboardAvoidingView>
  );
}

/** Where the onboarding is: the four steps, then photos. */
function StepDots({ step }: { step: Step }) {
  const c = useColors();
  const at = STEPS.indexOf(step);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[...STEPS, "media"].map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? c.brick : c.sand }} />
        ))}
      </View>
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: c.muted }}>
        Step {at + 2} of 6 · {TITLES[step]}
      </Text>
    </View>
  );
}

/** A PG's room types: sharing, rent per bed, deposit, beds free, AC and bathroom. */
function PgRooms({ rooms, setRooms, availableFrom, onAvailableFrom, errors }: { rooms: PgRoom[]; setRooms: (fn: (r: PgRoom[]) => PgRoom[]) => void; availableFrom: string; onAvailableFrom: (v: string) => void; errors: Record<string, string> }) {
  const c = useColors();
  const patch = (key: number, p: Partial<PgRoom>) => setRooms((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  return (
    <View style={{ gap: 24 }}>
      <FormSection title="Room types" description="One for each kind of room: sharing, AC and bathroom. Rent is per bed, per month.">
        {errors.rooms ? <Notice>{errors.rooms}</Notice> : null}
        {rooms.map((r, i) => (
          <View key={r.key} style={{ gap: 14, padding: 14, borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>Room type {i + 1}</Text>
              {rooms.length > 1 && (
                <PressableScale accessibilityRole="button" accessibilityLabel={`Remove room type ${i + 1}`} hitSlop={8} onPress={() => setRooms((rs) => rs.filter((x) => x.key !== r.key))}>
                  <Ionicons name="trash-outline" size={20} color={c.brick} />
                </PressableScale>
              )}
            </View>
            <FormChips label="Sharing" required value={r.occupancy} options={OCCUPANCY} onChange={(v) => patch(r.key, { occupancy: v })} error={errors[`rooms.${i}.occupancy`]} />
            <FormText label="Rent per bed" required prefix="₹" keyboardType="number-pad" value={r.rentPerBed} onChangeText={(v) => patch(r.key, { rentPerBed: v.replace(/\D/g, "") })} error={errors[`rooms.${i}.rentPerBed`]} />
            <FormText label="Deposit" prefix="₹" keyboardType="number-pad" value={r.depositAmount} onChangeText={(v) => patch(r.key, { depositAmount: v.replace(/\D/g, "") })} error={errors[`rooms.${i}.depositAmount`]} />
            <FormText label="Beds free now" required keyboardType="number-pad" value={r.bedsAvailable} onChangeText={(v) => patch(r.key, { bedsAvailable: v.replace(/\D/g, "") })} error={errors[`rooms.${i}.bedsAvailable`]} />
            <FormToggle label="Air-conditioned" value={r.hasAc} onChange={(v) => patch(r.key, { hasAc: v })} />
            <FormToggle label="Attached bathroom" value={r.attachedBathroom} onChange={(v) => patch(r.key, { attachedBathroom: v })} />
          </View>
        ))}
        {rooms.length < 16 && (
          <Button
            label="Add a room type"
            variant="secondary"
            icon="add"
            onPress={() => setRooms((rs) => [...rs, { key: Math.max(0, ...rs.map((x) => x.key)) + 1, occupancy: "single", rentPerBed: "", depositAmount: "", bedsAvailable: "", hasAc: false, attachedBathroom: false }])}
          />
        )}
      </FormSection>
      <SpecFormDate value={availableFrom} onChange={onAvailableFrom} error={errors.availableFrom} />
    </View>
  );
}

function SpecFormDate({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return <SpecForm sections={[{ title: "Availability", fields: [{ kind: "date", name: "availableFrom", label: "Beds available from" }] }]} values={{ availableFrom: value }} errors={error ? { availableFrom: error } : {}} onChange={(_, v) => onChange(String(v))} />;
}
