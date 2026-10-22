import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { api, assetUrl, authHeaders } from "@/api/client";
import type { ListingWorkspace, MediaItem } from "@/api/workspace-types";
import { SaveBar, Sheet } from "@/components/form";
import { PressableScale, tick } from "@/components/motion";
import { Badge, Button, ErrorState, Loading, Notice, Small } from "@/components/ui";
import { confirm } from "@/confirm";
import { refreshListing, useListingWorkspace } from "@/partner/data";
import { fonts, radius, useColors } from "@/theme";
import { type UploadKind, enqueueUploads, onUploaded, removeUpload, retryUpload, useUploads } from "@/uploads/queue";

type Kind = "photo" | "floor_plan" | "video" | "document";
const KINDS: { kind: Kind; title: string; description: string; max: number }[] = [
  { kind: "photo", title: "Photos", description: "The first photo is the cover. At least one is needed to submit, and reviewers look for three or more. Bright, level and uncluttered works best.", max: 30 },
  { kind: "floor_plan", title: "Floor plans", description: "An image or PDF of the layout.", max: 10 },
  { kind: "video", title: "Videos", description: "A walkthrough, up to 100 MB each.", max: 3 },
  { kind: "document", title: "Documents", description: "Title deed, approvals, NOC. Private: only your team and Trustbrick's reviewers see them.", max: 10 },
];

/** The property's photos, floor plans, videos and documents: add from the camera or the phone, order, describe, remove. */
export default function PropertyMedia() {
  const { ref, flow } = useLocalSearchParams<{ ref: string; flow?: string }>();
  const ws = useListingWorkspace(ref);
  const queryClient = useQueryClient();
  useEffect(() => onUploaded((r) => r === ref && refreshListing(queryClient, ref)), [queryClient, ref]);

  return (
    <>
      <Stack.Screen options={{ title: "Photos and files" }} />
      {ws.isPending ? <Loading /> : ws.isError ? <ErrorState error={ws.error} onRetry={() => ws.refetch()} /> : <MediaManager ws={ws.data} onboarding={flow === "onboard"} />}
    </>
  );
}

function MediaManager({ ws, onboarding }: { ws: ListingWorkspace; onboarding: boolean }) {
  const c = useColors();
  const ref = ws.listing.referenceId;
  // As on the website: files change while the listing can be edited (a live one is withdrawn first). Its tour can change while live.
  const canChange = ws.editable;
  const uploads = useUploads(ref).filter((u) => KINDS.some((k) => k.kind === u.kind));
  const gap = ws.gaps.find((g) => g.section === "media");
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 28 }}>
        {gap && <Notice tone="warning">{gap.message}</Notice>}
        {!canChange && <Notice tone="info">{ws.quickEdit ? "This listing is live. To change its photos and files, withdraw it first; its tour can be changed any time." : `This listing is ${ws.statusLabel.toLowerCase()}, so its files can't be changed now.`}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {KINDS.map((k) => (
          <KindSection key={k.kind} spec={k} ws={ws} canChange={canChange} pending={uploads.filter((u) => u.kind === k.kind)} onNotice={setNotice} />
        ))}
        <PressableScale accessibilityRole="link" onPress={() => router.push(`/partner/listing/${ref}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <Ionicons name="planet-outline" size={22} color={c.brick} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>360° and 3D tour</Text>
            <Small>Take rooms with the guided camera, add 360° photos, a 3D model or a Matterport link.</Small>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.faint} />
        </PressableScale>
      </ScrollView>
      {onboarding && (
        <SaveBar>
          <Button label="Done: review and submit" variant="accent" onPress={() => router.replace(`/partner/property/${ref}`)} style={{ flex: 1 }} />
        </SaveBar>
      )}
    </View>
  );
}

function KindSection({ spec, ws, canChange, pending, onNotice }: { spec: (typeof KINDS)[number]; ws: ListingWorkspace; canChange: boolean; pending: ReturnType<typeof useUploads>; onNotice: (s: string | null) => void }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const ref = ws.listing.referenceId;
  const items = ws.listing.media.filter((m) => m.kind === spec.kind).sort((a, b) => a.sortOrder - b.sortOrder);
  const room = spec.max - items.length - pending.length;
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [choosing, setChoosing] = useState(false);
  const tile = (width - 32 - 16) / 3;

  const order = useMutation({
    mutationFn: (ids: string[]) => api(`/partner/listings/${ref}/media-order`, { method: "PUT", body: { ids } }),
    onSettled: () => refreshListing(queryClient, ref),
  });

  const queue = (kind: UploadKind, files: { uri: string; name: string; mime: string }[]) => {
    if (!files.length) return;
    if (files.length > room) onNotice(`Only ${room} more ${spec.title.toLowerCase()} fit, so the first ${room} were added.`);
    else onNotice(null);
    void enqueueUploads(ref, kind, files.slice(0, Math.max(room, 0)));
  };

  async function fromCamera() {
    setChoosing(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return onNotice("Allow the camera to take photos here, or choose them from your gallery.");
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: [spec.kind === "video" ? "videos" : "images"], quality: 0.85, exif: false });
    if (shot.canceled) return;
    queue(spec.kind, shot.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `${spec.kind}-${Date.now()}-${i}.${spec.kind === "video" ? "mp4" : "jpg"}`, mime: a.mimeType ?? (spec.kind === "video" ? "video/mp4" : "image/jpeg") })));
  }
  async function fromGallery() {
    setChoosing(false);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [spec.kind === "video" ? "videos" : "images"], allowsMultipleSelection: spec.kind !== "video", selectionLimit: Math.max(room, 1), quality: 0.85, exif: false });
    if (picked.canceled) return;
    const heic = picked.assets.filter((a) => /heic|heif/i.test(a.mimeType ?? a.fileName ?? ""));
    if (heic.length) onNotice("HEIC photos aren't supported yet. In Settings > Camera > Formats choose Most Compatible, or export them as JPEG.");
    queue(spec.kind, picked.assets.filter((a) => !heic.includes(a)).map((a, i) => ({ uri: a.uri, name: a.fileName ?? `${spec.kind}-${i + 1}.jpg`, mime: a.mimeType ?? "image/jpeg" })));
  }
  async function fromFiles() {
    setChoosing(false);
    const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: true });
    if (picked.canceled) return;
    queue(spec.kind, picked.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType ?? "application/pdf" })));
  }

  const move = (index: number, by: -1 | 1) => {
    const ids = items.map((m) => m.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    tick();
    order.mutate(ids);
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>
            {spec.title} <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{items.length}/{spec.max}</Text>
          </Text>
          <Small>{spec.description}</Small>
        </View>
        {canChange && room > 0 && <Button label="Add" icon="add" compact variant="secondary" onPress={() => setChoosing(true)} />}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {items.map((m, i) => (
          <PressableScale key={m.id} accessibilityRole="button" accessibilityLabel={`${spec.title} ${i + 1}${m.altText ? `: ${m.altText}` : ""}`} onPress={() => setEditing(m)} style={{ width: tile, gap: 4 }}>
            <Thumb item={m} size={tile} />
            {spec.kind === "photo" && i === 0 && (
              <View style={{ position: "absolute", top: 6, left: 6 }}>
                <Badge label="Cover" tone="contrast" />
              </View>
            )}
            <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 12, color: m.altText ? c.graphite : c.faint }}>
              {m.altText || (m.kind === "document" || m.kind === "floor_plan" ? (m.originalFilename ?? "Tap to describe") : "Tap to describe")}
            </Text>
          </PressableScale>
        ))}
        {pending.map((u) => (
          <View key={u.id} style={{ width: tile, gap: 4 }}>
            <View style={{ width: tile, height: tile, borderRadius: radius.lg, backgroundColor: c.sand, alignItems: "center", justifyContent: "center", padding: 8, gap: 6 }}>
              {u.status === "failed" ? <Ionicons name={u.refused ? "alert-circle" : "cloud-offline-outline"} size={22} color={c.brick} /> : <Ionicons name="cloud-upload-outline" size={22} color={c.muted} />}
              <View style={{ width: "80%", height: 4, borderRadius: 2, backgroundColor: c.line }}>
                <View style={{ width: `${Math.round(u.progress * 100)}%`, height: 4, borderRadius: 2, backgroundColor: c.brick }} />
              </View>
            </View>
            {u.status === "failed" ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                {!u.refused && (
                  <Text onPress={() => retryUpload(u.id)} style={{ fontFamily: fonts.medium, fontSize: 12, color: c.brick }}>
                    Retry
                  </Text>
                )}
                <Text onPress={() => removeUpload(u.id)} style={{ fontFamily: fonts.medium, fontSize: 12, color: c.muted }}>
                  Remove
                </Text>
              </View>
            ) : (
              <Small style={{ fontSize: 12 }}>{u.status === "uploading" ? "Uploading…" : "Waiting…"}</Small>
            )}
            {u.error ? (
              <Small tone="brick" numberOfLines={3} style={{ fontSize: 11 }}>
                {u.error}
              </Small>
            ) : null}
          </View>
        ))}
        {!items.length && !pending.length && (
          <View style={{ width: "100%", padding: 18, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: c.line, alignItems: "center" }}>
            <Small>None yet.</Small>
          </View>
        )}
      </View>

      <Sheet visible={choosing} onClose={() => setChoosing(false)} title={`Add ${spec.title.toLowerCase()}`}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
          {(spec.kind === "photo" || spec.kind === "video" || spec.kind === "floor_plan") && <Button label={spec.kind === "video" ? "Record a video" : "Take a photo"} icon="camera-outline" onPress={fromCamera} />}
          {(spec.kind === "photo" || spec.kind === "video") && <Button label="Choose from gallery" variant="secondary" icon="images-outline" onPress={fromGallery} />}
          {(spec.kind === "floor_plan" || spec.kind === "document") && <Button label="Choose a PDF or image" variant="secondary" icon="document-outline" onPress={fromFiles} />}
          {spec.kind === "document" && <Button label="Photograph a document" variant="ghost" icon="camera-outline" onPress={fromCamera} />}
        </View>
      </Sheet>

      {editing && (
        <MediaSheet
          item={editing}
          index={items.findIndex((m) => m.id === editing.id)}
          count={items.length}
          listingRef={ref}
          canChange={canChange}
          isPhoto={spec.kind === "photo"}
          onMove={(by) => {
            move(
              items.findIndex((m) => m.id === editing.id),
              by,
            );
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

function Thumb({ item, size }: { item: MediaItem; size: number }) {
  const c = useColors();
  const image = item.thumbnailUrl ?? (item.mimeType.startsWith("image/") ? item.url : null);
  if (image) return <Image source={{ uri: assetUrl(image), headers: authHeaders() }} style={{ width: size, height: size, borderRadius: radius.lg, backgroundColor: c.sand }} contentFit="cover" transition={150} />;
  return (
    <View style={{ width: size, height: size, borderRadius: radius.lg, backgroundColor: c.sand, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={item.kind === "video" ? "videocam-outline" : "document-text-outline"} size={28} color={c.graphite} />
    </View>
  );
}

/** One file: describe it, move it, open it, remove it. */
function MediaSheet({ item, index, count, listingRef, canChange, isPhoto, onMove, onClose }: { item: MediaItem; index: number; count: number; listingRef: string; canChange: boolean; isPhoto: boolean; onMove: (by: -1 | 1) => void; onClose: () => void }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const [name, setName] = useState(item.altText ?? "");
  const rename = useMutation({
    mutationFn: () => api(`/partner/listings/${listingRef}/media/${item.id}`, { method: "PUT", body: { name } }),
    onSuccess: () => {
      refreshListing(queryClient, listingRef);
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/partner/listings/${listingRef}/media/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshListing(queryClient, listingRef);
      onClose();
    },
  });
  return (
    <Sheet visible onClose={onClose} title={isPhoto ? `Photo ${index + 1}` : (item.originalFilename ?? "File")}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 14 }}>
        <Thumb item={item} size={180} />
        {canChange && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }}>Caption</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={200}
              placeholder={isPhoto ? "e.g. Living room with balcony" : "What is this?"}
              placeholderTextColor={c.faint}
              style={{ minHeight: 50, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 16, color: c.text }}
            />
            {rename.isError && <Small tone="brick">{(rename.error as Error).message}</Small>}
            <Button label="Save caption" loading={rename.isPending} disabled={name === (item.altText ?? "")} onPress={() => rename.mutate()} />
          </View>
        )}
        {canChange && count > 1 && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label={isPhoto && index === 1 ? "Make cover" : "Move earlier"} icon="arrow-back" variant="secondary" compact disabled={index <= 0} onPress={() => onMove(-1)} style={{ flex: 1 }} />
            <Button label="Move later" icon="arrow-forward" variant="secondary" compact disabled={index >= count - 1} onPress={() => onMove(1)} style={{ flex: 1 }} />
          </View>
        )}
        {!item.mimeType.startsWith("image/") && item.kind !== "document" && <Button label="Open" icon="open-outline" variant="secondary" onPress={() => Linking.openURL(assetUrl(item.url) ?? "")} />}
        {canChange && (
          <Button
            label="Remove"
            icon="trash-outline"
            variant="danger"
            loading={remove.isPending}
            onPress={async () => (await confirm("Remove this file?", "It's deleted from the listing.", "Remove")) && remove.mutate()}
          />
        )}
        {remove.isError && <Small tone="brick">{(remove.error as Error).message}</Small>}
      </ScrollView>
    </Sheet>
  );
}
