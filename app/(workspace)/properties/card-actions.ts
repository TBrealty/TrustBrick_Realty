"use server";

import { formObject, runAction, text } from "@/lib/actions";
import { AppError, type ActionResult } from "@/lib/errors";
import { type ListingCardData, listingCard, updateListingTerms } from "@/lib/services/listings/card";
import { transitionListing } from "@/lib/services/listings/lifecycle";

type Result = ActionResult<unknown>;

/** Every page that shows a listing's price, availability or offer. */
const paths = (ref: string) => ["/properties", `/properties/${ref}`, `/listings/${ref}`, "/buy", "/rent", "/pg", "/invest", "/dashboard"];

export async function loadListingCardAction(referenceId: string): Promise<ActionResult<ListingCardData>> {
  return runAction("listing.card", (actor) => listingCard(actor, String(referenceId).trim().toUpperCase()));
}

/** PG rooms arrive as rooms[0][id], rooms[0][rentPerBed]…; everything else is flat. */
function termsInput(form: FormData) {
  const flat = formObject(form);
  const rooms: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(flat)) {
    const m = /^rooms\[(\d{1,2})\]\[(\w+)\]$/.exec(key);
    if (m && typeof value === "string") (rooms[m[1]] ??= {})[m[2]] = value;
  }
  const list = Object.keys(rooms)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => rooms[k])
    .filter((r) => r.id);
  return { ...flat, rooms: list };
}

export async function updateListingTermsAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const result = await runAction("listing.terms", (actor, ctx) => updateListingTerms(actor, ref, termsInput(form), ctx), { revalidate: paths(ref) });
  if (!result.ok && result.fieldErrors) {
    // rooms.0.rentPerBed → rooms[0][rentPerBed], the field's name in the form.
    result.fieldErrors = Object.fromEntries(Object.entries(result.fieldErrors).map(([k, m]) => [k.replace(/^rooms\.(\d+)\.(\w+)$/, "rooms[$1][$2]"), m]));
  }
  if (!result.ok) return result;
  const changed = (result.data as { changed: string[] }).changed;
  return { ok: true, message: changed.length ? "Saved. Customers see the change straight away." : "Nothing changed." };
}

export async function listingAvailabilityAction(referenceId: string, action: "mark_closed" | "reopen", close?: { outcome?: string; dealValue?: string; brokerage?: string }): Promise<Result> {
  return runAction(
    "listing.availability",
    (actor, ctx) => {
      if (action !== "mark_closed" && action !== "reopen") throw new AppError("VALIDATION_ERROR", "Unknown action.");
      const plain = close && typeof close === "object" ? { outcome: String(close.outcome ?? ""), dealValue: String(close.dealValue ?? ""), brokerage: String(close.brokerage ?? "") } : undefined;
      return transitionListing(actor, referenceId, action, { close: plain }, ctx);
    },
    { revalidate: paths(referenceId) },
  );
}
