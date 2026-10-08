import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, query } from "@/api/client";
import type { BrowseOptions } from "@/api/types";
import { Body, Button, Chip, Divider, Scroll, Small, Title } from "@/components/ui";
import { EMPTY_FILTERS, type SearchState, setSearch, useSearch } from "@/hooks/use-search";
import { formatPrice } from "@/lib/format";
import { BHK_OPTIONS, FURNISHING_OPTIONS, KIND_META, SORTS, SORT_LABELS } from "@/lib/listings/filters";
import { useColors } from "@/theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Title>{title}</Title>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** The website's filters, as a sheet. Changes apply when the person taps "Show places". */
export default function Filters() {
  const c = useColors();
  const current = useSearch();
  const [draft, setDraft] = useState<SearchState>(current);
  const set = (patch: Partial<SearchState>) => setDraft((d) => ({ ...d, ...patch }));
  const options = useQuery({ queryKey: ["options", draft.kind], queryFn: () => api<BrowseOptions>(`/listings/options${query({ kind: draft.kind })}`), staleTime: 10 * 60_000 });
  const city = options.data?.cities.find((x) => x.slug === draft.city);
  const meta = KIND_META[draft.kind];
  const homes = draft.kind === "buy" || draft.kind === "rent";

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: c.background }}>
      <Scroll contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 24 }}>
        <Section title="City">
          {options.isPending && <Small>Loading cities…</Small>}
          {options.data?.cities.map((x) => (
            <Chip key={x.slug} label={x.name} selected={draft.city === x.slug} onPress={() => set({ city: draft.city === x.slug ? null : x.slug, localities: [] })} />
          ))}
        </Section>
        {city && city.localities.length > 0 && (
          <Section title="Localities">
            {city.localities.map((l) => (
              <Chip key={l.slug} label={l.name} selected={draft.localities.includes(l.slug)} onPress={() => set({ localities: toggle(draft.localities, l.slug) })} />
            ))}
          </Section>
        )}
        <Divider />
        <Section title={`${meta.priceLabel}: up to`}>
          {meta.budgets.map((b) => (
            <Chip key={b} label={formatPrice(b)} selected={draft.max === b} onPress={() => set({ max: draft.max === b ? null : b })} />
          ))}
        </Section>
        {homes && (
          <Section title="Bedrooms">
            {BHK_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} selected={draft.bhk.includes(o.value)} onPress={() => set({ bhk: toggle(draft.bhk, o.value) })} />
            ))}
          </Section>
        )}
        {homes && (
          <Section title="Furnishing">
            {FURNISHING_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} selected={draft.furnishing.includes(o.value)} onPress={() => set({ furnishing: toggle(draft.furnishing, o.value) })} />
            ))}
          </Section>
        )}
        {(options.data?.types.length ?? 0) > 0 && (
          <Section title="Property type">
            {options.data!.types.map((t) => (
              <Chip key={t.code} label={t.name} selected={draft.types.includes(t.code)} onPress={() => set({ types: toggle(draft.types, t.code) })} />
            ))}
          </Section>
        )}
        <Divider />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Title>Has a virtual tour</Title>
            <Body tone="muted" style={{ fontSize: 14 }}>
              360° tour or 3D view. Opening them is part of Trustbrick Plus.
            </Body>
          </View>
          <Switch value={draft.tour} onValueChange={(v) => set({ tour: v })} trackColor={{ true: c.brick, false: c.sand }} accessibilityLabel="Has a virtual tour" />
        </View>
        <Section title="Sort">
          {SORTS.map((s) => (
            <Chip key={s} label={SORT_LABELS[s]} selected={draft.sort === s} onPress={() => set({ sort: s })} />
          ))}
        </Section>
      </Scroll>
      <View style={{ flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.line }}>
        <Button label="Clear all" variant="secondary" style={{ flex: 1 }} onPress={() => setDraft((d) => ({ ...d, ...EMPTY_FILTERS }))} />
        <Button
          label="Show places"
          style={{ flex: 1.4 }}
          onPress={() => {
            setSearch(draft);
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
        />
      </View>
    </SafeAreaView>
  );
}
