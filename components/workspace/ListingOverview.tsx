import Link from "next/link";
import { DescriptionList, Status } from "@/components/workspace/ui";
import { formatArea, formatDay, formatListingPrice, formatPrice, titleCase } from "@/lib/format";
import { brokerageLabel } from "@/lib/listings/brokerage";
import { googleMapsLink } from "@/lib/listings/map-link";
import { CATEGORY_LABELS, PURPOSE_LABELS } from "@/lib/listings/onboarding-schema";
import type { WorkspaceListing } from "@/lib/services/listings/queries";
import { CANCELLATION_LABELS, SPACE_TYPE_LABELS } from "@/lib/stays/labels";
import { parseTourLink } from "@/lib/tours/terms";

type L = WorkspaceListing;
type Item = [React.ReactNode, React.ReactNode];

const yes = (v: unknown) => (v === null || v === undefined ? null : v ? "Yes" : "No");
const show = (v: unknown, suffix = "") => (v === null || v === undefined || v === "" ? null : `${typeof v === "number" ? v.toLocaleString("en-IN") : titleCase(String(v))}${suffix}`);
const rupees = (n: number | null | undefined) => (n === null || n === undefined ? null : formatPrice(n, { compact: false }));
const LIFECYCLE: Record<string, string> = { ready: "Ready to move", occupied: "Ready, currently occupied", under_construction: "Under construction", planned: "New launch, not started" };
const OWNERSHIP: Record<string, string> = { freehold: "Freehold", leasehold: "Leasehold", cooperative_society: "Co-operative society", power_of_attorney: "Power of attorney" };

/** One numbered box per step of the form. */
function Section({ n, title, step, editHref, children, aside }: { n: number; title: string; step: string; editHref?: (step: string) => string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-labelledby={`overview-${step}`} className="wcard">
      <div className="flex items-center justify-between gap-3 border-b border-line-light px-4 py-3 sm:px-6">
        <h2 id={`overview-${step}`} className="flex items-baseline gap-2.5 text-[1rem] font-semibold text-ink">
          <span className="font-mono text-[0.75rem] font-normal text-stone-deep tabular-nums">{String(n).padStart(2, "0")}</span>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {aside}
          {editHref && (
            <Link href={editHref(step)} className="wbtn wbtn-ghost wbtn-sm">
              Edit<span className="sr-only"> {title.toLowerCase()}</span>
            </Link>
          )}
        </div>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function Media({ listing }: { listing: L }) {
  const photos = listing.media.filter((m) => m.kind === "photo");
  const videos = listing.media.filter((m) => m.kind === "video");
  const plans = listing.media.filter((m) => m.kind === "floor_plan");
  const documents = listing.media.filter((m) => m.kind === "document");
  const rooms = listing.media.filter((m) => m.kind === "panorama");
  const model = listing.media.find((m) => m.kind === "model_3d");
  const link = listing.tourUrl ? parseTourLink(listing.tourUrl) : null;
  if (!listing.media.length && !link) return <p className="text-[0.875rem] text-stone-deep">No photos or videos yet. At least one photo is needed to submit.</p>;
  return (
    <div className="space-y-6">
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {photos.map((m, i) => (
            <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className={`group relative block overflow-hidden rounded-[3px] bg-sand ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- workspace thumbnails, already sized */}
              <img src={i === 0 ? m.url : (m.thumbnailUrl ?? m.url)} alt={m.altText ?? `Photo ${i + 1}`} className="aspect-[4/3] h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
              {i === 0 && <span className="absolute top-2 left-2 rounded-[2px] bg-ink/80 px-1.5 py-0.5 text-[0.6875rem] text-paper">Cover</span>}
            </a>
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <div>
          <h3 className="mb-2 text-[0.8125rem] font-medium">Videos ({videos.length})</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {videos.map((m) => (
              <video key={m.id} src={m.url} controls preload="metadata" className="aspect-video w-full rounded-[3px] bg-ink">
                <track kind="captions" />
              </video>
            ))}
          </div>
        </div>
      )}
      {plans.length > 0 && (
        <div>
          <h3 className="mb-2 text-[0.8125rem] font-medium">Floor plans ({plans.length})</h3>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {plans.map((m, i) => (
              <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[3px] border border-line-light bg-paper">
                {m.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- workspace thumbnails
                  <img src={m.thumbnailUrl} alt={m.altText ?? `Floor plan ${i + 1}`} className="aspect-square w-full object-contain" />
                ) : (
                  <span className="grid aspect-square place-items-center text-[0.75rem] text-stone-deep">PDF</span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
      {documents.length > 0 && (
        <div>
          <h3 className="mb-2 text-[0.8125rem] font-medium">
            Documents ({documents.length}) <span className="font-normal text-stone-deep">· private, for the reviewer</span>
          </h3>
          <ul className="space-y-1 text-[0.8125rem]">
            {documents.map((m) => (
              <li key={m.id}>
                <a href={m.url} target="_blank" rel="noreferrer" className="underline">
                  {m.originalFilename ?? m.referenceId ?? "Document"}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-[0.8125rem] font-medium">
            Virtual tour &amp; 3D view <span className="font-normal text-stone-deep">· opens for Plus members</span>
          </h3>
          {(rooms.length > 0 || model || link) && (
            <Link href={`/properties/${listing.referenceId}/tour`} className="text-[0.8125rem] underline">
              Preview the tour
            </Link>
          )}
        </div>
        {listing.tourHidden && (
          <p className="mb-2 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.8125rem] text-graphite">
            <strong className="font-medium text-ink">Hidden by Trustbrick</strong>
            {listing.tourHidden.reason ? `: “${listing.tourHidden.reason}”` : "."}
          </p>
        )}
        {rooms.length === 0 && !model && !link ? (
          <p className="text-[0.8125rem] text-stone-deep">None. Optional: 360° photos, a 3D model or a hosted 3D tour link.</p>
        ) : (
          <>
            {rooms.length > 0 && (
              <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {rooms.map((m, i) => (
                  <li key={m.id} className="overflow-hidden rounded-[3px] border border-line-light bg-paper">
                    {m.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- workspace thumbnails
                      <img src={m.thumbnailUrl} alt="" className="aspect-[2/1] w-full object-cover" />
                    )}
                    <span className={`block truncate px-2 py-1 text-[0.75rem] ${m.altText ? "" : "text-amber"}`}>{m.altText || `Room ${i + 1}: not named`}</span>
                  </li>
                ))}
              </ol>
            )}
            <ul className="mt-2 space-y-1 text-[0.8125rem] text-graphite">
              <li>360° photos: {rooms.length ? `${rooms.length} room${rooms.length === 1 ? "" : "s"}` : "none"}</li>
              <li>3D model: {model ? (model.originalFilename ?? "uploaded") : "none"}</li>
              <li>
                Hosted 3D tour:{" "}
                {link ? (
                  <a href={link.url} target="_blank" rel="noreferrer" className="underline">
                    {link.provider.name}
                  </a>
                ) : (
                  "none"
                )}
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Location({ listing }: { listing: L }) {
  const loc = listing.location;
  const d = 0.004;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <DescriptionList
        columns={1}
        items={[
          ["Building / street", loc.line1],
          ["Area or sub-locality", loc.line2],
          ["Landmark", loc.landmark],
          ["Locality", [loc.locality, loc.city].filter(Boolean).join(", ")],
          ["PIN code", loc.postalCode],
        ]}
      />
      <div>
        <div className="overflow-hidden rounded-[3px] border border-line-light">
          <iframe
            title={`Map of ${loc.locality}`}
            className="block h-64 w-full"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${loc.longitude - d},${loc.latitude - d},${loc.longitude + d},${loc.latitude + d}&layer=mapnik&marker=${loc.latitude},${loc.longitude}`}
          />
        </div>
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-stone-deep">
          <span>{loc.pinExact ? "Exact pin, from the agent's map link." : `No map link given: the pin is the centre of ${loc.locality}, so it's approximate.`}</span>
          <a href={googleMapsLink(loc)} target="_blank" rel="noreferrer" className="underline">
            Open in Google Maps ↗
          </a>
        </p>
      </div>
    </div>
  );
}

function Details({ listing }: { listing: L }) {
  const r = listing.residential;
  const c = listing.commercial;
  const land = listing.land;
  const pg = listing.pg;
  const p = listing.property;
  const items: Item[] = [
    ["Type", `${listing.type.name} · ${CATEGORY_LABELS[listing.type.category]}`],
    ["Purpose", PURPOSE_LABELS[listing.purpose]],
    ...(listing.type.category !== "land" ? ([["Construction", LIFECYCLE[p.lifecycleStatus] ?? show(p.lifecycleStatus)]] as Item[]) : []),
    ["Ownership", p.ownershipType ? (OWNERSHIP[p.ownershipType] ?? show(p.ownershipType)) : null],
    ...(listing.type.category !== "land" ? ([["Year built", p.yearBuilt ? String(p.yearBuilt) : null]] as Item[]) : []),
    ...(r || c
      ? ([
          ["Floor", p.floorNumber !== null ? `${p.floorNumber === 0 ? "Ground" : p.floorNumber}${p.totalFloors ? ` of ${p.totalFloors}` : ""}` : null],
          ["Carpet area", p.carpetAreaSqft ? formatArea(p.carpetAreaSqft) : null],
          ["Built-up area", p.builtUpAreaSqft ? formatArea(p.builtUpAreaSqft) : null],
          ["Super built-up area", p.superBuiltUpAreaSqft ? formatArea(p.superBuiltUpAreaSqft) : null],
          [
            <>
              {c ? "Unit number" : "Flat / unit number"} <span className="text-stone">(private)</span>
            </>,
            listing.location.unitNumber,
          ],
        ] as Item[])
      : []),
    ...(r
      ? ([
          ["Bedrooms", r.bedrooms === 0 ? "Studio" : show(r.bedrooms)],
          ["Bathrooms", show(r.bathrooms)],
          ["Balconies", show(r.balconies)],
          ["Furnishing", show(r.furnishing)],
          ["Facing", show(r.facing)],
          ["Covered parking", show(r.covered_parking)],
        ] as Item[])
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
        ] as Item[])
      : []),
    ...(land
      ? ([
          ["Plot area", land.plot_area_sqyd ? `${Number(land.plot_area_sqyd).toLocaleString("en-IN")} sq yd` : null],
          ["Land use", show(land.zoning)],
          ["Road width", show(land.road_width_ft, " ft")],
          ["Frontage", show(land.frontage_ft, " ft")],
          ["Corner plot", yes(land.corner_plot)],
          ["Boundary wall", yes(land.boundary_wall)],
          ["Survey number", (land.survey_number as string) ?? null],
        ] as Item[])
      : []),
    ...(pg.attributes
      ? ([
          ["Rooms / beds", `${pg.attributes.total_rooms} rooms · ${pg.attributes.total_beds} beds`],
          ["Attached bathrooms", show(pg.attributes.attached_bathrooms)],
          ["Common kitchen", yes(pg.attributes.common_kitchen)],
          ["For", pg.terms ? show(pg.terms.gender_policy === "any" ? "co-living" : pg.terms.gender_policy) : null],
          ["Meals", pg.terms ? ({ none: "No meals", breakfast: "Breakfast", two: "Two meals a day", three: "Three meals a day" } as Record<string, string>)[String(pg.terms.meals)] : null],
          ["Food", pg.terms?.food_preference ? ({ veg: "Vegetarian", non_veg: "Non-vegetarian", both: "Veg and non-veg" } as Record<string, string>)[String(pg.terms.food_preference)] : null],
          ["Notice period", show(pg.terms?.notice_period_days, " days")],
          ["Lock-in", show(pg.terms?.lock_in_months, " months")],
          ["Curfew", (pg.terms?.entry_curfew as string) ?? null],
          ["Visitors", pg.terms ? yes(pg.terms.visitors_allowed) : null],
        ] as Item[])
      : []),
    ["Property verification", <Status key="v" value={p.verificationStatus} />],
  ];
  return (
    <div>
      <p className="text-[1.125rem] font-medium text-ink">{listing.title}</p>
      {listing.description ? (
        <p className="mt-2 max-w-[75ch] text-[0.875rem] leading-relaxed whitespace-pre-line text-graphite">{listing.description}</p>
      ) : (
        <p className="mt-2 text-[0.8125rem] text-stone-deep">No description yet.</p>
      )}
      <div className="mt-5 border-t border-line-light pt-5">
        <DescriptionList columns={3} items={items} />
      </div>
      {Boolean(pg.terms?.house_rules) && (
        <div className="mt-5 border-t border-line-light pt-4">
          <h3 className="text-[0.75rem] text-stone-deep">House rules</h3>
          <p className="mt-1 text-[0.875rem] whitespace-pre-line">{String(pg.terms?.house_rules)}</p>
        </div>
      )}
    </div>
  );
}

function Pricing({ listing }: { listing: L }) {
  const p = listing.pricing;
  const st = listing.stay;
  const rentLike = listing.purpose === "rent" || listing.purpose === "lease";
  if (listing.purpose === "stay") {
    if (!st) return <p className="text-[0.875rem] text-stone-deep">The nightly price and house rules aren&apos;t filled in yet.</p>;
    return (
      <div>
        <DescriptionList
          columns={3}
          items={[
            ["Price per night", rupees(p.price)],
            ["Weekend price per night", rupees(st.weekendPrice) ?? "Same as weekdays"],
            ["Cleaning fee", rupees(st.cleaningFee) ?? "None"],
            ["What guests get", SPACE_TYPE_LABELS[st.spaceType].label],
            ["Guests / beds", `Up to ${st.maxGuests} guests · ${st.beds} bed${st.beds === 1 ? "" : "s"}`],
            ["Stay length", `${st.minNights} to ${st.maxNights} nights`],
            ["Check-in / out", `From ${st.checkInTime} · by ${st.checkOutTime}`],
            ["Booking", st.instantBook ? "Instant book" : "Request to book"],
            ["Cancellation", `${CANCELLATION_LABELS[st.cancellationPolicy].label}: ${CANCELLATION_LABELS[st.cancellationPolicy].rule}`],
            ["Pets / smoking / events", [st.petsAllowed ? "Pets allowed" : "No pets", st.smokingAllowed ? "smoking allowed" : "no smoking", st.eventsAllowed ? "events allowed" : "no events"].join(" · ")],
          ]}
        />
        {st.houseRules && (
          <div className="mt-5 border-t border-line-light pt-4">
            <h3 className="text-[0.75rem] text-stone-deep">House rules</h3>
            <p className="mt-1 text-[0.875rem] whitespace-pre-line">{st.houseRules}</p>
          </div>
        )}
      </div>
    );
  }
  if (listing.purpose === "pg") {
    if (!listing.pg.rooms.length) return <p className="text-[0.875rem] text-stone-deep">No room types yet.</p>;
    return (
      <div className="-mx-4 overflow-x-auto sm:-mx-6">
        <table className="wtable">
          <thead>
            <tr>
              <th scope="col">Room</th>
              <th scope="col" className="text-right">
                Rent per bed
              </th>
              <th scope="col" className="text-right">
                Deposit
              </th>
              <th scope="col" className="text-right">
                Beds free
              </th>
            </tr>
          </thead>
          <tbody>
            {listing.pg.rooms.map((room, i) => (
              <tr key={i}>
                <td>
                  {titleCase(String(room.occupancy))}
                  <span className="text-stone-deep">
                    {room.has_ac ? " · AC" : ""}
                    {room.attached_bathroom ? " · Attached bath" : ""}
                  </span>
                </td>
                <td className="text-right tabular-nums">{rupees(Number(room.rent_per_bed))}</td>
                <td className="text-right tabular-nums">{room.deposit_amount ? rupees(Number(room.deposit_amount)) : "—"}</td>
                <td className="text-right tabular-nums">{String(room.beds_available)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.availableFrom && <p className="mt-3 px-4 text-[0.8125rem] text-stone-deep sm:px-6">Beds available from {formatDay(p.availableFrom)}.</p>}
      </div>
    );
  }
  return (
    <DescriptionList
      columns={3}
      items={[
        [listing.purpose === "sale" ? "Price" : "Monthly rent", p.price === null ? null : formatListingPrice(p.price, listing.purpose)],
        [rentLike ? "Rent negotiable" : "Price negotiable", p.priceNegotiable ? "Yes" : "No"],
        ...(rentLike ? ([["Security deposit", rupees(p.depositAmount)]] as Item[]) : []),
        ["Maintenance", p.maintenanceAmount ? `${rupees(p.maintenanceAmount)}/month` : null],
        [rentLike ? "Available from" : "Possession from", p.availableFrom ? formatDay(p.availableFrom) : null],
        ...(rentLike ? ([[listing.purpose === "lease" ? "Lease term" : "Minimum stay", p.leaseDurationMonths ? `${p.leaseDurationMonths} months` : null]] as Item[]) : []),
        ...(listing.purpose === "sale"
          ? ([
              ["RERA registration", p.reraId],
              ["Rent it earns now", p.declaredMonthlyRent ? `${rupees(p.declaredMonthlyRent)}/month` : null],
            ] as Item[])
          : []),
        ["Brokerage", brokerageLabel(p.brokerageType, p.brokerageValue, p.brokerageNegotiable)],
      ]}
    />
  );
}

function Amenities({ listing }: { listing: L }) {
  if (!listing.amenityNames.length && !listing.customAmenities.length) return <p className="text-[0.875rem] text-stone-deep">None added.</p>;
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {listing.amenityNames.map((name) => (
          <li key={name} className="rounded-full border border-line-light bg-paper px-3 py-1 text-[0.8125rem]">
            {name}
          </li>
        ))}
        {listing.customAmenities.map((name) => (
          <li key={`custom-${name}`} className="rounded-full border border-dashed border-stone px-3 py-1 text-[0.8125rem]">
            {name}
          </li>
        ))}
      </ul>
      {listing.customAmenities.length > 0 && <p className="mt-3 text-[0.75rem] text-stone-deep">Dashed: added by the agent in their own words.</p>}
    </div>
  );
}

/**
 * Everything on a listing, one box per step of the form: photos and videos first, then
 * location, amenities, details and pricing. The property page shows it, and
 * Review & submit uses it as the preview, with an Edit link on each box.
 */
export function ListingOverview({ listing, editHref }: { listing: L; editHref?: (step: string) => string }) {
  const photos = listing.media.filter((m) => m.kind === "photo").length;
  const videos = listing.media.filter((m) => m.kind === "video").length;
  const counts = [photos && `${photos} photo${photos === 1 ? "" : "s"}`, videos && `${videos} video${videos === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
  return (
    <div className="space-y-5">
      <Section n={1} title="Photos & videos" step="media" editHref={editHref} aside={counts ? <span className="text-[0.75rem] text-stone-deep">{counts}</span> : undefined}>
        <Media listing={listing} />
      </Section>
      <Section n={2} title="Location" step="location" editHref={editHref}>
        <Location listing={listing} />
      </Section>
      <Section n={3} title="Amenities" step="amenities" editHref={editHref}>
        <Amenities listing={listing} />
      </Section>
      <Section n={4} title="Property details" step="details" editHref={editHref}>
        <Details listing={listing} />
      </Section>
      <Section n={5} title={listing.purpose === "stay" ? "Price & house rules" : listing.purpose === "pg" ? "Rooms & rent" : "Pricing"} step="pricing" editHref={editHref}>
        <Pricing listing={listing} />
      </Section>
    </div>
  );
}
