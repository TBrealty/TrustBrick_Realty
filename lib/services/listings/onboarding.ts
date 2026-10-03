import "server-only";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { assertCan } from "@/lib/authz";
import { purposesForRoles } from "@/lib/authz/catalog";
import type { Actor } from "@/lib/authz/actor";
import { type Tx, db } from "@/lib/db";
import { listingAgents, listingStatusHistory, listings, pgListingTerms, pgRoomOffers } from "@/lib/db/schema/marketplace";
import { stayTerms } from "@/lib/db/schema/stays";
import {
  commercialAttributes,
  landAttributes,
  pgAttributes,
  properties,
  propertyAmenities,
  residentialAttributes,
} from "@/lib/db/schema/real-estate";
import { AppError, conflict, invalid, isUniqueViolation } from "@/lib/errors";
import { isEditable } from "@/lib/listings/lifecycle";
import { MAP_LINK_MESSAGES, type Pin } from "@/lib/listings/map-link";
import {
  DETAILS_SCHEMAS,
  PRICING_SCHEMAS,
  type StartInput,
  TITLE_MAX,
  amenitiesSchema,
  brokerageToStore,
  commercialDetailsSchema,
  fieldErrorsFrom,
  landDetailsSchema,
  locationSchema,
  pgDetailsSchema,
  pgPricingSchema,
  rentPricingSchema,
  residentialDetailsSchema,
  salePricingSchema,
  startSchema,
  stayPricingSchema,
} from "@/lib/listings/onboarding-schema";
import { type RequestContext, audit } from "../audit";
import { resolveMapLink } from "../map-links";
import { type ListingRecord, findListingInScope } from "./access";

type Row = Record<string, unknown>;

// ── Reference data for the wizard: all from the database, none hard-coded in components ──

export type OnboardingOptions = {
  types: { code: string; name: string; category: string; purposes: string[] }[];
  cities: { id: string; name: string; state: string; localities: { id: string; name: string; lat: number; lng: number }[] }[];
  amenities: { code: string; name: string; category: string }[];
};

export async function getOnboardingOptions(): Promise<OnboardingOptions> {
  const [types, places, amenities] = await Promise.all([
    db.execute(sql`SELECT code, name, category, purposes FROM real_estate.property_types WHERE is_active ORDER BY sort_order`),
    db.execute(sql`
      SELECT city.id AS city_id, city.name AS city_name, state.name AS state_name, loc.id, loc.name,
             ST_Y(loc.centroid::geometry) AS lat, ST_X(loc.centroid::geometry) AS lng
        FROM geography.places loc
        JOIN geography.places city ON city.id = loc.parent_id AND city.place_type = 'city' AND city.is_active
        JOIN geography.places state ON state.id = city.parent_id
       WHERE loc.place_type = 'locality' AND loc.is_active
       ORDER BY city.name, loc.name`),
    db.execute(sql`SELECT code, name, category FROM real_estate.amenities ORDER BY sort_order`),
  ]);
  const cities = new Map<string, OnboardingOptions["cities"][number]>();
  for (const r of places.rows as Row[]) {
    const id = String(r.city_id);
    if (!cities.has(id)) cities.set(id, { id, name: String(r.city_name), state: String(r.state_name), localities: [] });
    cities.get(id)!.localities.push({ id: String(r.id), name: String(r.name), lat: Number(r.lat), lng: Number(r.lng) });
  }
  return {
    types: (types.rows as Row[]).map((r) => ({ code: String(r.code), name: String(r.name), category: String(r.category), purposes: r.purposes as string[] })),
    cities: [...cities.values()],
    amenities: (amenities.rows as Row[]).map((r) => ({ code: String(r.code), name: String(r.name), category: String(r.category) })),
  };
}

/** Reference IDs come from 40 random bits; on the rare collision, redo the whole transaction. */
async function withReferenceRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const constraint = ((error as { cause?: { constraint?: string } })?.cause?.constraint ?? "") as string;
      if (attempt < 3 && isUniqueViolation(error) && constraint.endsWith("_reference_id_unique")) continue;
      throw error;
    }
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(result.error));
  return result.data;
}

/** The pin from the pasted map link, or null for "use the locality's centre". */
async function pinFrom(mapLink: string | undefined): Promise<Pin | null> {
  if (!mapLink) return null;
  const result = await resolveMapLink(mapLink);
  if (result.ok) return result.pin;
  const message = result.reason === "short_link" ? MAP_LINK_MESSAGES.no_pin : MAP_LINK_MESSAGES[result.reason];
  throw invalid("Please check the highlighted fields.", { mapLink: message });
}

const pointSql = (pin: Pin | null, localityId: string) =>
  pin ? sql`ST_SetSRID(ST_MakePoint(${pin.longitude}, ${pin.latitude}), 4326)::geography` : sql`(SELECT centroid FROM geography.places WHERE id = ${localityId})`;

// ── Create: purpose, type and location make a draft straight away ──────────────

export async function createDraft(actor: Actor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  assertCan(actor, "listings.create");
  if (actor.workspace !== "professional") throw new AppError("FORBIDDEN");
  const input: StartInput = parse(startSchema, raw);
  // Hosts may list homestays only; agents may list anything.
  if (!purposesForRoles(actor.roles).includes(input.purpose)) {
    throw invalid("You can't list a property for that purpose.", { purpose: "Not available for your account" });
  }

  const [typeResult, placeResult] = await Promise.all([
    db.execute(sql`SELECT id, name, category, purposes FROM real_estate.property_types WHERE code = ${input.propertyType} AND is_active`),
    db.execute(sql`SELECT id, name FROM geography.places WHERE id = ${input.localityId} AND place_type = 'locality' AND is_active`),
  ]);
  const type = typeResult.rows[0] as Row | undefined;
  const place = placeResult.rows[0] as Row | undefined;
  if (!type) throw invalid("Choose a property type.", { propertyType: "Choose a property type" });
  if (!(type.purposes as string[]).includes(input.purpose)) {
    throw invalid("That property type can't be offered for this purpose.", { propertyType: "Not available for this purpose" });
  }
  if (!place) throw invalid("Choose a locality.", { localityId: "Choose a locality" });
  const pin = await pinFrom(input.mapLink);

  const typeName = String(type.name);
  const draftTitle = `${typeName} in ${String(place.name)}`.slice(0, TITLE_MAX);
  const source = actor.organization.orgType === "personal" ? "user_submitted" : "org_submitted";

  return withReferenceRetry(() =>
    db.transaction(async (tx) => {
      const location = pointSql(pin, input.localityId);
      const address = await tx.execute(sql`
        INSERT INTO geography.addresses (id, place_id, line1, line2, landmark, postal_code, location)
        VALUES (gen_random_uuid(), ${input.localityId}, ${input.line1}, ${input.line2 ?? null}, ${input.landmark ?? null},
                ${input.postalCode ?? null}, ${location})
        RETURNING id`);
      const addressId = String((address.rows[0] as Row).id);

      const [property] = await tx
        .insert(properties)
        .values({
          addressId,
          propertyTypeId: String(type.id),
          organizationId: actor.organization.id,
          lifecycleStatus: "ready",
          source,
          createdBy: actor.userId,
        })
        .returning({ id: properties.id, referenceId: properties.referenceId });

      const [listing] = await tx
        .insert(listings)
        .values({
          propertyId: property.id,
          organizationId: actor.organization.id,
          createdBy: actor.userId,
          transactionType: input.purpose,
          status: "draft",
          title: draftTitle,
        })
        .returning({ id: listings.id, referenceId: listings.referenceId });

      await tx.insert(listingAgents).values({
        listingId: listing.id,
        agentUserId: actor.userId,
        membershipId: actor.membershipId,
        role: "primary",
        assignedBy: actor.userId,
      });
      await tx.insert(listingStatusHistory).values({ listingId: listing.id, fromStatus: null, toStatus: "draft", action: "create", actorUserId: actor.userId });
      await audit(
        tx,
        actor,
        {
          event: "PROPERTY_CREATED",
          target: { type: "property", id: property.id, referenceId: property.referenceId },
          organizationId: actor.organization.id,
          metadata: { listing: listing.referenceId, purpose: input.purpose, type: input.propertyType },
        },
        ctx,
      );
      return { referenceId: listing.referenceId };
    }),
  );
}

// ── Edit: every section re-checks scope and editability inside its transaction ─

async function editable(tx: Tx, actor: Actor, referenceId: string): Promise<ListingRecord> {
  const listing = await findListingInScope(actor, referenceId, "listings.edit", { tx, lock: true });
  if (!isEditable(listing.status)) {
    throw conflict("This listing can't be edited in its current state. Withdraw it first to make changes.");
  }
  return listing;
}

const touch = (tx: Tx, listingId: string) => tx.update(listings).set({ updatedAt: new Date() }).where(eq(listings.id, listingId));

export async function updateLocation(actor: Actor, referenceId: string, raw: unknown) {
  const input = parse(locationSchema, raw);
  const pin = await pinFrom(input.mapLink);
  await db.transaction(async (tx) => {
    const listing = await editable(tx, actor, referenceId);
    const place = await tx.execute(sql`SELECT id FROM geography.places WHERE id = ${input.localityId} AND place_type = 'locality' AND is_active`);
    if (!place.rows[0]) throw invalid("Choose a locality.", { localityId: "Choose a locality" });
    const location = pointSql(pin, input.localityId);
    await tx.execute(sql`
      UPDATE geography.addresses
         SET place_id = ${input.localityId}, line1 = ${input.line1}, line2 = ${input.line2 ?? null},
             landmark = ${input.landmark ?? null}, postal_code = ${input.postalCode ?? null}, location = ${location}, updated_at = now()
       WHERE id = ${listing.addressId}`);
    await touch(tx, listing.id);
  });
}

export async function updateDetails(actor: Actor, referenceId: string, raw: unknown) {
  await db.transaction(async (tx) => {
    const listing = await editable(tx, actor, referenceId);
    const schema = DETAILS_SCHEMAS[listing.category];
    const base = parse(schema, raw) as z.infer<typeof schema>;

    await tx
      .update(listings)
      .set({ title: base.title, description: base.description ?? null, updatedAt: new Date() })
      .where(eq(listings.id, listing.id));

    switch (listing.category) {
      case "residential": {
        const d = parse(residentialDetailsSchema, raw);
        await tx.update(properties).set(buildingFields(d)).where(eq(properties.id, listing.propertyId));
        const values = {
          bedrooms: d.bedrooms,
          bathrooms: d.bathrooms,
          balconies: d.balconies,
          furnishing: d.furnishing,
          facing: d.facing ?? null,
          coveredParking: d.coveredParking,
        };
        await tx
          .insert(residentialAttributes)
          .values({ propertyId: listing.propertyId, ...values })
          .onConflictDoUpdate({ target: residentialAttributes.propertyId, set: values });
        break;
      }
      case "commercial": {
        const d = parse(commercialDetailsSchema, raw);
        await tx.update(properties).set(buildingFields(d)).where(eq(properties.id, listing.propertyId));
        const values = {
          fitoutStatus: d.fitoutStatus,
          grade: d.grade ?? null,
          workstations: d.workstations ?? null,
          washrooms: d.washrooms ?? null,
          parkingSpaces: d.parkingSpaces ?? null,
          powerBackup: d.powerBackup ?? null,
          loadingAccess: d.loadingAccess,
          suitableFor: d.suitableFor ?? null,
        };
        await tx
          .insert(commercialAttributes)
          .values({ propertyId: listing.propertyId, ...values })
          .onConflictDoUpdate({ target: commercialAttributes.propertyId, set: values });
        break;
      }
      case "land": {
        const d = parse(landDetailsSchema, raw);
        await tx
          .update(properties)
          .set({ lifecycleStatus: d.lifecycleStatus, ownershipType: d.ownershipType, yearBuilt: null, updatedAt: new Date() })
          .where(eq(properties.id, listing.propertyId));
        const values = {
          plotAreaSqyd: d.plotAreaSqyd,
          zoning: d.zoning,
          roadWidthFt: d.roadWidthFt ?? null,
          frontageFt: d.frontageFt ?? null,
          cornerPlot: d.cornerPlot,
          boundaryWall: d.boundaryWall,
          surveyNumber: d.surveyNumber ?? null,
        };
        await tx
          .insert(landAttributes)
          .values({ propertyId: listing.propertyId, ...values })
          .onConflictDoUpdate({ target: landAttributes.propertyId, set: values });
        break;
      }
      case "co_living": {
        const d = parse(pgDetailsSchema, raw);
        await tx
          .update(properties)
          .set({ lifecycleStatus: d.lifecycleStatus, ownershipType: d.ownershipType, yearBuilt: d.yearBuilt, updatedAt: new Date() })
          .where(eq(properties.id, listing.propertyId));
        const physical = { totalRooms: d.totalRooms, totalBeds: d.totalBeds, attachedBathrooms: d.attachedBathrooms, commonKitchen: d.commonKitchen };
        await tx
          .insert(pgAttributes)
          .values({ propertyId: listing.propertyId, ...physical })
          .onConflictDoUpdate({ target: pgAttributes.propertyId, set: physical });
        const terms = {
          genderPolicy: d.genderPolicy,
          meals: d.meals,
          foodPreference: d.meals === "none" ? null : (d.foodPreference ?? null),
          noticePeriodDays: d.noticePeriodDays ?? null,
          lockInMonths: d.lockInMonths ?? null,
          entryCurfew: d.entryCurfew ?? null,
          visitorsAllowed: d.visitorsAllowed,
          houseRules: d.houseRules ?? null,
        };
        await tx
          .insert(pgListingTerms)
          .values({ listingId: listing.id, ...terms })
          .onConflictDoUpdate({ target: pgListingTerms.listingId, set: terms });
        break;
      }
    }
  });
}

type BuildingInput = z.infer<typeof residentialDetailsSchema> | z.infer<typeof commercialDetailsSchema>;

function buildingFields(d: BuildingInput) {
  return {
    lifecycleStatus: d.lifecycleStatus,
    ownershipType: d.ownershipType,
    yearBuilt: d.yearBuilt,
    carpetAreaSqft: d.carpetAreaSqft,
    builtUpAreaSqft: d.builtUpAreaSqft ?? null,
    superBuiltUpAreaSqft: d.superBuiltUpAreaSqft ?? null,
    floorNumber: d.floorNumber,
    totalFloors: d.totalFloors,
    unitNumber: d.unitNumber ?? null,
    updatedAt: new Date(),
  };
}

export async function updatePricing(actor: Actor, referenceId: string, raw: unknown) {
  await db.transaction(async (tx) => {
    const listing = await editable(tx, actor, referenceId);
    // Parse against the purpose's own schema; the generic lookup keeps the types honest.
    parse(PRICING_SCHEMAS[listing.transactionType], raw);

    switch (listing.transactionType) {
      case "sale": {
        const p = parse(salePricingSchema, raw);
        await tx
          .update(listings)
          .set({
            price: p.price,
            priceNegotiable: p.priceNegotiable,
            maintenanceAmount: p.maintenanceAmount ?? null,
            declaredMonthlyRent: p.declaredMonthlyRent || null,
            reraId: p.reraId ?? null,
            availableFrom: p.availableFrom ?? null,
            ...brokerageToStore(p),
            depositAmount: null,
            leaseDurationMonths: null,
            updatedAt: new Date(),
          })
          .where(eq(listings.id, listing.id));
        break;
      }
      case "rent":
      case "lease": {
        const p = parse(rentPricingSchema, raw);
        await tx
          .update(listings)
          .set({
            price: p.price,
            priceNegotiable: p.priceNegotiable,
            depositAmount: p.depositAmount ?? null,
            maintenanceAmount: p.maintenanceAmount ?? null,
            availableFrom: p.availableFrom ?? null,
            leaseDurationMonths: p.leaseDurationMonths ?? null,
            ...brokerageToStore(p),
            declaredMonthlyRent: null,
            updatedAt: new Date(),
          })
          .where(eq(listings.id, listing.id));
        break;
      }
      case "pg": {
        const p = parse(pgPricingSchema, raw);
        await tx.delete(pgRoomOffers).where(eq(pgRoomOffers.listingId, listing.id));
        await tx.insert(pgRoomOffers).values(
          p.rooms.map((r) => ({
            listingId: listing.id,
            occupancy: r.occupancy,
            rentPerBed: r.rentPerBed,
            depositAmount: r.depositAmount ?? null,
            bedsAvailable: r.bedsAvailable,
            hasAc: r.hasAc,
            attachedBathroom: r.attachedBathroom,
          })),
        );
        // The listing's price is the lowest rent for a bed that is actually free (D10).
        const free = p.rooms.filter((r) => r.bedsAvailable > 0);
        const price = Math.min(...(free.length ? free : p.rooms).map((r) => r.rentPerBed));
        await tx
          .update(listings)
          .set({ price, availableFrom: p.availableFrom ?? null, updatedAt: new Date() })
          .where(eq(listings.id, listing.id));
        break;
      }
      case "stay": {
        const p = parse(stayPricingSchema, raw);
        const terms = {
          spaceType: p.spaceType,
          maxGuests: p.maxGuests,
          beds: p.beds,
          weekendPrice: p.weekendPrice ?? null,
          cleaningFee: p.cleaningFee ?? null,
          minNights: p.minNights,
          maxNights: p.maxNights,
          checkInTime: p.checkInTime,
          checkOutTime: p.checkOutTime,
          instantBook: p.instantBook,
          cancellationPolicy: p.cancellationPolicy,
          petsAllowed: p.petsAllowed,
          smokingAllowed: p.smokingAllowed,
          eventsAllowed: p.eventsAllowed,
          houseRules: p.houseRules ?? null,
          updatedAt: new Date(),
        };
        await tx.insert(stayTerms).values({ listingId: listing.id, ...terms }).onConflictDoUpdate({ target: stayTerms.listingId, set: terms });
        // The base nightly price is the listing's price, so stays sort and filter like any listing.
        await tx
          .update(listings)
          .set({ price: p.price, priceNegotiable: false, depositAmount: null, maintenanceAmount: null, brokerageType: null, brokerageValue: null, brokerageNegotiable: false, updatedAt: new Date() })
          .where(eq(listings.id, listing.id));
        break;
      }
    }
  });
}

/**
 * The standard amenities ticked, and the agent's own. A typed amenity that matches a standard
 * one by name ticks that one instead, so it stays searchable.
 */
export async function updateAmenities(actor: Actor, referenceId: string, raw: unknown) {
  const { amenities: ticked, custom } = parse(amenitiesSchema, raw);
  await db.transaction(async (tx) => {
    const listing = await editable(tx, actor, referenceId);
    const { rows } = await tx.execute(sql`SELECT code, lower(name) AS name FROM real_estate.amenities`);
    const byName = new Map((rows as Row[]).map((r) => [String(r.name), String(r.code)]));
    const codes = new Set(ticked);
    const own: string[] = [];
    for (const name of custom) {
      const code = byName.get(name.toLowerCase());
      if (code) codes.add(code);
      else own.push(name);
    }
    await tx.delete(propertyAmenities).where(eq(propertyAmenities.propertyId, listing.propertyId));
    if (codes.size > 0) {
      await tx.execute(sql`
        INSERT INTO real_estate.property_amenities (property_id, amenity_id)
        SELECT ${listing.propertyId}, id FROM real_estate.amenities WHERE code = ANY(${sql.param([...codes])}::text[])`);
    }
    await tx.update(properties).set({ customAmenities: own, updatedAt: new Date() }).where(eq(properties.id, listing.propertyId));
    await touch(tx, listing.id);
  });
}
