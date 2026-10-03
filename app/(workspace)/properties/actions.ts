"use server";

import { redirect } from "next/navigation";
import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { LISTING_ACTIONS, isListingAction } from "@/lib/listings/lifecycle";
import { MAP_LINK_MESSAGES, type Pin } from "@/lib/listings/map-link";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { createDraft, updateAmenities, updateDetails, updateLocation, updatePricing } from "@/lib/services/listings/onboarding";
import { resolveMapLink } from "@/lib/services/map-links";
import { deleteListingMedia, reorderListingMedia, updateMediaAlt } from "@/lib/services/media";

type Result = ActionResult<unknown>;
const paths = (ref: string) => [`/properties/${ref}`, `/properties/${ref}/edit`, "/properties", "/dashboard", "/approvals"];

/** Any listing status change. The action name is looked up server-side; the client can't name a status. */
export async function transitionAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const action = text(form, "action");
  const result = await runAction(
    "listing.transition",
    async (actor, ctx) => {
      if (!isListingAction(action)) throw new AppError("VALIDATION_ERROR", "Unknown action.");
      return transitionListing(
        actor,
        ref,
        action,
        {
          reason: text(form, "reason"),
          markPropertyVerified: form.get("markVerified") === "on",
          close: { outcome: text(form, "outcome"), dealValue: text(form, "dealValue"), brokerage: text(form, "brokerage") },
        },
        ctx,
      );
    },
    { revalidate: paths(ref) },
  );
  if (result.ok && action === "submit") {
    // The edit page is read-only once submitted, so land on the listing with a confirmation.
    redirect(`/properties/${ref}?submitted=1`);
  }
  if (result.ok && isListingAction(action)) return { ok: true, message: `${LISTING_ACTIONS[action].label}: done.` };
  return result;
}

export async function createDraftAction(_prev: Result | null, form: FormData): Promise<Result> {
  const result = await runAction("listing.create", (actor, ctx) => createDraft(actor, formObject(form), ctx), { revalidate: ["/properties", "/dashboard"] });
  if (result.ok) redirect(`/properties/${(result.data as { referenceId: string }).referenceId}/edit?step=details&created=1`);
  return result;
}

export async function saveLocationAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const result = await runAction("listing.location", (actor) => updateLocation(actor, ref, formObject(form)), { revalidate: paths(ref) });
  return result.ok ? { ok: true, message: "Location saved." } : result;
}

export async function saveDetailsAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const result = await runAction("listing.details", (actor) => updateDetails(actor, ref, formObject(form)), { revalidate: paths(ref) });
  if (result.ok && text(form, "next")) redirect(`/properties/${ref}/edit?step=${text(form, "next")}`);
  return result.ok ? { ok: true, message: "Details saved." } : result;
}

/** PG rooms arrive as rooms[0][occupancy], rooms[0][rentPerBed]…; everything else is flat. */
function pricingInput(form: FormData) {
  const flat = formObject(form);
  const rooms: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(flat)) {
    const m = /^rooms\[(\d{1,2})\]\[(\w+)\]$/.exec(key);
    if (m && typeof value === "string") (rooms[m[1]] ??= {})[m[2]] = value;
  }
  const list = Object.keys(rooms)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => rooms[k])
    .filter((r) => r.occupancy);
  return list.length ? { ...flat, rooms: list } : flat;
}

export async function savePricingAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const result = await runAction("listing.pricing", (actor) => updatePricing(actor, ref, pricingInput(form)), { revalidate: paths(ref) });
  if (result.ok && text(form, "next")) redirect(`/properties/${ref}/edit?step=${text(form, "next")}`);
  if (!result.ok && result.fieldErrors) {
    // rooms.0.rentPerBed → rooms[0][rentPerBed], the field's name in the form.
    result.fieldErrors = Object.fromEntries(Object.entries(result.fieldErrors).map(([k, m]) => [k.replace(/^rooms\.(\d+)\.(\w+)$/, "rooms[$1][$2]"), m]));
  }
  return result.ok ? { ok: true, message: "Pricing saved." } : result;
}

/**
 * Checks a pasted map link as the agent types, so they see the pin before saving. Short links
 * are followed on the server (the browser can't); saving checks the link again either way.
 */
export async function previewMapLinkAction(link: string): Promise<ActionResult<Pin>> {
  if (typeof link !== "string" || link.length > 2000) return { ok: false, code: "VALIDATION_ERROR", message: MAP_LINK_MESSAGES.not_a_map_link };
  return runAction("listing.map_link", async (actor) => {
    if ((await limit([{ key: `maplink:user:${actor.userId}`, rule: RULES.mapLinkByUser }])).limited) throw new AppError("RATE_LIMITED");
    const result = await resolveMapLink(link);
    if (result.ok) return result.pin;
    throw new AppError("VALIDATION_ERROR", MAP_LINK_MESSAGES[result.reason === "short_link" ? "no_pin" : result.reason]);
  });
}

export async function saveAmenitiesAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const strings = (key: string) => form.getAll(key).filter((v): v is string => typeof v === "string");
  const amenities = strings("amenities");
  const custom = strings("custom");
  const result = await runAction("listing.amenities", (actor) => updateAmenities(actor, ref, { amenities, custom }), { revalidate: paths(ref) });
  if (result.ok && text(form, "next")) redirect(`/properties/${ref}/edit?step=${text(form, "next")}`);
  return result.ok ? { ok: true, message: "Amenities saved." } : result;
}

export async function deleteMediaAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  return runAction("listing.media.delete", (actor) => deleteListingMedia(actor, ref, text(form, "mediaId")), { revalidate: paths(ref) });
}

export async function mediaAltAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const result = await runAction("listing.media.alt", (actor) => updateMediaAlt(actor, ref, text(form, "mediaId"), text(form, "alt")), { revalidate: paths(ref) });
  return result.ok ? { ok: true, message: "Saved." } : result;
}

export async function reorderMediaAction(ref: string, orderedIds: string[]): Promise<Result> {
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) return { ok: false, code: "VALIDATION_ERROR", message: "Invalid order." };
  return runAction("listing.media.reorder", (actor) => reorderListingMedia(actor, ref, orderedIds), { revalidate: paths(ref) });
}
