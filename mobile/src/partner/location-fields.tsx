import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { api } from "@/api/client";
import type { OnboardingOptions } from "@/api/workspace-types";
import { FormSection, FormSelect, FormText } from "@/components/form";
import { PressableScale, tick } from "@/components/motion";
import { MAP_LINK_MESSAGES, type MapLinkResult, googleMapsLink, parseMapLink } from "@/lib/listings/map-link";
import type { Values } from "@/partner/property-fields";
import { fonts, radius, useColors } from "@/theme";

/**
 * Where the property is, as on the website: city and locality, the address, and its pin. On the
 * phone the pin can come from where you're standing ("Use my current location", sent as a map
 * link the server reads like any other) or from a pasted Google or Apple Maps link.
 */
export function LocationFields({ options, values, errors, onChange }: { options: OnboardingOptions; values: Values; errors: Record<string, string>; onChange: (name: string, value: string) => void }) {
  const c = useColors();
  const localityId = String(values.localityId ?? "");
  const [cityId, setCityId] = useState(() => options.cities.find((city) => city.localities.some((l) => l.id === localityId))?.id ?? (options.cities.length === 1 ? options.cities[0].id : ""));
  const city = options.cities.find((x) => x.id === cityId);
  const link = String(values.mapLink ?? "");
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [checked, setChecked] = useState<{ link: string; result: MapLinkResult } | null>(null);

  // Instant feedback for a full link; short links are followed by the server.
  const local = link ? parseMapLink(link) : null;
  const result = local && !local.ok && local.reason === "short_link" ? (checked?.link === link ? checked.result : null) : local;

  async function checkShort() {
    if (!local || local.ok || local.reason !== "short_link") return;
    try {
      setChecked({ link, result: await api<MapLinkResult>("/partner/map-link", { method: "POST", body: { link } }) });
    } catch {
      setChecked({ link, result: { ok: false, reason: "unreachable" } });
    }
  }

  async function pinHere() {
    setGpsError(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setGpsError(permission.canAskAgain ? "Allow location to drop the pin where you are." : "Location is off for Trustbrick. Turn it on in Settings, or paste a map link.");
        return;
      }
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      tick();
      onChange("mapLink", `https://maps.google.com/?q=${here.coords.latitude.toFixed(6)},${here.coords.longitude.toFixed(6)}`);
    } catch {
      setGpsError("Couldn't find where you are. Step outside or near a window and try again, or paste a map link.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={{ gap: 32 }}>
      <FormSection title="Area">
        <FormSelect
          label="City"
          required
          value={cityId}
          options={options.cities.map((x) => ({ value: x.id, label: x.name, hint: x.state }))}
          onChange={(v) => {
            setCityId(v);
            onChange("localityId", "");
          }}
        />
        <FormSelect
          label="Locality"
          required
          value={localityId}
          error={errors.localityId}
          placeholder={city ? "Choose a locality" : "Choose a city first"}
          options={(city?.localities ?? []).map((l) => ({ value: l.id, label: l.name }))}
          onChange={(v) => onChange("localityId", v)}
        />
      </FormSection>

      <FormSection title="Address" description="Shown to customers only after they enquire. The pin is shown as an approximate area.">
        <FormText label="Building and street" required value={String(values.line1 ?? "")} onChangeText={(v) => onChange("line1", v)} error={errors.line1} placeholder="e.g. Lakeview Residency, Road No. 12" maxLength={200} />
        <FormText label="Area, sector or block" value={String(values.line2 ?? "")} onChangeText={(v) => onChange("line2", v)} error={errors.line2} maxLength={200} />
        <FormText label="Landmark" value={String(values.landmark ?? "")} onChangeText={(v) => onChange("landmark", v)} error={errors.landmark} placeholder="e.g. Opposite City Centre Mall" maxLength={120} />
        <FormText label="PIN code" value={String(values.postalCode ?? "")} onChangeText={(v) => onChange("postalCode", v.replace(/\D/g, "").slice(0, 6))} error={errors.postalCode} keyboardType="number-pad" maxLength={6} />
      </FormSection>

      <FormSection title="Map pin" description="Puts the property in the right place on the map. Without one, it's shown at the middle of the locality.">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Use my current location"
          disabled={locating}
          onPress={pinHere}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: c.brickSoft, opacity: locating ? 0.6 : 1 }}
        >
          <Ionicons name="locate" size={22} color={c.brick} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{locating ? "Finding you…" : "Use my current location"}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>Standing at the property? Drop the pin right here.</Text>
          </View>
        </PressableScale>
        {gpsError ? <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.brick }}>{gpsError}</Text> : null}
        <FormText
          label="Or paste a map link"
          value={link}
          onChangeText={(v) => onChange("mapLink", v.trim())}
          onEndEditing={checkShort}
          error={errors.mapLink ?? (result && !result.ok ? MAP_LINK_MESSAGES[result.reason] : undefined)}
          hint={local && !local.ok && local.reason === "short_link" && !result ? "We'll check this link when you save." : "In Google Maps: drop a pin, tap Share, copy the link."}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://maps.app.goo.gl/…"
        />
        {result?.ok ? (
          <PressableScale accessibilityRole="link" onPress={() => Linking.openURL(googleMapsLink(result.pin))} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="checkmark-circle" size={18} color={c.sage} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.sage, flex: 1 }}>
              Pin set at {result.pin.latitude.toFixed(5)}, {result.pin.longitude.toFixed(5)}. Check it in Maps
            </Text>
          </PressableScale>
        ) : null}
      </FormSection>
    </View>
  );
}
