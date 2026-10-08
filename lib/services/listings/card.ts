import "server-only";
import { sql } from "drizzle-orm";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { conflict, invalid } from "@/lib/errors";
import { formatArea, formatDay, formatListingPrice, formatPrice, titleCase } from "@/lib/format";
import { brokerageLabel } from "@/lib/listings/brokerage";
import { CLOSED_LABELS, type ListingStatus, STATUS_LABELS, STATUS_TONES, actionLabel, availableListingActions } from "@/lib/listings/lifecycle";
import { CATEGORY_LABELS, PURPOSE_LABELS, TERMS_SCHEMAS, fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { describeTour, parseTourLink } from "@/lib/tours/terms";
import { type RequestContext, audit } from "../audit";
import { type DealContext, dealContextFor } from "../commission";
import { notify } from "../notifications";
import { findListingInScope } from "./access";
import { openPriceHistory } from "./lifecycle";
import { getListingForActor } from "./queries";
import { CANCELLATION_LABELS, SPACE_TYPE_LABELS, timeLabel } from "@/lib/stays/labels";

/**
 * The property card behind "View" in the Properties & listings table: everything about a
 * listing, plus the quick edits (price, terms, PG beds, offer) and availability actions this
 * actor may take. Values are formatted here, so the client only lays them out.
 */

type Row = Record<string, unknown>;
type Purpose = "sale" | "rent" | "lease" | "pg" | "stay";
const hhmm = (t: string) => timeLabel(t);

/** Statuses where price, terms and offers can't change: gone, retired, or already closed. */
const FROZEN: readonly ListingStatus[] = ["removed", "archived", "expired", "transacted"];

const yes = (v: unknown) => (v === null || v === undefined ? null : v ? "Yes" : "No");
const show = (v: unknown, suffix = "") =>
  v === null || v === undefined || v === "" ? null : `${typeof v === "number" ? v.toLocaleString("en-IN") : titleCase(String(v))}${suffix}`;
const rupees = (v: number | null) => (v ? formatPrice(v, { compact: false }) : null);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export type Fact = [label: string, value: string | null];

export type ListingCardData = {
  referenceId: string;
  propertyReferenceId: string;
  title: string;
  purpose: Purpose;
  purposeLabel: string;
  status: ListingStatus;
  statusLabel: string;
  statusTone: "neutral" | "info" | "success" | "warning" | "danger";
  statusReason: string | null;
  isSample: boolean;
  priceLabel: string;
  publicUrl: string | null;
  photos: { url: string; alt: string }[];
  /** The virtual tour, as the team sees it, or null when there's none. */
  tour: { summary: string; href: string; hidden: string | null; hiddenAt: boolean; reviewWaiting: boolean } | null;
  description: string | null;
  sections: { title: string; facts: Fact[] }[];
  amenities: string[];
  rooms: { id: string; label: string; rentPerBed: number; deposit: string | null; bedsAvailable: number }[];
  stats: { views: number; uniqueViewers: number; leads: number; visits: number; saves: number };
  offer: { title: string; details: string | null; validUntil: string | null; active: boolean } | null;
  priceHistory: { price: string; from: string; to: string | null }[];
  history: { label: string; reason: string | null; actor: string | null; at: string }[];
  /** Current values for the edit form. */
  terms: {
    price: number | null;
    priceNegotiable: boolean;
    depositAmount: number | null;
    maintenanceAmount: number | null;
    availableFrom: string | null;
    offerTitle: string | null;
    offerDetails: string | null;
    offerValidUntil: string | null;
    /** Homestays only. */
    weekendPrice: number | null;
    cleaningFee: number | null;
    minNights: number | null;
    maxNights: number | null;
    instantBook: boolean;
  };
  can: {
    editTerms: boolean;
    frozenReason: string | null;
    availability: { action: "mark_closed" | "reopen"; label: string; confirm: string }[];
    openFullEditor: boolean;
  };
  /** For marking a sale or rental closed: what Trustbrick's commission needs. */
  deal: DealContext | null;
  href: string;
};

export async function listingCard(actor: Actor, referenceId: string): Promise<ListingCardData> {
  const l = await getListingForActor(actor, referenceId);
  const [extra, roomRows, prices] = await Promise.all([
    db.execute(sql`
      SELECT offer_title, offer_details, to_char(offer_valid_until, 'YYYY-MM-DD') AS offer_valid_until
        FROM marketplace.listings WHERE id = ${l.id}`),
    db.execute(sql`
      SELECT id::text, occupancy::text AS occupancy, rent_per_bed, deposit_amount, beds_available, has_ac, attached_bathroom
        FROM marketplace.pg_room_offers WHERE listing_id = ${l.id}
       ORDER BY array_position(ARRAY['single','double','triple','quad'], occupancy::text), rent_per_bed, id`),
    db.execute(sql`
      SELECT price, lower(effective) AS from_at, upper(effective) AS to_at FROM marketplace.listing_prices
       WHERE listing_id = ${l.id} ORDER BY lower(effective) DESC LIMIT 10`),
  ]);
  const x = extra.rows[0] as Row;
  const purpose = l.purpose;
  const r = l.residential;
  const c = l.commercial;
  const land = l.land;
  const pg = l.pg;
  const p = l.property;

  const asAdmin = can(actor, "listings.manage", "platform");
  const owner = actor.workspace === "professional" && can(actor, "listings.edit");
  const frozen = FROZEN.includes(l.status);
  const availability = availableListingActions(actor, l.status)
    .filter((a): a is "mark_closed" | "reopen" => a === "mark_closed" || a === "reopen")
    .map((a) => ({
      action: a,
      label: actionLabel(a, purpose),
      confirm:
        a === "mark_closed"
          ? `It leaves the marketplace straight away and shows as ${CLOSED_LABELS[purpose].status.toLowerCase()} in the workspace. You can mark it available again later.`
          : "It goes back on the marketplace with its current details and price.",
    }));

  const sections: ListingCardData["sections"] = [
    {
      title: "Property",
      facts: [
        ["Type", `${l.type.name} · ${CATEGORY_LABELS[l.type.category]}`],
        ["Purpose", PURPOSE_LABELS[purpose]],
        ["Construction", show(p.lifecycleStatus)],
        ...(r
          ? ([
              ["Bedrooms", show(r.bedrooms)],
              ["Bathrooms", show(r.bathrooms)],
              ["Balconies", show(r.balconies)],
              ["Furnishing", show(r.furnishing)],
              ["Facing", show(r.facing)],
              ["Covered parking", show(r.covered_parking)],
            ] as Fact[])
          : []),
        ...(c
          ? ([
              ["Fit-out", show(c.fitout_status)],
              ["Grade", show(c.grade)],
              ["Workstations", show(c.workstations)],
              ["Washrooms", show(c.washrooms)],
              ["Parking spaces", show(c.parking_spaces)],
              ["Power backup", show(c.power_backup)],
              ["Loading access", yes(c.loading_access)],
              ["Suitable for", (c.suitable_for as string) ?? null],
            ] as Fact[])
          : []),
        ...(land
          ? ([
              ["Plot area", land.plot_area_sqyd ? `${Number(land.plot_area_sqyd).toLocaleString("en-IN")} sq yd` : null],
              ["Land use", show(land.zoning)],
              ["Road width", show(land.road_width_ft, " ft")],
              ["Frontage", show(land.frontage_ft, " ft")],
              ["Corner plot", yes(land.corner_plot)],
              ["Survey number", (land.survey_number as string) ?? null],
            ] as Fact[])
          : []),
        ...(pg.attributes
          ? ([
              ["Rooms / beds", `${pg.attributes.total_rooms} rooms · ${pg.attributes.total_beds} beds`],
              ["For", pg.terms ? show(pg.terms.gender_policy === "any" ? "co-living" : pg.terms.gender_policy) : null],
              ["Meals", pg.terms ? ({ none: "No meals", breakfast: "Breakfast", two: "Two meals a day", three: "Three meals a day" } as Record<string, string>)[String(pg.terms.meals)] ?? null : null],
              ["Curfew", (pg.terms?.entry_curfew as string) ?? null],
              ["Notice period", pg.terms?.notice_period_days ? `${pg.terms.notice_period_days} days` : null],
            ] as Fact[])
          : []),
        ["Carpet area", p.carpetAreaSqft ? formatArea(p.carpetAreaSqft) : null],
        ["Built-up area", p.builtUpAreaSqft ? formatArea(p.builtUpAreaSqft) : null],
        ["Floor", p.floorNumber !== null ? `${p.floorNumber}${p.totalFloors ? ` of ${p.totalFloors}` : ""}` : null],
        ["Year built", p.yearBuilt ? String(p.yearBuilt) : null],
        ["Ownership", show(p.ownershipType)],
        ["Property verification", titleCase(p.verificationStatus)],
      ],
    },
    ...(l.stay
      ? [
          {
            title: "Home Stay",
            facts: [
              ["Guests get", SPACE_TYPE_LABELS[l.stay.spaceType].label],
              ["Up to", `${l.stay.maxGuests} guests · ${l.stay.beds} beds`],
              ["Weekend price", l.stay.weekendPrice ? `${rupees(l.stay.weekendPrice)}/night` : null],
              ["Cleaning fee", l.stay.cleaningFee ? rupees(l.stay.cleaningFee) : null],
              ["Stay length", `${l.stay.minNights}–${l.stay.maxNights} nights`],
              ["Check-in / out", `From ${hhmm(l.stay.checkInTime)} · by ${hhmm(l.stay.checkOutTime)}`],
              ["Booking", l.stay.instantBook ? "Instant book" : "Host approves each request"],
              ["Cancellation", CANCELLATION_LABELS[l.stay.cancellationPolicy].label],
              ["Pets / smoking / events", [l.stay.petsAllowed ? "Pets" : null, l.stay.smokingAllowed ? "Smoking" : null, l.stay.eventsAllowed ? "Events" : null].filter(Boolean).join(", ") || "None allowed"],
            ] as Fact[],
          },
        ]
      : []),
    {
      title: purpose === "stay" ? "Price" : "Price and terms",
      facts: [
        [purpose === "sale" ? "Price" : purpose === "pg" ? "Lowest rent per bed" : purpose === "stay" ? "Nightly price" : "Monthly rent", formatListingPrice(l.pricing.price, purpose)],
        ["Negotiable", purpose === "pg" || purpose === "stay" ? null : l.pricing.priceNegotiable ? "Yes" : "No"],
        ["Deposit", rupees(l.pricing.depositAmount)],
        ["Maintenance", l.pricing.maintenanceAmount ? `${rupees(l.pricing.maintenanceAmount)}/mo` : null],
        ["Available from", l.pricing.availableFrom ? formatDay(l.pricing.availableFrom) : null],
        ["Lease / minimum stay", l.pricing.leaseDurationMonths ? `${l.pricing.leaseDurationMonths} months` : null],
        ["RERA", l.pricing.reraId],
        ["Brokerage", brokerageLabel(l.pricing.brokerageType, l.pricing.brokerageValue, l.pricing.brokerageNegotiable)],
      ],
    },
    {
      title: "Location",
      facts: [
        ["Address", [l.location.line1, l.location.line2, l.location.landmark].filter(Boolean).join(", ") || null],
        ["Locality", [l.location.locality, l.location.city].filter(Boolean).join(", ")],
        ["PIN", l.location.postalCode],
        ["Unit", l.location.unitNumber],
      ],
    },
    {
      title: "Responsibility",
      facts: [
        ["Agent", l.agent ? `${l.agent.name}${l.agent.referenceId ? ` (${l.agent.referenceId})` : ""}` : null],
        ["Organization", `${l.organization.name} (${l.organization.referenceId})`],
        ["Created", formatDay(l.createdAt)],
        ["Submitted", l.submittedAt ? formatDay(l.submittedAt) : null],
        ["Published", l.publishedAt ? formatDay(l.publishedAt) : null],
        ["Last updated", formatDay(l.updatedAt)],
      ],
    },
  ];

  const offerTitle = (x.offer_title as string) ?? null;
  const offerValidUntil = (x.offer_valid_until as string) ?? null;

  const deal = availability.some((a) => a.action === "mark_closed") ? await dealContextFor(l) : null;

  return {
    deal,
    referenceId: l.referenceId,
    propertyReferenceId: l.propertyReferenceId,
    title: l.title,
    purpose,
    purposeLabel: PURPOSE_LABELS[purpose],
    status: l.status,
    statusLabel: l.status === "transacted" ? CLOSED_LABELS[purpose].status : STATUS_LABELS[l.status],
    statusTone: STATUS_TONES[l.status],
    statusReason: l.statusReason,
    isSample: l.isSample,
    priceLabel: formatListingPrice(l.pricing.price, purpose),
    publicUrl: l.status === "published" ? `/listings/${l.referenceId}` : null,
    photos: l.media
      .filter((m) => m.kind === "photo")
      .slice(0, 8)
      .map((m, i) => ({ url: m.thumbnailUrl ?? m.url, alt: m.altText ?? `Photo ${i + 1}` })),
    tour: (() => {
      const rooms = l.media.filter((m) => m.kind === "panorama").length;
      const model = l.media.some((m) => m.kind === "model_3d");
      const link = l.tourUrl ? (parseTourLink(l.tourUrl)?.provider.name ?? null) : null;
      if (!rooms && !model && !link) return null;
      return {
        summary: describeTour({ rooms, model, link }),
        href: `/properties/${l.referenceId}/tour`,
        hidden: l.tourHidden?.reason ?? null,
        hiddenAt: l.tourHidden !== null,
        reviewWaiting: l.cases.some((c) => c.caseType === "tour_review" && (c.status === "open" || c.status === "in_review")),
      };
    })(),
    description: l.description,
    sections: sections.map((s) => ({ ...s, facts: s.facts.filter(([, v]) => v !== null && v !== "") })),
    amenities: [...l.amenityNames, ...l.customAmenities],
    rooms: (roomRows.rows as Row[]).map((room) => ({
      id: String(room.id),
      label: `${titleCase(String(room.occupancy))}${room.has_ac ? " · AC" : ""}${room.attached_bathroom ? " · Attached bath" : ""}`,
      rentPerBed: Number(room.rent_per_bed),
      deposit: room.deposit_amount ? rupees(Number(room.deposit_amount)) : null,
      bedsAvailable: Number(room.beds_available),
    })),
    stats: l.stats,
    offer: offerTitle
      ? { title: offerTitle, details: (x.offer_details as string) ?? null, validUntil: offerValidUntil, active: !offerValidUntil || offerValidUntil >= today() }
      : null,
    priceHistory: (prices.rows as Row[]).map((h) => ({
      price: formatListingPrice(Number(h.price), purpose),
      from: new Date(h.from_at as string).toISOString(),
      to: h.to_at ? new Date(h.to_at as string).toISOString() : null,
    })),
    history: l.history.slice(0, 12).map((h) => ({
      label: `${h.fromStatus ? `${STATUS_LABELS[h.fromStatus as ListingStatus] ?? h.fromStatus} → ` : ""}${h.toStatus === "transacted" ? CLOSED_LABELS[purpose].status : (STATUS_LABELS[h.toStatus as ListingStatus] ?? h.toStatus)}`,
      reason: h.reason,
      actor: h.actorName ?? (h.action === "auto_approve" ? "Automatic" : null),
      at: h.createdAt,
    })),
    terms: {
      price: l.pricing.price,
      priceNegotiable: l.pricing.priceNegotiable,
      depositAmount: l.pricing.depositAmount,
      maintenanceAmount: l.pricing.maintenanceAmount,
      availableFrom: l.pricing.availableFrom,
      offerTitle,
      offerDetails: (x.offer_details as string) ?? null,
      offerValidUntil,
      weekendPrice: l.stay?.weekendPrice ?? null,
      cleaningFee: l.stay?.cleaningFee ?? null,
      minNights: l.stay?.minNights ?? null,
      maxNights: l.stay?.maxNights ?? null,
      instantBook: l.stay?.instantBook ?? false,
    },
    can: {
      editTerms: (asAdmin || owner) && !frozen,
      frozenReason: (asAdmin || owner) && frozen ? (l.status === "transacted" ? "Mark it available again to change its price or offer." : "This listing can no longer be changed.") : null,
      availability,
      openFullEditor: owner,
    },
    href: `/properties/${l.referenceId}`,
  };
}

// ── Quick edits ──────────────────────────────────────────────────────────────

const STAY_EDIT_COLUMNS = sql`weekend_price AS stay_weekend_price, cleaning_fee AS stay_cleaning_fee, min_nights AS stay_min_nights,
  max_nights AS stay_max_nights, instant_book AS stay_instant_book`;

const TERM_COLUMNS = sql`price, price_negotiable, deposit_amount, maintenance_amount, to_char(available_from, 'YYYY-MM-DD') AS available_from,
  offer_title, offer_details, to_char(offer_valid_until, 'YYYY-MM-DD') AS offer_valid_until`;

/**
 * Price, terms and offer on a listing, including a live one, without another review.
 * Owners (agents, within their scope) and admins with listings.manage may do it; the
 * SuperAdmin and read-only admins may not. Live price changes enter the price history.
 */
export async function updateListingTerms(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext): Promise<{ changed: string[] }> {
  const asAdmin = can(actor, "listings.manage", "platform");
  if (!asAdmin) {
    if (actor.workspace !== "professional") assertCan(actor, "listings.manage", "platform");
    assertCan(actor, "listings.edit");
  }

  return db.transaction(async (tx) => {
    const listing = await findListingInScope(actor, referenceId, asAdmin ? "listings.view" : "listings.edit", { tx, lock: true });
    if (FROZEN.includes(listing.status)) {
      throw conflict(listing.status === "transacted" ? "Mark the listing available again before changing its price or offer." : "This listing can no longer be changed.");
    }
    const parsed = TERMS_SCHEMAS[listing.transactionType].safeParse(raw);
    if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
    const input = parsed.data as Record<string, unknown> & {
      availableFrom?: string;
      offerTitle?: string;
      offerDetails?: string;
      offerValidUntil?: string;
    };

    const beforeRow = (await tx.execute(sql`SELECT ${TERM_COLUMNS} FROM marketplace.listings WHERE id = ${listing.id}`)).rows[0] as Row;
    const roomsBefore = (await tx.execute(sql`SELECT id::text, rent_per_bed, beds_available FROM marketplace.pg_room_offers WHERE listing_id = ${listing.id}`)).rows as Row[];
    const stayBefore = (await tx.execute(sql`SELECT ${STAY_EDIT_COLUMNS} FROM stays.stay_terms WHERE listing_id = ${listing.id}`)).rows[0] as Row | undefined;
    const offer = sql`offer_title = ${input.offerTitle ?? null}, offer_details = ${input.offerTitle ? (input.offerDetails ?? null) : null},
                      offer_valid_until = ${input.offerTitle ? (input.offerValidUntil ?? null) : null}`;

    if (listing.transactionType === "stay") {
      if (!stayBefore) throw conflict("Add the nightly price and house rules in the editor first.");
      await tx.execute(sql`
        UPDATE stays.stay_terms
           SET weekend_price = ${(input.weekendPrice as number | undefined) ?? null}, cleaning_fee = ${(input.cleaningFee as number | undefined) ?? null},
               min_nights = ${input.minNights as number}, max_nights = ${input.maxNights as number}, instant_book = ${Boolean(input.instantBook)}, updated_at = now()
         WHERE listing_id = ${listing.id}`);
      await tx.execute(sql`UPDATE marketplace.listings SET price = ${input.price as number}, ${offer}, updated_at = now() WHERE id = ${listing.id}`);
    } else if (listing.transactionType === "pg") {
      const rooms = (input.rooms as { id: string; rentPerBed: number; bedsAvailable: number }[]) ?? [];
      for (const room of rooms) {
        const updated = await tx.execute(sql`
          UPDATE marketplace.pg_room_offers SET rent_per_bed = ${room.rentPerBed}, beds_available = ${room.bedsAvailable}
           WHERE id = ${room.id} AND listing_id = ${listing.id} RETURNING id`);
        if (updated.rows.length !== 1) throw invalid("One of the room types no longer exists. Refresh and try again.");
      }
      // The listing's price is the lowest rent for a bed that is actually free (D10).
      await tx.execute(sql`
        UPDATE marketplace.listings SET available_from = ${input.availableFrom ?? null}, ${offer}, updated_at = now(),
               price = coalesce((SELECT min(rent_per_bed) FROM marketplace.pg_room_offers WHERE listing_id = ${listing.id} AND beds_available > 0),
                                (SELECT min(rent_per_bed) FROM marketplace.pg_room_offers WHERE listing_id = ${listing.id}), price)
         WHERE id = ${listing.id}`);
    } else {
      const rentLike = listing.transactionType !== "sale";
      await tx.execute(sql`
        UPDATE marketplace.listings
           SET price = ${input.price as number}, price_negotiable = ${Boolean(input.priceNegotiable)},
               ${rentLike ? sql`deposit_amount = ${(input.depositAmount as number | undefined) ?? null},` : sql``}
               maintenance_amount = ${(input.maintenanceAmount as number | undefined) ?? null},
               available_from = ${input.availableFrom ?? null}, ${offer}, updated_at = now()
         WHERE id = ${listing.id}`);
    }

    const afterRow = (await tx.execute(sql`SELECT ${TERM_COLUMNS} FROM marketplace.listings WHERE id = ${listing.id}`)).rows[0] as Row;
    const roomsAfter = (await tx.execute(sql`SELECT id::text, rent_per_bed, beds_available FROM marketplace.pg_room_offers WHERE listing_id = ${listing.id}`)).rows as Row[];
    const norm = (v: unknown) => (v === null || v === undefined ? null : typeof v === "boolean" ? v : String(Number.isNaN(Number(v)) ? v : Number(v)));
    const changed = Object.keys(afterRow).filter((k) => norm(beforeRow[k]) !== norm(afterRow[k]));
    const roomKey = (rows: Row[]) => JSON.stringify(rows.map((r) => [r.id, Number(r.rent_per_bed), Number(r.beds_available)]).sort());
    if (roomKey(roomsBefore) !== roomKey(roomsAfter)) changed.push("rooms");
    const stayAfter = (await tx.execute(sql`SELECT ${STAY_EDIT_COLUMNS} FROM stays.stay_terms WHERE listing_id = ${listing.id}`)).rows[0] as Row | undefined;
    if (stayBefore && stayAfter) for (const k of Object.keys(stayAfter)) if (norm(stayBefore[k]) !== norm(stayAfter[k])) changed.push(k);
    if (changed.length === 0) return { changed };

    if (changed.includes("price") && listing.status === "published") {
      await openPriceHistory(tx, { ...listing, price: Number(afterRow.price) }, actor.userId);
    }
    const pickChanged = (row: Row) => Object.fromEntries(changed.filter((k) => k in row).map((k) => [k, row[k]]));
    await audit(
      tx,
      actor,
      {
        event: "LISTING_TERMS_UPDATED",
        target: { type: "listing", id: listing.id, referenceId: listing.referenceId },
        organizationId: listing.organizationId,
        before: { ...pickChanged(beforeRow), ...(stayBefore ? pickChanged(stayBefore) : {}), ...(changed.includes("rooms") ? { rooms: roomsBefore } : {}) },
        after: { ...pickChanged(afterRow), ...(stayAfter ? pickChanged(stayAfter) : {}), ...(changed.includes("rooms") ? { rooms: roomsAfter } : {}) },
      },
      ctx,
    );
    if (listing.primaryAgentUserId && listing.primaryAgentUserId !== actor.userId && asAdmin) {
      await notify(tx, [listing.primaryAgentUserId], {
        type: "listing_updated",
        title: `Trustbrick updated ${changed.includes("price") ? "the price" : changed.some((k) => k.startsWith("offer")) ? "the offer" : "the terms"} on ${listing.referenceId}`,
        body: listing.title,
        link: `/properties/${listing.referenceId}`,
      });
    }
    return { changed };
  });
}
