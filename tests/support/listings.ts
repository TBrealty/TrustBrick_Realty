import type { Actor } from "@/lib/authz/actor";
import { createDraft, updateDetails, updatePricing } from "@/lib/services/listings/onboarding";
import { attachPhoto, ctx, locality } from "./factory";

/** Details every building needs before it can be submitted. */
export const BUILDING = { yearBuilt: "2016", facing: "east", ownershipType: "freehold" } as const;

/** A rent listing with everything submission needs, created through the real services. */
export async function readyRentListing(agent: Actor, overrides: { title?: string; rent?: number; localitySlug?: string } = {}) {
  const { referenceId } = await createDraft(
    agent,
    {
      purpose: "rent",
      propertyType: "apartment",
      localityId: await locality(overrides.localitySlug),
      line1: "Tower B, Sample Street",
    },
    ctx,
  );
  await updateDetails(agent, referenceId, {
    title: overrides.title ?? "2 BHK apartment near the metro",
    description: "A bright two-bedroom flat with covered parking, power backup and a large balcony facing the park.",
    lifecycleStatus: "ready",
    carpetAreaSqft: "1050",
    bedrooms: "2",
    bathrooms: "2",
    balconies: "1",
    furnishing: "semi_furnished",
    coveredParking: "1",
    ...BUILDING,
    unitNumber: `B-${Math.floor(Math.random() * 9000) + 1000}`,
    floorNumber: "4",
    totalFloors: "14",
  });
  await updatePricing(agent, referenceId, { price: String(overrides.rent ?? 30000), depositAmount: "90000" });
  await attachPhoto(referenceId);
  return referenceId;
}

/** A homestay with details, nightly terms and a photo, created through the real services. */
export async function readyStay(
  host: Actor,
  overrides: { title?: string; price?: number; weekendPrice?: number; cleaningFee?: number; minNights?: number; maxNights?: number; maxGuests?: number; instantBook?: boolean; pets?: boolean; localitySlug?: string } = {},
) {
  const { referenceId } = await createDraft(
    host,
    { purpose: "stay", propertyType: "villa", localityId: await locality(overrides.localitySlug ?? "calangute"), line1: "House 7, Beach Road" },
    ctx,
  );
  await updateDetails(host, referenceId, {
    title: overrides.title ?? "Sea-facing villa with a garden",
    description: "A calm three-bedroom villa five minutes from the beach, with a garden, a kitchen guests can use and fast Wi-Fi.",
    lifecycleStatus: "ready",
    carpetAreaSqft: "1800",
    bedrooms: "3",
    bathrooms: "3",
    balconies: "1",
    furnishing: "furnished",
    coveredParking: "1",
    ...BUILDING,
    unitNumber: `V-${Math.floor(Math.random() * 9000) + 1000}`,
    floorNumber: "0",
    totalFloors: "2",
  });
  await updatePricing(host, referenceId, {
    price: String(overrides.price ?? 6000),
    weekendPrice: overrides.weekendPrice ? String(overrides.weekendPrice) : "",
    cleaningFee: String(overrides.cleaningFee ?? 1000),
    spaceType: "entire_home",
    maxGuests: String(overrides.maxGuests ?? 6),
    beds: "4",
    minNights: String(overrides.minNights ?? 1),
    maxNights: String(overrides.maxNights ?? 30),
    checkInTime: "14:00",
    checkOutTime: "11:00",
    instantBook: overrides.instantBook ? "on" : "",
    cancellationPolicy: "moderate",
    petsAllowed: overrides.pets ? "on" : "",
    houseRules: "No parties. Quiet after 10 pm.",
  });
  await attachPhoto(referenceId);
  return referenceId;
}
