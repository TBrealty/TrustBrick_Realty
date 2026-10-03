"use client";

import { useState } from "react";
import { saveAmenitiesAction, saveDetailsAction, saveLocationAction, savePricingAction } from "@/app/(workspace)/properties/actions";
import { ActionForm, Checkbox, Field, Select, Submit, TextArea, TextInput, useFieldError } from "@/components/workspace/forms";
import { BROKERAGE_LABELS, brokerageChoices } from "@/lib/listings/brokerage";
import { googleMapsLink } from "@/lib/listings/map-link";
import { BROKERAGE_NEGOTIABLE, BROKERAGE_WITH_AMOUNT, CUSTOM_AMENITY_PATTERN, TITLE_MAX, tidyAmenity } from "@/lib/listings/onboarding-schema";
import type { OnboardingOptions } from "@/lib/services/listings/onboarding";
import type { WorkspaceListing } from "@/lib/services/listings/queries";
import { CANCELLATION_LABELS, SPACE_TYPE_LABELS } from "@/lib/stays/labels";
import { CANCELLATION_POLICIES, CUSTOM_AMENITY_LIMIT, CUSTOM_AMENITY_MAX_LENGTH, FACING, FURNISHING, OWNERSHIP_TYPES, SPACE_TYPES } from "@/lib/vocab";
import { MapLinkField } from "./MapLinkField";

type L = WorkspaceListing;
/** Form default: numeric strings from the database ("11500.00") are shown as plain numbers. */
const v = (x: unknown) => (x === null || x === undefined ? undefined : typeof x === "string" && /^-?\d+\.\d+$/.test(x) ? String(Number(x)) : String(x));
const opts = (values: readonly string[], labels: Record<string, string> = {}) =>
  values.map((value) => ({ value, label: labels[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) }));

const LIFECYCLE = [
  { value: "ready", label: "Ready to move" },
  { value: "occupied", label: "Ready, currently occupied" },
  { value: "under_construction", label: "Under construction" },
  { value: "planned", label: "New launch, not started" },
];
const OWNERSHIP_LABELS = { freehold: "Freehold", leasehold: "Leasehold", cooperative_society: "Co-operative society", power_of_attorney: "Power of attorney" };

function Footer({ next }: { next?: string }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line-light pt-5 sm:flex-row sm:justify-end">
      <Submit variant="secondary">Save</Submit>
      {next && (
        <Submit name="next" value={next}>
          Save and continue
        </Submit>
      )}
    </div>
  );
}

const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

// ── Location ─────────────────────────────────────────────────────────────────

/** The map-link field, with the error the server returned for it. */
function MapLink({ defaultValue }: { defaultValue: string }) {
  return <MapLinkField defaultValue={defaultValue} error={useFieldError("mapLink")} />;
}

export function LocationForm({ listing, options }: { listing: L; options: OnboardingOptions }) {
  const initialCity = options.cities.find((c) => c.localities.some((l) => l.id === listing.location.localityId))?.id ?? "";
  const [cityId, setCityId] = useState(initialCity);
  const city = options.cities.find((c) => c.id === cityId);
  const loc = listing.location;

  return (
    <ActionForm action={saveLocationAction}>
      <input type="hidden" name="ref" value={listing.referenceId} />
      <div className={grid}>
        <div>
          <label htmlFor="city" className="mb-1.5 block text-[0.8125rem] font-medium">
            City
          </label>
          <select id="city" className="winput" value={cityId} onChange={(e) => setCityId(e.target.value)}>
            {options.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Select label="Locality" name="localityId" required defaultValue={loc.localityId} key={cityId} options={(city?.localities ?? []).map((l) => ({ value: l.id, label: l.name }))} placeholder="Choose a locality" />
        <TextInput label="Building / street" name="line1" required defaultValue={v(loc.line1)} fieldClassName="sm:col-span-2 lg:col-span-1" />
        <TextInput label="Area or sub-locality" name="line2" defaultValue={v(loc.line2)} />
        <TextInput label="Landmark" name="landmark" defaultValue={v(loc.landmark)} />
        <TextInput label="PIN code" name="postalCode" defaultValue={v(loc.postalCode)} inputMode="numeric" maxLength={6} />
      </div>
      <div className="mt-5">
        {/* A pin at the locality's centre means none was given: show the field empty, not a link to the centre. */}
        <MapLink defaultValue={loc.pinExact ? googleMapsLink(loc) : ""} />
      </div>
      <Footer next="details" />
    </ActionForm>
  );
}

// ── Details, by category ─────────────────────────────────────────────────────

/** The title, with a count of what's left: titles are kept short enough for a card. */
function TitleField({ defaultValue }: { defaultValue: string }) {
  const [length, setLength] = useState(defaultValue.length);
  const over = length > TITLE_MAX;
  return (
    <Field
      label="Listing title"
      name="title"
      required
      className="sm:col-span-2 lg:col-span-3"
      hint={
        <span className="flex justify-between gap-3">
          <span>What customers see first, e.g. “3 BHK with a park view, Kondapur”.</span>
          <span className={`shrink-0 tabular-nums ${over ? "font-medium text-brick" : ""}`} aria-live="polite">
            {length}/{TITLE_MAX}
          </span>
        </span>
      }
    >
      {(p) => <input {...p} className="winput" defaultValue={defaultValue} maxLength={over ? undefined : TITLE_MAX} onChange={(e) => setLength(e.target.value.length)} />}
    </Field>
  );
}

function Basics({ listing, withLifecycle = true }: { listing: L; withLifecycle?: boolean }) {
  return (
    <>
      <TitleField defaultValue={listing.title} />
      <TextArea
        label="Description"
        name="description"
        defaultValue={v(listing.description)}
        rows={5}
        maxLength={5000}
        fieldClassName="sm:col-span-2 lg:col-span-3"
        hint="Describe the property honestly: what's nearby, what's included, anything a visitor should know."
      />
      {withLifecycle && <Select label="Construction status" name="lifecycleStatus" required defaultValue={listing.property.lifecycleStatus} options={LIFECYCLE} />}
      <Select label="Ownership" name="ownershipType" required defaultValue={v(listing.property.ownershipType)} options={opts(OWNERSHIP_TYPES, OWNERSHIP_LABELS)} placeholder="Choose" />
    </>
  );
}

function YearBuilt({ listing }: { listing: L }) {
  return (
    <TextInput
      label="Year built"
      name="yearBuilt"
      required
      defaultValue={v(listing.property.yearBuilt)}
      inputMode="numeric"
      maxLength={4}
      placeholder="e.g. 2018"
      hint="Still being built? The year it's due to be finished."
    />
  );
}

function Building({ listing, requireCarpet = true }: { listing: L; requireCarpet?: boolean }) {
  const p = listing.property;
  const house = ["independent_house", "villa", "farmhouse"].includes(listing.type.code);
  return (
    <>
      <TextInput
        label={listing.type.category === "commercial" ? "Unit / shop number" : "Flat / unit number"}
        name="unitNumber"
        defaultValue={v(listing.location.unitNumber)}
        hint="Not shown to customers. Used to spot the same property listed twice."
      />
      <YearBuilt listing={listing} />
      <TextInput
        label="Carpet area (sq ft)"
        name="carpetAreaSqft"
        required={requireCarpet}
        defaultValue={v(p.carpetAreaSqft)}
        inputMode="decimal"
        hint="Used when buyers filter by size."
      />
      <TextInput label="Built-up area (sq ft)" name="builtUpAreaSqft" defaultValue={v(p.builtUpAreaSqft)} inputMode="decimal" />
      <TextInput label="Super built-up area (sq ft)" name="superBuiltUpAreaSqft" defaultValue={v(p.superBuiltUpAreaSqft)} inputMode="decimal" />
      <TextInput
        label="Floor number"
        name="floorNumber"
        required
        defaultValue={v(p.floorNumber) ?? (house ? "0" : undefined)}
        inputMode="numeric"
        hint={house ? "0 for a house or villa (its ground floor)." : "0 for the ground floor, negative for basements."}
      />
      <TextInput
        label={house ? "Floors in the house" : "Total floors in the building"}
        name="totalFloors"
        required
        defaultValue={v(p.totalFloors)}
        inputMode="numeric"
      />
    </>
  );
}

export function DetailsForm({ listing }: { listing: L }) {
  const r = listing.residential ?? {};
  const c = listing.commercial ?? {};
  const land = listing.land ?? {};
  const pa = listing.pg.attributes ?? {};
  const t = listing.pg.terms ?? {};
  return (
    <ActionForm action={saveDetailsAction}>
      <input type="hidden" name="ref" value={listing.referenceId} />
      <div className={grid}>
        {listing.type.category === "residential" && (
          <>
            <Basics listing={listing} />
            <Building listing={listing} />
            <TextInput label="Bedrooms" name="bedrooms" required defaultValue={v(r.bedrooms) ?? ""} inputMode="numeric" hint="0 for a studio." />
            <TextInput label="Bathrooms" name="bathrooms" required defaultValue={v(r.bathrooms) ?? ""} inputMode="numeric" />
            <TextInput label="Balconies" name="balconies" required defaultValue={v(r.balconies) ?? "0"} inputMode="numeric" />
            <Select label="Furnishing" name="furnishing" required defaultValue={v(r.furnishing)} options={opts(FURNISHING)} placeholder="Choose" />
            <Select label="Facing" name="facing" required defaultValue={v(r.facing)} options={opts(FACING)} placeholder="Choose" hint="The direction the main door faces." />
            <TextInput label="Covered parking spaces" name="coveredParking" required defaultValue={v(r.covered_parking) ?? "0"} inputMode="numeric" />
          </>
        )}
        {listing.type.category === "commercial" && (
          <>
            <Basics listing={listing} />
            <Building listing={listing} />
            <Select
              label="Fit-out"
              name="fitoutStatus"
              required
              defaultValue={v(c.fitout_status)}
              placeholder="Choose"
              options={[
                { value: "bare_shell", label: "Bare shell" },
                { value: "warm_shell", label: "Warm shell" },
                { value: "fully_fitted", label: "Fully fitted" },
              ]}
            />
            <Select label="Building grade" name="grade" defaultValue={v(c.grade)} options={opts(["A", "B", "C"])} placeholder="Not graded" />
            <TextInput label="Workstations" name="workstations" defaultValue={v(c.workstations)} inputMode="numeric" />
            <TextInput label="Washrooms" name="washrooms" defaultValue={v(c.washrooms)} inputMode="numeric" />
            <TextInput label="Parking spaces" name="parkingSpaces" defaultValue={v(c.parking_spaces)} inputMode="numeric" />
            <Select
              label="Power backup"
              name="powerBackup"
              defaultValue={v(c.power_backup)}
              placeholder="Not specified"
              options={[
                { value: "none", label: "None" },
                { value: "partial", label: "Partial" },
                { value: "full", label: "Full" },
              ]}
            />
            <TextInput label="Suitable for" name="suitableFor" defaultValue={v(c.suitable_for)} hint="e.g. Clinic, bank branch, café" fieldClassName="sm:col-span-2" />
            <div className="flex items-end pb-2">
              <Checkbox label="Loading access for goods vehicles" name="loadingAccess" defaultChecked={Boolean(c.loading_access)} />
            </div>
          </>
        )}
        {listing.type.category === "land" && (
          <>
            <Basics listing={listing} withLifecycle={false} />
            <input type="hidden" name="lifecycleStatus" value="ready" />
            <TextInput
              label="Plot area (sq yd)"
              name="plotAreaSqyd"
              required
              defaultValue={v(land.plot_area_sqyd)}
              inputMode="decimal"
              hint="Buyers filter plots by this. In square yards (gaj): if you have sq ft, divide by 9."
            />
            <Select
              label="Land use"
              name="zoning"
              required
              // Plots are for homes unless the agent says otherwise.
              defaultValue={v(land.zoning) || (["residential_plot", "open_plot"].includes(listing.type.code) ? "residential" : "")}
              placeholder="Choose"
              options={opts(["residential", "commercial", "agricultural", "industrial"])}
            />
            <TextInput label="Road width (ft)" name="roadWidthFt" defaultValue={v(land.road_width_ft)} inputMode="numeric" />
            <TextInput label="Frontage (ft)" name="frontageFt" defaultValue={v(land.frontage_ft)} inputMode="numeric" />
            <TextInput label="Survey / plot number" name="surveyNumber" defaultValue={v(land.survey_number)} hint="Optional. From public land records." />
            <div className="flex flex-col justify-end gap-2 pb-2">
              <Checkbox label="Corner plot" name="cornerPlot" defaultChecked={Boolean(land.corner_plot)} />
              <Checkbox label="Boundary wall" name="boundaryWall" defaultChecked={Boolean(land.boundary_wall)} />
            </div>
          </>
        )}
        {listing.type.category === "co_living" && (
          <>
            <Basics listing={listing} />
            <YearBuilt listing={listing} />
            <TextInput label="Rooms" name="totalRooms" required defaultValue={v(pa.total_rooms)} inputMode="numeric" />
            <TextInput label="Beds" name="totalBeds" required defaultValue={v(pa.total_beds)} inputMode="numeric" />
            <TextInput label="Rooms with attached bathroom" name="attachedBathrooms" required defaultValue={v(pa.attached_bathrooms) ?? "0"} inputMode="numeric" />
            <Select
              label="Who it's for"
              name="genderPolicy"
              required
              defaultValue={v(t.gender_policy)}
              placeholder="Choose"
              options={[
                { value: "men", label: "Men" },
                { value: "women", label: "Women" },
                { value: "any", label: "Co-living (anyone)" },
              ]}
            />
            <Select
              label="Meals"
              name="meals"
              required
              defaultValue={v(t.meals)}
              placeholder="Choose"
              options={[
                { value: "none", label: "No meals" },
                { value: "breakfast", label: "Breakfast only" },
                { value: "two", label: "Two meals a day" },
                { value: "three", label: "Three meals a day" },
              ]}
            />
            <Select
              label="Food"
              name="foodPreference"
              defaultValue={v(t.food_preference)}
              placeholder="Not applicable"
              options={[
                { value: "veg", label: "Vegetarian" },
                { value: "non_veg", label: "Non-vegetarian" },
                { value: "both", label: "Veg and non-veg" },
              ]}
            />
            <TextInput label="Notice period (days)" name="noticePeriodDays" defaultValue={v(t.notice_period_days)} inputMode="numeric" />
            <TextInput label="Lock-in (months)" name="lockInMonths" defaultValue={v(t.lock_in_months)} inputMode="numeric" />
            <TextInput label="Entry curfew" name="entryCurfew" defaultValue={v(t.entry_curfew)} placeholder="22:30" hint="24-hour time, blank if none." />
            <TextArea label="House rules" name="houseRules" defaultValue={v(t.house_rules)} rows={3} fieldClassName="sm:col-span-2 lg:col-span-3" />
            <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
              <Checkbox label="Common kitchen" name="commonKitchen" defaultChecked={Boolean(pa.common_kitchen)} />
              <Checkbox label="Visitors allowed" name="visitorsAllowed" defaultChecked={Boolean(t.visitors_allowed)} />
            </div>
          </>
        )}
      </div>
      <Footer next="pricing" />
    </ActionForm>
  );
}

// ── Pricing, by purpose ──────────────────────────────────────────────────────

const AMOUNT_LABELS: Record<string, { label: string; hint: string; suffix?: string }> = {
  percent: { label: "Brokerage (% of the price)", hint: "Up to 10%." },
  months_rent: { label: "Brokerage (months of rent)", hint: "e.g. 1 for one month's rent. Up to 3." },
  fixed: { label: "Brokerage amount (₹)", hint: "The fixed fee, in rupees." },
};

/** Brokerage: the amount and "negotiable" appear only for a choice that has them. */
function BrokerageFields({ listing }: { listing: L }) {
  const p = listing.pricing;
  const [type, setType] = useState(p.brokerageType ?? "");
  const choices = brokerageChoices(listing.purpose);
  // Keep a saved choice selectable even if it's no longer offered for this purpose.
  const values = p.brokerageType && !choices.includes(p.brokerageType as never) ? [...choices, p.brokerageType] : choices;
  const amount = AMOUNT_LABELS[type];
  const negotiable = (BROKERAGE_NEGOTIABLE as readonly string[]).includes(type);
  const hint =
    type === "half_month"
      ? p.price
        ? `Half a month's rent: ₹${Math.round(p.price / 2).toLocaleString("en-IN")}.`
        : "Half of one month's rent."
      : type === "flexible"
        ? "To be agreed with the customer."
        : undefined;
  return (
    <>
      <Select
        label="Brokerage"
        name="brokerageType"
        value={type}
        onChange={(e) => setType(e.target.value)}
        options={values.map((value) => ({ value, label: BROKERAGE_LABELS[value as keyof typeof BROKERAGE_LABELS] ?? value }))}
        placeholder="Not specified"
        hint={hint}
      />
      {(BROKERAGE_WITH_AMOUNT as readonly string[]).includes(type) && amount && (
        <TextInput key={type} label={amount.label} name="brokerageValue" required defaultValue={type === p.brokerageType ? v(p.brokerageValue) : undefined} inputMode="decimal" hint={amount.hint} />
      )}
      {negotiable && (
        <div className="flex items-end pb-2">
          <Checkbox label="Brokerage is negotiable" name="brokerageNegotiable" defaultChecked={p.brokerageNegotiable} />
        </div>
      )}
    </>
  );
}

export function PricingForm({ listing }: { listing: L }) {
  const p = listing.pricing;
  if (listing.purpose === "pg") return <PgRoomsForm listing={listing} />;
  if (listing.purpose === "stay") return <StayTermsForm listing={listing} />;
  const rentLike = listing.purpose === "rent" || listing.purpose === "lease";
  return (
    <ActionForm action={savePricingAction}>
      <input type="hidden" name="ref" value={listing.referenceId} />
      <div className={grid}>
        <div>
          <TextInput label={rentLike ? "Monthly rent (₹)" : "Price (₹)"} name="price" required defaultValue={v(p.price)} inputMode="numeric" />
          <div className="mt-2">
            <Checkbox label={rentLike ? "Rent is negotiable" : "Price is negotiable"} name="priceNegotiable" defaultChecked={p.priceNegotiable} />
          </div>
        </div>
        {rentLike && <TextInput label="Security deposit (₹)" name="depositAmount" defaultValue={v(p.depositAmount)} inputMode="numeric" />}
        <TextInput label="Maintenance per month (₹)" name="maintenanceAmount" defaultValue={v(p.maintenanceAmount)} inputMode="numeric" />
        {listing.purpose === "lease" && <TextInput label="Lease term (months)" name="leaseDurationMonths" required defaultValue={v(p.leaseDurationMonths)} inputMode="numeric" />}
        {listing.purpose === "rent" && <TextInput label="Minimum stay (months)" name="leaseDurationMonths" defaultValue={v(p.leaseDurationMonths)} inputMode="numeric" />}
        <TextInput label={rentLike ? "Available from" : "Possession from"} name="availableFrom" type="date" defaultValue={v(p.availableFrom)} />
        {listing.purpose === "sale" && (
          <>
            <TextInput label="RERA registration" name="reraId" defaultValue={v(p.reraId)} hint="Required by law for most new projects. Shown to customers." />
            <TextInput
              label="Current monthly rent it earns (₹)"
              name="declaredMonthlyRent"
              defaultValue={v(p.declaredMonthlyRent)}
              inputMode="numeric"
              hint="Optional. Shown to investors as a declared yield, never as an estimate."
            />
          </>
        )}
      </div>
      <fieldset className="mt-6 border-t border-line-light pt-5">
        <legend className="mb-3 text-[0.8125rem] font-medium">Brokerage</legend>
        <div className={grid}>
          <BrokerageFields listing={listing} />
        </div>
      </fieldset>
      <Footer next="amenities" />
    </ActionForm>
  );
}

/** Homestays: what guests get, the nightly price, and the rules they agree to. */
function StayTermsForm({ listing }: { listing: L }) {
  const t = listing.stay;
  const bedrooms = listing.residential?.bedrooms;
  return (
    <ActionForm action={savePricingAction}>
      <input type="hidden" name="ref" value={listing.referenceId} />
      <fieldset className="mb-6">
        <legend className="mb-2 text-[0.8125rem] font-medium">What guests get</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SPACE_TYPES.map((value) => (
            <label key={value} className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-line-light p-3 has-[:checked]:border-ink">
              <input type="radio" name="spaceType" value={value} defaultChecked={(t?.spaceType ?? "entire_home") === value} className="mt-0.5 accent-ink" />
              <span>
                <span className="block text-[0.875rem] font-medium">{SPACE_TYPE_LABELS[value].label}</span>
                <span className="block text-[0.75rem] text-stone-deep">{SPACE_TYPE_LABELS[value].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={grid}>
        <TextInput label="Price per night (₹)" name="price" required defaultValue={v(listing.pricing.price)} inputMode="numeric" hint="What guests pay per night on weekdays." />
        <TextInput label="Weekend price per night (₹)" name="weekendPrice" defaultValue={v(t?.weekendPrice)} inputMode="numeric" hint="Friday and Saturday nights. Leave blank to use the same price." />
        <TextInput label="Cleaning fee (₹, once per stay)" name="cleaningFee" defaultValue={v(t?.cleaningFee)} inputMode="numeric" />
        <TextInput label="Maximum guests" name="maxGuests" required defaultValue={v(t?.maxGuests)} inputMode="numeric" />
        <TextInput label="Beds" name="beds" required defaultValue={v(t?.beds ?? bedrooms)} inputMode="numeric" />
        <TextInput label="Shortest stay (nights)" name="minNights" required defaultValue={v(t?.minNights ?? 1)} inputMode="numeric" />
        <TextInput label="Longest stay (nights)" name="maxNights" required defaultValue={v(t?.maxNights ?? 30)} inputMode="numeric" />
        <TextInput label="Check-in from" name="checkInTime" type="time" required defaultValue={t?.checkInTime ?? "14:00"} />
        <TextInput label="Check-out by" name="checkOutTime" type="time" required defaultValue={t?.checkOutTime ?? "11:00"} />
        <Select
          label="Cancellation policy"
          name="cancellationPolicy"
          required
          defaultValue={t?.cancellationPolicy ?? "moderate"}
          options={CANCELLATION_POLICIES.map((p) => ({ value: p, label: `${CANCELLATION_LABELS[p].label}: ${CANCELLATION_LABELS[p].rule}` }))}
          fieldClassName="sm:col-span-2"
        />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Checkbox
          label="Instant book"
          name="instantBook"
          defaultChecked={t?.instantBook ?? false}
          hint="Guests are confirmed straight away. Otherwise you get 24 hours to accept each request."
        />
        <Checkbox label="Pets allowed" name="petsAllowed" defaultChecked={t?.petsAllowed ?? false} />
        <Checkbox label="Smoking allowed" name="smokingAllowed" defaultChecked={t?.smokingAllowed ?? false} />
        <Checkbox label="Parties and events allowed" name="eventsAllowed" defaultChecked={t?.eventsAllowed ?? false} />
      </div>
      <div className="mt-5">
        <TextArea
          label="House rules"
          name="houseRules"
          defaultValue={t?.houseRules ?? ""}
          rows={4}
          maxLength={2000}
          hint="Quiet hours, shoes off, who may visit… Guests see these before they book."
        />
      </div>
      <p className="mt-4 text-[0.75rem] text-stone-deep">
        Guests pay you at the property. Trustbrick doesn&apos;t take payments or a fee yet. You can block dates and set festival prices from the Calendar once the listing is live.
      </p>
      <Footer next="amenities" />
    </ActionForm>
  );
}

type Room = { occupancy: string; rentPerBed: string; depositAmount: string; bedsAvailable: string; hasAc: boolean; attachedBathroom: boolean; key: number };

function PgRoomsForm({ listing }: { listing: L }) {
  const initial: Room[] = listing.pg.rooms.length
    ? listing.pg.rooms.map((r, i) => ({
        key: i,
        occupancy: String(r.occupancy),
        rentPerBed: r.rent_per_bed === null || r.rent_per_bed === undefined ? "" : String(Number(r.rent_per_bed)),
        depositAmount: r.deposit_amount === null || r.deposit_amount === undefined ? "" : String(Number(r.deposit_amount)),
        bedsAvailable: v(r.beds_available) ?? "",
        hasAc: Boolean(r.has_ac),
        attachedBathroom: Boolean(r.attached_bathroom),
      }))
    : [{ key: 0, occupancy: "double", rentPerBed: "", depositAmount: "", bedsAvailable: "", hasAc: false, attachedBathroom: false }];
  const [rooms, setRooms] = useState(initial);
  const [nextKey, setNextKey] = useState(initial.length);
  return (
    <ActionForm action={savePricingAction}>
      <input type="hidden" name="ref" value={listing.referenceId} />
      <p className="mb-4 text-[0.8125rem] text-stone-deep">
        Add each room type you offer. Customers see the lowest rent for a bed that&apos;s actually free.
      </p>
      <div className="space-y-3">
        {rooms.map((room, i) => (
          <fieldset key={room.key} className="grid grid-cols-1 gap-3 rounded-[3px] border border-line-light p-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <legend className="px-1 text-[0.75rem] text-stone-deep">Room type {i + 1}</legend>
            <Select
              label="Sharing"
              name={`rooms[${i}][occupancy]`}
              defaultValue={room.occupancy}
              options={[
                { value: "single", label: "Single" },
                { value: "double", label: "Double" },
                { value: "triple", label: "Triple" },
                { value: "quad", label: "Four sharing" },
              ]}
            />
            <TextInput label="Rent per bed (₹)" name={`rooms[${i}][rentPerBed]`} defaultValue={room.rentPerBed} inputMode="numeric" required />
            <TextInput label="Deposit (₹)" name={`rooms[${i}][depositAmount]`} defaultValue={room.depositAmount} inputMode="numeric" />
            <TextInput label="Beds free" name={`rooms[${i}][bedsAvailable]`} defaultValue={room.bedsAvailable} inputMode="numeric" required />
            <div className="flex flex-col justify-end gap-1.5 pb-1">
              <Checkbox label="AC" name={`rooms[${i}][hasAc]`} value="true" defaultChecked={room.hasAc} />
              <Checkbox label="Attached bathroom" name={`rooms[${i}][attachedBathroom]`} value="true" defaultChecked={room.attachedBathroom} />
            </div>
            {rooms.length > 1 && (
              <button type="button" className="wbtn wbtn-ghost wbtn-sm justify-self-start sm:col-span-5" onClick={() => setRooms((rs) => rs.filter((r) => r.key !== room.key))}>
                Remove this room type
              </button>
            )}
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        className="wbtn wbtn-secondary mt-3"
        disabled={rooms.length >= 16}
        onClick={() => {
          setRooms((rs) => [...rs, { key: nextKey, occupancy: "single", rentPerBed: "", depositAmount: "", bedsAvailable: "", hasAc: false, attachedBathroom: false }]);
          setNextKey((k) => k + 1);
        }}
      >
        + Add room type
      </button>
      <div className="mt-5 max-w-xs">
        <TextInput label="Beds available from" name="availableFrom" type="date" defaultValue={v(listing.pricing.availableFrom)} />
      </div>
      <Footer next="amenities" />
    </ActionForm>
  );
}

// ── Amenities ────────────────────────────────────────────────────────────────

const AMENITY_GROUPS: Record<string, string> = { building: "Building", unit: "Inside the property", safety: "Safety & security", pg: "PG services" };
const RELEVANT: Record<string, string[]> = {
  residential: ["building", "unit", "safety"],
  commercial: ["building", "safety"],
  land: ["safety"],
  co_living: ["pg", "unit", "safety", "building"],
};

/**
 * The agent's own amenities: type one, press Add (or Enter), and it joins the list, ticked.
 * One that matches a standard amenity ticks that one instead, so customers can filter by it.
 */
function CustomAmenities({ initial, standard, onTickStandard }: { initial: string[]; standard: { code: string; name: string }[]; onTickStandard: (code: string) => void }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const serverError = useFieldError("custom");

  const add = () => {
    const name = tidyAmenity(draft);
    if (name.length < 2) return setNote({ tone: "error", text: "Type the amenity first, at least 2 characters." });
    if (!CUSTOM_AMENITY_PATTERN.test(name)) return setNote({ tone: "error", text: "Use letters, numbers and simple punctuation." });
    const match = standard.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (match) {
      onTickStandard(match.code);
      setDraft("");
      return setNote({ tone: "info", text: `“${match.name}” is already in the list above, so it's ticked there.` });
    }
    if (items.some((i) => i.toLowerCase() === name.toLowerCase())) return setNote({ tone: "error", text: "That one's already added." });
    if (items.length >= CUSTOM_AMENITY_LIMIT) return setNote({ tone: "error", text: `You can add up to ${CUSTOM_AMENITY_LIMIT} of your own.` });
    setItems((xs) => [...xs, name]);
    setDraft("");
    setNote(null);
  };

  return (
    <fieldset>
      <legend className="mb-2 text-[0.8125rem] font-medium">Anything else</legend>
      <p className="mb-3 text-[0.75rem] text-stone-deep">Add amenities that aren&apos;t in the list, in a few words each. Customers see them as you write them.</p>
      {items.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Amenities you added">
          {items.map((name) => (
            <li key={name} className="flex items-center gap-1 rounded-full border border-ink bg-ink/5 py-1 pr-1 pl-3 text-[0.8125rem]">
              <input type="hidden" name="custom" value={name} />
              {name}
              <button
                type="button"
                onClick={() => setItems((xs) => xs.filter((x) => x !== name))}
                className="grid size-6 place-items-center rounded-full text-stone-deep hover:bg-ink/10 hover:text-ink"
                aria-label={`Remove ${name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex max-w-md gap-2">
        <label htmlFor="custom-amenity" className="sr-only">
          Add an amenity
        </label>
        <input
          id="custom-amenity"
          className="winput min-w-0 flex-1"
          value={draft}
          maxLength={CUSTOM_AMENITY_MAX_LENGTH}
          placeholder="e.g. Rooftop garden"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the amenity rather than submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-describedby="custom-amenity-note"
        />
        <button type="button" onClick={add} className="wbtn wbtn-secondary shrink-0">
          + Add
        </button>
      </div>
      <p id="custom-amenity-note" aria-live="polite" className={`mt-1.5 text-[0.75rem] ${note?.tone === "error" || serverError ? "text-brick" : "text-stone-deep"}`}>
        {serverError ?? note?.text ?? `${items.length} of ${CUSTOM_AMENITY_LIMIT} added.`}
      </p>
    </fieldset>
  );
}

export function AmenitiesForm({ listing, options }: { listing: L; options: OnboardingOptions }) {
  const groups = RELEVANT[listing.type.category] ?? Object.keys(AMENITY_GROUPS);
  const [selected, setSelected] = useState(() => new Set(listing.amenities));
  const shown = options.amenities.filter((a) => groups.includes(a.category));
  const toggle = (code: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  return (
    <ActionForm action={saveAmenitiesAction}>
      <input type="hidden" name="ref" value={listing.referenceId} />
      <div className="space-y-5">
        {groups.map((g) => {
          const items = options.amenities.filter((a) => a.category === g);
          if (!items.length) return null;
          return (
            <fieldset key={g}>
              <legend className="mb-2 text-[0.8125rem] font-medium">{AMENITY_GROUPS[g]}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((a) => (
                  <label key={a.code} className="flex cursor-pointer items-start gap-2.5 text-[0.8125rem] leading-snug text-ink">
                    <input type="checkbox" name="amenities" value={a.code} checked={selected.has(a.code)} onChange={(e) => toggle(a.code, e.target.checked)} className="mt-0.5 size-4 accent-ink" />
                    {a.name}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <div className="border-t border-line-light pt-5">
          <CustomAmenities initial={listing.customAmenities} standard={shown} onTickStandard={(code) => toggle(code, true)} />
        </div>
      </div>
      <Footer next="media" />
    </ActionForm>
  );
}
