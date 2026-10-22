import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, TextInput, View } from "react-native";
import { api, assetUrl, authHeaders } from "@/api/client";
import type { PartnerListing } from "@/api/types";
import { Badge, Body, Button, Card, Display, ErrorState, Eyebrow, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { API_ORIGIN } from "@/config";
import { confirm } from "@/confirm";
import { PANORAMA_MIN_WIDTH, TOUR_LINK_HELP, isPanoramaShape } from "@/lib/tours/terms";
import { fonts, radius, useColors } from "@/theme";
import { enqueueUploads, onUploaded, removeUpload, retryUpload, useUploads } from "@/uploads/queue";

const MAX_MODEL_BYTES = 100 * 1024 * 1024;

function RoomRow({ room, index, count, listingRef, editable, onChanged }: { room: PartnerListing["tour"]["rooms"][number]; index: number; count: number; listingRef: string; editable: boolean; onChanged: (order?: "up" | "down") => void }) {
  const c = useColors();
  const [name, setName] = useState(room.name);
  const rename = useMutation({ mutationFn: () => api(`/partner/listings/${listingRef}/media/${room.id}`, { method: "PUT", body: { name } }), onSuccess: () => onChanged() });
  const remove = useMutation({ mutationFn: () => api(`/partner/listings/${listingRef}/media/${room.id}`, { method: "DELETE" }), onSuccess: () => onChanged() });
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8 }}>
      <Image source={{ uri: assetUrl(room.thumbnailUrl), headers: authHeaders() }} style={{ width: 96, height: 48, borderRadius: radius.sm, backgroundColor: c.sand }} contentFit="cover" />
      <View style={{ flex: 1, gap: 4 }}>
        {editable ? (
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={() => name !== room.name && rename.mutate()}
            placeholder={`Room ${index + 1}: name it`}
            placeholderTextColor={c.amber}
            accessibilityLabel={`Name of room ${index + 1}`}
            maxLength={40}
            style={{ fontFamily: fonts.medium, fontSize: 15, color: c.text, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 4 }}
          />
        ) : (
          <Body>{room.name || `Room ${index + 1}`}</Body>
        )}
        {index === 0 && <Small style={{ fontSize: 12 }}>Opens the tour</Small>}
        {rename.isError && <Small tone="brick">{(rename.error as Error).message}</Small>}
      </View>
      {editable && (
        <View style={{ flexDirection: "row", gap: 2 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move room ${index + 1} up`} disabled={index === 0} hitSlop={6} onPress={() => onChanged("up")} style={{ padding: 6, opacity: index === 0 ? 0.3 : 1 }}>
            <Ionicons name="arrow-up" size={18} color={c.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move room ${index + 1} down`} disabled={index === count - 1} hitSlop={6} onPress={() => onChanged("down")} style={{ padding: 6, opacity: index === count - 1 ? 0.3 : 1 }}>
            <Ionicons name="arrow-down" size={18} color={c.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${room.name || `room ${index + 1}`}`}
            hitSlop={6}
            onPress={async () => (await confirm("Remove this room?", "Its 360° photo is deleted from the tour.", "Remove")) && remove.mutate()}
            style={{ padding: 6 }}
          >
            <Ionicons name="trash-outline" size={18} color={c.brick} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** One of the partner's listings: its numbers, and its virtual tour, recorded and managed on site. */
export default function PartnerListingScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const c = useColors();
  const queryClient = useQueryClient();
  const uploads = useUploads(ref).filter((u) => u.kind === "panorama" || u.kind === "model_3d" || u.kind === "capture");
  const [more, setMore] = useState(false);
  const listing = useQuery({
    queryKey: ["partner-listing", ref],
    queryFn: () => api<PartnerListing>(`/partner/listings/${ref}`),
    // While a 360° photo is being made, look again every few seconds.
    refetchInterval: (q) => (q.state.data?.captures.some((x) => x.status === "queued" || x.status === "stitching") ? 6000 : false),
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["partner-listing", ref] });
    void queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
  };
  useEffect(() => onUploaded((r) => r === ref && refresh()), [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMutation({ mutationFn: (ids: string[]) => api(`/partner/listings/${ref}/media-order`, { method: "PUT", body: { ids } }), onSuccess: refresh });
  const saveLink = useMutation({ mutationFn: (url: string) => api(`/partner/listings/${ref}/tour-link`, { method: "PUT", body: { url } }), onSuccess: refresh });
  const removeModel = useMutation({ mutationFn: (id: string) => api(`/partner/listings/${ref}/media/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const dismissCapture = useMutation({ mutationFn: (id: string) => api(`/partner/captures/${id}`, { method: "DELETE" }), onSuccess: refresh });

  if (listing.isPending) return <Loading />;
  if (listing.isError) return <ErrorState error={listing.error} onRetry={() => listing.refetch()} />;
  const l = listing.data;
  const editable = l.tourMode === "draft" || l.tourMode === "live";
  const rooms = l.tour.rooms;

  const addPanoramas = async () => {
    setNotice(null);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 20, quality: 1, exif: false });
    if (picked.canceled) return;
    const ok = picked.assets.filter((a) => isPanoramaShape(a.width, a.height) && a.width >= PANORAMA_MIN_WIDTH);
    const refused = picked.assets.length - ok.length;
    if (refused) setNotice(`${refused} ${refused === 1 ? "photo isn't" : "photos aren't"} 360°: a 360° photo is twice as wide as it is tall (like 6000×3000). Export it from your 360° camera's app as an equirectangular photo.`);
    if (ok.length) await enqueueUploads(ref, "panorama", ok.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `room-${rooms.length + i + 1}.jpg`, mime: a.mimeType ?? "image/jpeg" })));
  };
  const addModel = async () => {
    setNotice(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
    if (picked.canceled) return;
    const file = picked.assets[0];
    if (!file.name.toLowerCase().endsWith(".glb")) return setNotice("Choose a .glb file: export the 3D model as binary glTF (.glb).");
    if (file.size && file.size > MAX_MODEL_BYTES) return setNotice("That model is larger than 100 MB. Export it at a lower detail level.");
    await enqueueUploads(ref, "model_3d", [{ uri: file.uri, name: file.name, mime: "model/gltf-binary" }]);
  };
  const move = (index: number, dir: "up" | "down") => {
    const ids = rooms.map((r) => r.id);
    const to = dir === "up" ? index - 1 : index + 1;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    order.mutate(ids);
  };
  const currentLink = link ?? l.tour.link?.url ?? "";

  return (
    <Scroll>
      <View style={{ gap: 6 }}>
        <Eyebrow>{l.referenceId}</Eyebrow>
        <Display size={28}>{l.title}</Display>
        <Small>
          {l.price} · {l.place}
        </Small>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Badge label={l.statusLabel} tone={l.status === "published" ? "success" : "neutral"} />
        </View>
      </View>
      {l.statusReason && <Notice tone="warning">{l.statusReason}</Notice>}

      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          ["Views", l.stats.views],
          ["Leads", l.stats.leads],
          ["Saved", l.stats.saves],
        ].map(([label, value]) => (
          <Card key={label} style={{ flex: 1, padding: 12, gap: 0 }}>
            <Display size={26}>{value}</Display>
            <Small>{label}</Small>
          </Card>
        ))}
      </View>
      {l.publicUrl && <Button label="See it as customers do" variant="ghost" compact icon="open-outline" onPress={() => router.push(`/listing/${l.referenceId}`)} />}

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Title>Virtual tour</Title>
          {(rooms.length > 0 || l.tour.model || l.tour.link) && <Button label="Preview" compact variant="secondary" icon="play" onPress={() => router.push(`/partner/tour/${l.referenceId}`)} />}
        </View>
        {l.tour.hidden && (
          <Notice>
            Hidden by Trustbrick{l.tour.hidden.reason ? `: “${l.tour.hidden.reason}”` : "."} Fix it below; it&apos;s shown again once Trustbrick approves the change.
          </Notice>
        )}
        {l.tourReviewWaiting && !l.tour.hidden && <Notice tone="info">Recent changes are live and waiting for a Trustbrick check.</Notice>}
        <Small>
          {l.tourMode === "live"
            ? "The listing stays live while you change its tour. Changes show straight away, and Trustbrick checks each one."
            : l.tourMode === "draft"
              ? "Add the tour now; it's reviewed with the listing when you submit it."
              : l.tourMode === "locked"
                ? "The tour can't be changed while the listing is in review or closed."
                : "Only the listing's team can change its tour."}
        </Small>

        <Title style={{ marginTop: 6 }}>360° rooms {rooms.length ? `(${rooms.length})` : ""}</Title>
        {rooms.length === 0 && uploads.filter((u) => u.kind !== "model_3d").length === 0 && l.captures.length === 0 && <Small>No rooms yet.</Small>}
        {rooms.map((room, i) => (
          <RoomRow key={room.id} room={room} index={i} count={rooms.length} listingRef={ref} editable={editable} onChanged={(dir) => (dir ? move(i, dir) : refresh())} />
        ))}

        {l.captures
          .filter((x) => x.status !== "uploading")
          .map((x) => (
            <View key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <View style={{ width: 96, height: 48, borderRadius: radius.sm, backgroundColor: x.status === "failed" ? c.brickSoft : c.sand, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={x.status === "failed" ? "alert-circle-outline" : "sync-outline"} size={20} color={x.status === "failed" ? c.brick : c.graphite} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontSize: 14 }} numberOfLines={1}>
                  {x.roomName}
                </Body>
                <Small tone={x.status === "failed" ? "brick" : "muted"}>
                  {x.status === "failed" ? "Couldn't be made. Take it again: stay on one spot and turn slowly." : "Making the 360° photo… usually a minute or two"}
                </Small>
              </View>
              {x.status === "failed" && <Button label="Dismiss" compact variant="ghost" loading={dismissCapture.isPending} onPress={() => dismissCapture.mutate(x.id)} />}
            </View>
          ))}

        {uploads.map((u) => (
          <View key={u.id} style={{ gap: 4, paddingVertical: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Body style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                {u.kind === "model_3d" ? "3D model: " : u.kind === "capture" ? "360° photo: " : ""}
                {u.name}
              </Body>
              <Small tone={u.status === "failed" ? "brick" : "muted"}>
                {u.kind === "capture" && u.status !== "failed"
                  ? `Sending ${u.sent ?? 0} of ${u.shots?.length ?? 0} photos`
                  : u.status === "uploading"
                    ? `${Math.round(u.progress * 100)}%`
                    : u.status === "waiting"
                      ? "Waiting"
                      : "Not uploaded"}
              </Small>
            </View>
            {u.status === "uploading" && (
              <View style={{ height: 4, borderRadius: 2, backgroundColor: c.sand, overflow: "hidden" }}>
                <View style={{ height: 4, width: `${u.progress * 100}%`, backgroundColor: c.brick }} />
              </View>
            )}
            {u.status === "failed" && (
              <>
                <Small tone="brick">{u.error}</Small>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {!u.refused && <Button label="Try again" compact variant="secondary" onPress={() => retryUpload(u.id)} />}
                  <Button label="Remove" compact variant="ghost" onPress={() => removeUpload(u.id)} />
                </View>
              </>
            )}
          </View>
        ))}

        {notice && <Notice tone="warning">{notice}</Notice>}
        {editable && (
          <>
            <Button label="Take a 360° photo of a room" icon="camera-outline" variant="accent" onPress={() => router.push(`/partner/capture/${ref}`)} />
            <Button label="Add from a 360° camera" icon="images-outline" variant="secondary" onPress={addPanoramas} />
            <Card style={{ backgroundColor: c.paper, padding: 12, gap: 6 }}>
              <Small tone="graphite">
                On site, stand in the middle of each room. Take the photo with this phone (follow the dot, about 30 photos), or with a 360° camera (Insta360, RICOH THETA…) and add it
                from your gallery. No signal? Everything uploads when you&apos;re back online.
              </Small>
            </Card>
          </>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          onPress={() => setMore((m) => !m)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: c.line }}
        >
          <View style={{ flex: 1 }}>
            <Title>More ways to show the home</Title>
            <Small>A 3D model, or a tour hosted on Matterport, Kuula or CloudPano</Small>
          </View>
          <Ionicons name={more || l.tour.model || l.tour.link ? "chevron-up" : "chevron-down"} size={20} color={c.text} />
        </Pressable>
        {(more || l.tour.model || l.tour.link) && (
          <>
        <Title style={{ marginTop: 6 }}>3D model</Title>
        {l.tour.model ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="cube-outline" size={22} color={c.graphite} />
            <Body style={{ flex: 1 }} numberOfLines={1}>
              {l.tour.model.name}
            </Body>
            {editable && l.tour.model.id && (
              <Button
                label="Remove"
                compact
                variant="ghost"
                loading={removeModel.isPending}
                onPress={async () => (await confirm("Remove the 3D model?", "It's deleted from the tour.", "Remove")) && removeModel.mutate(l.tour.model!.id!)}
              />
            )}
          </View>
        ) : editable ? (
          <View style={{ gap: 8 }}>
            <Small>A model customers can turn around in 3D, made with a scanning app or by your architect.</Small>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button label="Add a 3D model (.glb)" icon="cube-outline" variant="secondary" compact onPress={addModel} />
              <Button label="How to make one" icon="help-circle-outline" variant="ghost" compact onPress={() => router.push("/partner/model-guide")} />
            </View>
          </View>
        ) : (
          <Small>None.</Small>
        )}

        <Title style={{ marginTop: 6 }}>Hosted 3D tour</Title>
        {editable ? (
          <>
            <Field label="Share link" value={currentLink} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder="https://my.matterport.com/show/?m=…" hint={TOUR_LINK_HELP} error={saveLink.isError ? (saveLink.error as Error).message : undefined} />
            <Button label={currentLink ? "Save link" : "Remove link"} compact variant="secondary" disabled={currentLink === (l.tour.link?.url ?? "")} loading={saveLink.isPending} onPress={() => saveLink.mutate(currentLink)} />
          </>
        ) : l.tour.link ? (
          <Button label={`Open on ${l.tour.link.provider}`} compact variant="ghost" onPress={() => Linking.openURL(l.tour.link!.url)} />
        ) : (
          <Small>None.</Small>
        )}
          </>
        )}
      </Card>

      <Small>Edit details, photos and prices on the website: {API_ORIGIN.replace(/^https?:\/\//, "")}/properties/{l.referenceId}</Small>
    </Scroll>
  );
}
