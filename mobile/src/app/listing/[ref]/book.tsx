import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Switch, View } from "react-native";
import { ApiError, api } from "@/api/client";
import type { ListingDetail, Quote } from "@/api/types";
import { useSession } from "@/auth/session";
import { RangeCalendar } from "@/components/calendar";
import { Body, Button, Card, Divider, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { formatDay, formatPrice } from "@/lib/format";
import { CANCELLATION_LABELS, nightsLabel } from "@/lib/stays/labels";
import { useColors } from "@/theme";

const todayInIndia = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Body>{label}</Body>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Button label="−" variant="secondary" compact accessibilityLabel={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onPress={() => onChange(value - 1)} />
        <Title accessibilityLiveRegion="polite">{value}</Title>
        <Button label="+" variant="secondary" compact accessibilityLabel={`More ${label.toLowerCase()}`} disabled={value >= max} onPress={() => onChange(value + 1)} />
      </View>
    </View>
  );
}

/** Choose dates and guests, see the price, and request (or instantly book) the stay. */
export default function Book() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const c = useColors();
  const queryClient = useQueryClient();
  const { me } = useSession();
  const today = todayInIndia();
  const listing = useQuery({ queryKey: ["listing", ref], queryFn: () => api<ListingDetail>(`/listings/${ref}`) });
  const availability = useQuery({ queryKey: ["availability", ref], queryFn: () => api<{ unavailable: { from: string; to: string }[] }>(`/listings/${ref}/availability`) });
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [pets, setPets] = useState(false);
  const [name, setName] = useState(me?.user.name ?? "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [agree, setAgree] = useState(false);

  const quote = useQuery({
    queryKey: ["quote", ref, checkIn, checkOut, adults, children, pets],
    queryFn: () => api<Quote>(`/listings/${ref}/quote`, { method: "POST", body: { checkIn, checkOut, adults, children, pets } }),
    enabled: Boolean(checkIn && checkOut),
  });
  const book = useMutation({
    mutationFn: () => api<{ referenceId: string; status: string }>(`/listings/${ref}/bookings`, { method: "POST", body: { checkIn, checkOut, adults, children, pets, name, phone, message, agree } }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
      void queryClient.invalidateQueries({ queryKey: ["availability", ref] });
      router.replace(`/trips/${r.referenceId}`);
    },
  });

  if (listing.isPending || availability.isPending) return <Loading />;
  const stay = listing.data?.stay;
  if (!stay) return <Notice>This listing isn&apos;t a stay.</Notice>;
  const errors = book.error instanceof ApiError ? (book.error.fieldErrors ?? {}) : {};
  const q = quote.data;
  const policy = CANCELLATION_LABELS[stay.cancellationPolicy];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Scroll contentContainerStyle={{ padding: 16, gap: 18 }}>
        <Card>
          <Title>{checkIn && checkOut ? `${formatDay(checkIn)} – ${formatDay(checkOut)}` : checkIn ? "Now choose check-out" : "Choose check-in"}</Title>
          <Small>
            {stay.minNights === stay.maxNights ? nightsLabel(stay.minNights) : `${stay.minNights} to ${stay.maxNights} nights`} · crossed-out days are taken
          </Small>
          <RangeCalendar
            today={today}
            unavailable={availability.data?.unavailable ?? []}
            checkIn={checkIn}
            checkOut={checkOut}
            onChange={(a, b) => {
              setCheckIn(a);
              setCheckOut(b);
            }}
          />
        </Card>

        <Card>
          <Stepper label="Adults" value={adults} min={1} max={stay.maxGuests - children} onChange={setAdults} />
          <Stepper label="Children" value={children} min={0} max={stay.maxGuests - adults} onChange={setChildren} />
          {stay.petsAllowed && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Body>Bringing a pet</Body>
              <Switch value={pets} onValueChange={setPets} trackColor={{ true: c.brick, false: c.sand }} accessibilityLabel="Bringing a pet" />
            </View>
          )}
          <Small>Up to {stay.maxGuests} guests.</Small>
        </Card>

        {checkIn && checkOut && (
          <Card>
            {quote.isPending ? (
              <Small>Working out the price…</Small>
            ) : q && q.ok ? (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Body>{nightsLabel(q.nights)}</Body>
                  <Body>{formatPrice(q.subtotal, { compact: false })}</Body>
                </View>
                {q.cleaningFee > 0 && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Body>Cleaning fee</Body>
                    <Body>{formatPrice(q.cleaningFee, { compact: false })}</Body>
                  </View>
                )}
                <Divider />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Title>Total</Title>
                  <Title>{formatPrice(q.total, { compact: false })}</Title>
                </View>
                <Small>Paid to the host at the property. Nothing is charged in the app.</Small>
              </>
            ) : q ? (
              <Notice tone="warning">{q.message}</Notice>
            ) : null}
          </Card>
        )}

        {q && q.ok && (
          <>
            {book.isError && !Object.keys(errors).length && <Notice>{(book.error as Error).message}</Notice>}
            <Field label="Your name" value={name} onChangeText={setName} error={errors.name} autoComplete="name" />
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} autoComplete="tel" hint="The host gets it once the booking is confirmed." />
            <Field label="Message to the host (optional)" value={message} onChangeText={setMessage} multiline style={{ minHeight: 80, textAlignVertical: "top" }} error={errors.message} />
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Switch value={agree} onValueChange={setAgree} trackColor={{ true: c.brick, false: c.sand }} accessibilityLabel="I agree to the house rules and cancellation policy" />
              <Body style={{ flex: 1, fontSize: 14 }}>
                I agree to the house rules and the {policy.label.toLowerCase()} cancellation policy: {policy.rule}
              </Body>
            </View>
            {errors.agree && <Small tone="brick">{errors.agree}</Small>}
            <Button
              label={q.instantBook ? "Book now" : "Request to book"}
              variant="accent"
              loading={book.isPending}
              onPress={() => book.mutate()}
            />
            {!q.instantBook && <Small style={{ textAlign: "center" }}>The host has 24 hours to accept. You&apos;re not charged anything.</Small>}
          </>
        )}
      </Scroll>
    </KeyboardAvoidingView>
  );
}
