import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingPanel } from "@/components/listings/BookingPanel";
import { BookmarkButton } from "@/components/listings/BookmarkButton";
import {
  ListingContact,
  ReportListing,
  ViewBeacon,
} from "@/components/listings/ListingContact";
import { ServiceFooter } from "@/components/footer/ServiceFooter";
import { AppHeader } from "@/components/navigation/AppHeader";
import { ServiceHeader } from "@/components/navigation/ServiceHeader";
import { shellFor } from "@/lib/listings/services";
import { placeFor } from "@/lib/buy/costs";
import { getSession } from "@/lib/auth/session";
import { formatArea, formatDate, formatDay, formatPrice, titleCase } from "@/lib/format";
import {
  declaredYield,
  FOOD_LABEL,
  FURNISHING_LABEL,
  GENDER_LABEL,
  keyFacts,
  kindOf,
  MEALS_LABEL,
  OCCUPANCY_LABEL,
  priceParts,
} from "@/lib/listings/describe";
import { KIND_META } from "@/lib/listings/filters";
import { CLOSED_LABELS } from "@/lib/listings/lifecycle";
import { getListing, savedPropertyIds } from "@/lib/listings/queries";
import { istDateFromNow } from "@/lib/range";
import { enquiryContext } from "@/lib/services/crm";
import { unavailableDates } from "@/lib/services/stays/bookings";
import { guestConversationSummary } from "@/lib/services/stays/messages";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import { CANCELLATION_LABELS, SPACE_TYPE_LABELS, timeLabel } from "@/lib/stays/labels";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const listing = await getListing((await params).ref);
  if (!listing) return { title: "Listing not found — Trustbrick" };
  return {
    title: `${listing.title} — Trustbrick`,
    description: listing.description ?? undefined,
    // Sample listings must never be indexed as if they were real properties.
    robots: listing.isSample || listing.status !== "published" ? { index: false, follow: false } : undefined,
  };
}

export default async function ListingPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const query = await searchParams;
  const [listing, session] = await Promise.all([
    getListing(ref),
    getSession(),
  ]);
  if (!listing) notFound();

  const kind = kindOf(listing);
  const meta = KIND_META[kind];
  const saved = session
    ? (await savedPropertyIds(session.user.id, [listing.propertyId])).has(
        listing.propertyId,
      )
    : false;
  const stay = listing.stay;
  const today = todayInIndia();
  const unavailable = stay && listing.status === "published" ? await unavailableDates(listing.referenceId, today) : [];
  // Guests can message the host before booking; a returning guest picks up their earlier conversation.
  const canMessageHost = Boolean(stay?.hostUserId) && session?.user.id !== stay?.hostUserId;
  const conversation = canMessageHost && session ? await guestConversationSummary(session.user.id, listing.referenceId) : null;
  const messageHref = conversation ? `/account/messages/${conversation.referenceId}` : `/account/messages/new?listing=${listing.referenceId}`;
  const showMessageHost = canMessageHost && (listing.status === "published" || conversation !== null);
  const q = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const contact =
    listing.status === "published" && !stay
      ? await enquiryContext(listing.referenceId, session?.user.id ?? null)
      : null;
  const price = priceParts(listing);
  const yieldPct = declaredYield(listing);
  const [cover, ...rest] = listing.images;
  const side = rest.slice(0, 2);

  const facts: [string, string][] = (
    [
      listing.bedrooms !== null
        ? [
            "Bedrooms",
            listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} BHK`,
          ]
        : null,
      listing.bathrooms !== null
        ? ["Bathrooms", String(listing.bathrooms)]
        : null,
      listing.carpetAreaSqft
        ? ["Carpet area", formatArea(listing.carpetAreaSqft)]
        : null,
      listing.builtUpAreaSqft
        ? ["Built-up area", formatArea(listing.builtUpAreaSqft)]
        : null,
      listing.superBuiltUpAreaSqft
        ? ["Super built-up area", formatArea(listing.superBuiltUpAreaSqft)]
        : null,
      listing.plotAreaSqyd
        ? [
            "Plot area",
            `${Math.round(listing.plotAreaSqyd).toLocaleString("en-IN")} sq yd`,
          ]
        : null,
      listing.furnishing
        ? ["Furnishing", FURNISHING_LABEL[listing.furnishing]]
        : null,
      listing.floorNumber !== null
        ? [
            "Floor",
            listing.totalFloors
              ? `${listing.floorNumber} of ${listing.totalFloors}`
              : String(listing.floorNumber),
          ]
        : null,
      listing.facing ? ["Facing", titleCase(listing.facing)] : null,
      listing.balconies !== null
        ? ["Balconies", String(listing.balconies)]
        : null,
      listing.coveredParking
        ? ["Covered parking", String(listing.coveredParking)]
        : null,
      listing.commercialGrade ? ["Grade", listing.commercialGrade] : null,
      listing.fitoutStatus
        ? ["Fit-out", titleCase(listing.fitoutStatus)]
        : null,
      listing.workstations
        ? ["Workstations", String(listing.workstations)]
        : null,
      listing.zoning ? ["Zoning", titleCase(listing.zoning)] : null,
      listing.roadWidthFt ? ["Road width", `${listing.roadWidthFt} ft`] : null,
      listing.cornerPlot ? ["Corner plot", "Yes"] : null,
      listing.yearBuilt ? ["Year built", String(listing.yearBuilt)] : null,
      listing.depositAmount
        ? [
            "Security deposit",
            formatPrice(listing.depositAmount, { compact: false }),
          ]
        : null,
      listing.maintenanceAmount
        ? [
            "Maintenance",
            `${formatPrice(listing.maintenanceAmount, { compact: false })}/month`,
          ]
        : null,
      listing.availableFrom
        ? [
            "Available from",
            formatDate(listing.availableFrom, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
          ]
        : null,
    ] as ([string, string] | null)[]
  ).filter((f): f is [string, string] => f !== null);

  // A listing inside a dedicated service (a flat or plot for sale: Buy) stays in that service.
  const shell = shellFor(kind);
  // Each service's tools, filled in from this listing.
  const qs = (values: Record<string, string | number | null | undefined>) =>
    new URLSearchParams(Object.entries(values).filter((e): e is [string, string | number] => e[1] !== null && e[1] !== undefined).map(([k, v]) => [k, String(v)])).toString();
  const rounded = Math.round(listing.price);
  const planLinks: [string, string][] =
    kind === "buy"
      ? [
          ["Estimate the EMI", `/buy/emi-calculator?${qs({ price: rounded })}`],
          ["Stamp duty and costs", `/buy/costs?${qs({ price: rounded, city: placeFor(listing.city), uc: ["planned", "under_construction"].includes(listing.lifecycleStatus) ? 1 : null })}`],
          ["Get the title verified", `/legal-verification/apply?${qs({ listing: listing.referenceId })}`],
        ]
      : kind === "rent"
        ? [
            ["Work out move-in costs", `/rent/move-in-costs?${qs({ rent: rounded, deposit: listing.depositAmount ? Math.round(listing.depositAmount / listing.price) : null })}`],
            ["Renting guide", "/rent/guide"],
          ]
        : kind === "pg"
          ? [
              ["PG checklist", "/pg/checklist"],
              ["Compare with a shared flat", `/pg/compare?${qs({ pg: rounded, meals: listing.meals && listing.meals !== "none" ? 1 : 0 })}`],
            ]
          : kind === "stay" && stay
            ? [
                [
                  "Split the cost",
                  `/stays/split-cost?${qs({
                    price: rounded,
                    weekend: stay.weekendPrice,
                    cleaning: stay.cleaningFee ?? 0,
                    people: Math.min(stay.maxGuests, 4),
                    check_in: q("check_in"),
                    nights:
                      q("check_in") && q("check_out") ? Math.round((Date.parse(q("check_out")!) - Date.parse(q("check_in")!)) / 86_400_000) || null : null,
                  })}`,
                ],
                ["Stay guide", "/stays/guide"],
              ]
          : kind === "invest"
            ? [
                ["Work out the net yield", `/invest/yield-calculator?${qs({ price: rounded, rent: listing.declaredMonthlyRent ? Math.round(listing.declaredMonthlyRent) : null })}`],
                ["Get the title verified", `/legal-verification/apply?${qs({ listing: listing.referenceId })}`],
              ]
            : [];

  return (
    // Inside a service the header has a row of sections, so sticky panels sit lower.
    <div className={`flex min-h-svh flex-col bg-ivory text-ink ${shell ? "[--sticky-top:calc(var(--header-h)+2.75rem)]" : ""}`}>
      {shell ? <ServiceHeader shell={shell} /> : <AppHeader active={kind} />}
      <main className="shell flex-1 pt-6 pb-24 sm:pt-10">
        <nav
          aria-label="Breadcrumb"
          className="text-[0.8125rem] text-stone-deep"
        >
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href={meta.path} className="link-rule hover:text-ink">
                {meta.title}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>{listing.city ?? ""}</li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">
              {listing.locality}
            </li>
          </ol>
        </nav>

        {listing.isSample && (
          <p className="mt-6 flex items-start gap-3 border-l-2 border-brick/50 bg-brick/[0.05] px-4 py-3 text-[0.875rem] leading-relaxed text-graphite">
            <span className="eyebrow mt-0.5 shrink-0 text-brick">Sample</span>
            This is a sample listing for development. It is not a real property,
            and its price, organization and RERA number are illustrative.
          </p>
        )}

        {/* Gallery */}
        <div
          className={`mt-6 grid gap-2 ${side.length > 0 ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-sand sm:row-span-2">
            {cover && (
              <Image
                src={cover.key}
                alt={cover.alt ?? listing.title}
                fill
                preload
                sizes="(min-width: 640px) 66vw, 100vw"
                className="object-cover"
              />
            )}
          </div>
          {side.map((img) => (
            // A lone side image spans both rows so the column has no gap under it.
            <div
              key={img.key}
              className={`relative hidden overflow-hidden bg-sand sm:block ${side.length === 1 ? "sm:row-span-2" : "aspect-[16/10]"}`}
            >
              <Image
                src={img.key}
                alt={img.alt ?? ""}
                fill
                sizes="33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
          <div className="min-w-0">
            <p className="eyebrow text-stone-deep">
              {listing.typeName}
              {listing.projectName ? ` · ${listing.projectName}` : ""}
            </p>
            <h1 className="display mt-3 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1]">
              {listing.title}
            </h1>
            <p className="mt-3 text-[1rem] text-graphite">
              {listing.locality}
              {listing.city ? `, ${listing.city}` : ""}
              {listing.postalCode ? ` ${listing.postalCode}` : ""}
            </p>
            <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[0.9375rem] text-graphite">
              {keyFacts(listing).map((f, i) => (
                <span key={f}>
                  {i > 0 && (
                    <span aria-hidden className="mr-3 text-stone">
                      ·
                    </span>
                  )}
                  {f}
                </span>
              ))}
            </p>

            {listing.description && (
              <section className="mt-10 border-t border-line-light pt-8">
                <h2 className="text-[1.125rem] font-medium">
                  About this property
                </h2>
                <p className="mt-3 max-w-[65ch] text-[1rem] leading-relaxed text-graphite">
                  {listing.description}
                </p>
              </section>
            )}

            {stay && (
              <>
                <section className="mt-10 border-t border-line-light pt-8">
                  <h2 className="text-[1.125rem] font-medium">The stay</h2>
                  <dl className="mt-4 grid gap-x-8 gap-y-3 text-[0.9375rem] sm:grid-cols-2">
                    <Fact label="Guests get" value={SPACE_TYPE_LABELS[stay.spaceType].label} />
                    <Fact label="Sleeps" value={`Up to ${stay.maxGuests} guests · ${stay.beds} bed${stay.beds === 1 ? "" : "s"}`} />
                    <Fact label="Check-in" value={`From ${timeLabel(stay.checkInTime)}`} />
                    <Fact label="Check-out" value={`By ${timeLabel(stay.checkOutTime)}`} />
                    <Fact label="Stay length" value={stay.minNights === stay.maxNights ? `${stay.minNights} nights` : `${stay.minNights} to ${stay.maxNights} nights`} />
                    <Fact label="Booking" value={stay.instantBook ? "Instant book" : "The host approves each request"} />
                    <Fact label="Pets" value={stay.petsAllowed ? "Allowed" : "Not allowed"} />
                    <Fact label="Smoking" value={stay.smokingAllowed ? "Allowed" : "Not allowed"} />
                    <Fact label="Parties and events" value={stay.eventsAllowed ? "Allowed" : "Not allowed"} />
                    {stay.weekendPrice && <Fact label="Weekend nights" value={`${formatPrice(stay.weekendPrice, { compact: false })}/night`} />}
                  </dl>
                  <p className="mt-4 text-[0.875rem] text-stone-deep">{SPACE_TYPE_LABELS[stay.spaceType].hint} The exact address is shared once your booking is confirmed.</p>
                </section>
                {stay.houseRules && (
                  <section className="mt-10 border-t border-line-light pt-8">
                    <h2 className="text-[1.125rem] font-medium">House rules</h2>
                    <p className="mt-3 max-w-[65ch] text-[1rem] leading-relaxed whitespace-pre-line text-graphite">{stay.houseRules}</p>
                  </section>
                )}
                <section className="mt-10 border-t border-line-light pt-8">
                  <h2 className="text-[1.125rem] font-medium">Cancellation</h2>
                  <p className="mt-3 text-[1rem] text-graphite">
                    <span className="font-medium text-ink">{CANCELLATION_LABELS[stay.cancellationPolicy].label}.</span> {CANCELLATION_LABELS[stay.cancellationPolicy].rule} You pay the host at the
                    property, so nothing is charged online.
                  </p>
                </section>
                {stay.host && (
                  <section className="mt-10 border-t border-line-light pt-8">
                    <h2 className="text-[1.125rem] font-medium">Your host</h2>
                    <div className="mt-4 flex items-start gap-4">
                      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-ink font-medium text-paper">
                        {stay.host.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-medium">
                          {stay.host.name}
                          {stay.host.verified && <span className="ml-2 rounded-full bg-sage/15 px-2 py-0.5 text-[0.75rem] font-medium text-sage-deep">✓ Identity checked</span>}
                        </p>
                        <p className="text-[0.875rem] text-stone-deep">
                          Hosting on Trustbrick since {formatDate(stay.host.since, { month: "long", year: "numeric" })}
                          {stay.host.languages.length ? ` · Speaks ${stay.host.languages.join(", ")}` : ""}
                        </p>
                        {stay.host.about && <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-graphite">{stay.host.about}</p>}
                        {showMessageHost && (
                          <Link href={messageHref} className="btn btn-ghost-dark mt-5">
                            <span>{conversation ? `Continue your conversation with ${stay.host.name}` : `Message ${stay.host.name}`}</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}

            {listing.pg && (
              <section className="mt-10 border-t border-line-light pt-8">
                <h2 className="text-[1.125rem] font-medium">Rooms and rent</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-[0.9375rem]">
                    <thead className="text-[0.8125rem] text-stone-deep">
                      <tr className="border-b border-line-light">
                        <th scope="col" className="py-2.5 pr-4 font-normal">
                          Room
                        </th>
                        <th scope="col" className="py-2.5 pr-4 font-normal">
                          Rent per bed
                        </th>
                        <th scope="col" className="py-2.5 pr-4 font-normal">
                          Deposit
                        </th>
                        <th scope="col" className="py-2.5 pr-4 font-normal">
                          Beds free
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {listing.pg.rooms.map((r) => (
                        <tr
                          key={`${r.occupancy}-${r.hasAc}-${r.attachedBathroom}`}
                          className="border-b border-line-light"
                        >
                          <td className="py-3 pr-4">
                            {OCCUPANCY_LABEL[r.occupancy]}
                            <span className="block text-[0.8125rem] text-stone-deep">
                              {[
                                r.hasAc ? "AC" : "Non-AC",
                                r.attachedBathroom
                                  ? "Attached bathroom"
                                  : "Shared bathroom",
                              ].join(" · ")}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            {formatPrice(r.rentPerBed, { compact: false })}
                            /month
                          </td>
                          <td className="py-3 pr-4">
                            {r.depositAmount
                              ? formatPrice(r.depositAmount, { compact: false })
                              : "—"}
                          </td>
                          <td className="py-3 pr-4">
                            {r.bedsAvailable > 0 ? (
                              r.bedsAvailable
                            ) : (
                              <span className="text-stone-deep">Full</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="mt-6 grid gap-x-8 gap-y-3 text-[0.9375rem] sm:grid-cols-2">
                  <Fact
                    label="For"
                    value={GENDER_LABEL[listing.genderPolicy ?? ""] ?? "—"}
                  />
                  <Fact
                    label="Meals"
                    value={MEALS_LABEL[listing.meals ?? "none"]}
                  />
                  {listing.foodPreference && (
                    <Fact
                      label="Food"
                      value={FOOD_LABEL[listing.foodPreference]}
                    />
                  )}
                  <Fact
                    label="Rooms / beds"
                    value={`${listing.pg.totalRooms} rooms · ${listing.pg.totalBeds} beds`}
                  />
                  {listing.pg.noticePeriodDays !== null && (
                    <Fact
                      label="Notice period"
                      value={`${listing.pg.noticePeriodDays} days`}
                    />
                  )}
                  <Fact
                    label="Lock-in"
                    value={
                      listing.pg.lockInMonths
                        ? `${listing.pg.lockInMonths} months`
                        : "None"
                    }
                  />
                  {listing.pg.entryCurfew && (
                    <Fact label="Entry by" value={listing.pg.entryCurfew} />
                  )}
                  <Fact
                    label="Visitors"
                    value={
                      listing.pg.visitorsAllowed ? "Allowed" : "Not allowed"
                    }
                  />
                </dl>
              </section>
            )}

            {facts.length > 0 && (
              <section className="mt-10 border-t border-line-light pt-8">
                <h2 className="text-[1.125rem] font-medium">Details</h2>
                <dl className="mt-4 grid gap-x-8 gap-y-3 text-[0.9375rem] sm:grid-cols-2">
                  {facts.map(([label, value]) => (
                    <Fact key={label} label={label} value={value} />
                  ))}
                </dl>
              </section>
            )}

            {(listing.projectName || listing.reraId) && (
              <section className="mt-10 border-t border-line-light pt-8">
                <h2 className="text-[1.125rem] font-medium">Project</h2>
                <dl className="mt-4 grid gap-x-8 gap-y-3 text-[0.9375rem] sm:grid-cols-2">
                  {listing.projectName && (
                    <Fact label="Project" value={listing.projectName} />
                  )}
                  {listing.projectStatus && (
                    <Fact
                      label="Status"
                      value={titleCase(listing.projectStatus)}
                    />
                  )}
                  {listing.possessionDate && (
                    <Fact
                      label="Possession"
                      value={formatDate(listing.possessionDate, {
                        month: "long",
                        year: "numeric",
                      })}
                    />
                  )}
                  {listing.reraId && (
                    <Fact label="RERA registration" value={listing.reraId} />
                  )}
                </dl>
              </section>
            )}

            {listing.amenities.length > 0 && (
              <section className="mt-10 border-t border-line-light pt-8">
                <h2 className="text-[1.125rem] font-medium">Amenities</h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {listing.amenities.map((a) => (
                    <li
                      key={a.code}
                      className="rounded-full border border-line-light bg-paper px-3.5 py-1.5 text-[0.875rem]"
                    >
                      {a.name}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {listing.priceHistory.length > 1 && (
              <section className="mt-10 border-t border-line-light pt-8">
                <h2 className="text-[1.125rem] font-medium">Price history</h2>
                <ol className="mt-4 space-y-2 text-[0.9375rem]">
                  {listing.priceHistory.map((p) => (
                    <li
                      key={p.from}
                      className="flex justify-between gap-4 border-b border-line-light pb-2"
                    >
                      <span className="text-stone-deep">
                        {formatDate(p.from, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {p.to
                          ? ` to ${formatDate(p.to, { day: "numeric", month: "short", year: "numeric" })}`
                          : " onwards"}
                      </span>
                      <span
                        className={
                          p.to ? "text-stone-deep line-through" : "font-medium"
                        }
                      >
                        {formatPrice(p.price)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          {/* Price panel */}
          <aside className="lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)] lg:self-start">
            <div className="border border-line-light bg-paper p-6">
              <p className="flex flex-wrap items-baseline gap-x-1.5">
                {price.prefix && (
                  <span className="text-[0.875rem] text-stone-deep">
                    {price.prefix}
                  </span>
                )}
                <span className="display text-[2.5rem] leading-none">
                  {price.amount}
                </span>
                {price.suffix && (
                  <span className="text-[0.875rem] text-stone-deep">
                    {price.suffix}
                  </span>
                )}
              </p>
              {listing.priceNegotiable && (
                <p className="mt-2 text-[0.875rem] text-stone-deep">
                  Price negotiable
                </p>
              )}
              {listing.status !== "published" && (
                <p className="mt-4 border-l-2 border-stone bg-sand/60 px-3.5 py-3 text-[0.9375rem] font-medium text-ink">
                  {listing.status === "transacted"
                    ? `${CLOSED_LABELS[listing.transactionType].status}. This property is no longer available.`
                    : "This listing has expired and is no longer available."}
                </p>
              )}
              {listing.offer && listing.status === "published" && (
                <div className="mt-4 border-l-2 border-brick bg-brick/8 px-3.5 py-3">
                  <p className="text-[0.9375rem] font-medium text-ink">
                    {listing.offer.title}
                  </p>
                  {listing.offer.details && (
                    <p className="mt-1 text-[0.875rem] leading-relaxed text-graphite">
                      {listing.offer.details}
                    </p>
                  )}
                  {listing.offer.validUntil && (
                    <p className="mt-1 text-[0.8125rem] text-stone-deep">
                      Offer valid until {formatDay(listing.offer.validUntil)}
                    </p>
                  )}
                </div>
              )}
              {listing.carpetAreaSqft && listing.transactionType === "sale" && (
                <p className="mt-2 text-[0.875rem] text-stone-deep">
                  {formatPrice(
                    Math.round(listing.price / listing.carpetAreaSqft),
                    { compact: false },
                  )}{" "}
                  per sq ft (carpet)
                </p>
              )}
              {planLinks.length > 0 && listing.status === "published" && (
                <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line-light pt-4 text-[0.875rem]">
                  {planLinks.map(([label, href]) => (
                    <Link key={href} href={href} className="link-rule font-medium">
                      {label}
                    </Link>
                  ))}
                </p>
              )}
              {yieldPct && (
                <p className="mt-4 border-t border-line-light pt-4 text-[0.875rem] leading-relaxed text-graphite">
                  <span className="font-medium text-ink">
                    Declared rent yield {yieldPct}%
                  </span>
                  <span className="block text-stone-deep">
                    From the seller&rsquo;s stated rent of{" "}
                    {formatPrice(listing.declaredMonthlyRent!, {
                      compact: false,
                    })}
                    /month. Not a Trustbrick estimate.
                  </span>
                </p>
              )}

              <div className="mt-6 space-y-3">
                <BookmarkButton
                  propertyId={listing.propertyId}
                  initialSaved={saved}
                  isLoggedIn={Boolean(session)}
                  variant="button"
                />
                {listing.status === "published" && stay && (
                  <BookingPanel
                    referenceId={listing.referenceId}
                    price={listing.price}
                    cleaningFee={stay.cleaningFee}
                    instantBook={stay.instantBook}
                    maxGuests={stay.maxGuests}
                    petsAllowed={stay.petsAllowed}
                    minNights={stay.minNights}
                    maxNights={stay.maxNights}
                    cancellationPolicy={stay.cancellationPolicy}
                    unavailable={unavailable}
                    initial={{ checkIn: q("check_in"), checkOut: q("check_out"), guests: q("guests") ? Number(q("guests")) : undefined }}
                    today={today}
                    loggedIn={Boolean(session)}
                    defaultName={session?.user.name ?? ""}
                    blockedReason={
                      !stay.hostUserId
                        ? "This is a sample stay without a host, so it can't be booked."
                        : session?.user.id === stay.hostUserId
                          ? "This is your stay. Bookings arrive in your hosting workspace."
                          : null
                    }
                  />
                )}
                {showMessageHost && stay && (
                  <div className="border border-line-light bg-card p-4">
                    {conversation ? (
                      <>
                        <p className="flex items-center justify-between gap-3 text-[0.9375rem] font-medium">
                          Your conversation with {stay.host?.name ?? "the host"}
                          {conversation.unread > 0 && (
                            <span className="rounded-full bg-brick px-2 py-0.5 text-[0.6875rem] font-semibold text-on-contrast">
                              {conversation.unread} new
                            </span>
                          )}
                        </p>
                        {conversation.last && (
                          <p className="mt-1.5 line-clamp-2 text-[0.875rem] text-graphite">
                            {conversation.last.mine ? "You: " : ""}
                            {conversation.last.body}
                          </p>
                        )}
                        <Link href={messageHref} className="mt-3 inline-block text-[0.875rem] font-medium underline">
                          Open the conversation
                        </Link>
                      </>
                    ) : (
                      <>
                        <p className="text-[0.9375rem] font-medium">Questions before you book?</p>
                        <p className="mt-1 text-[0.875rem] text-graphite">Ask {stay.host?.name ?? "the host"} about the home, the area or your dates.</p>
                        <Link href={messageHref} className="mt-3 inline-block text-[0.875rem] font-medium underline">
                          Message {stay.host?.name ?? "the host"}
                        </Link>
                      </>
                    )}
                  </div>
                )}
                {listing.status === "published" && !stay && (
                  <ListingContact
                    referenceId={listing.referenceId}
                    context={contact}
                    loggedIn={Boolean(session)}
                    defaultName={session?.user.name ?? ""}
                    minVisitDate={istDateFromNow(1)}
                  />
                )}
              </div>
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-stone-deep">
                Listed by {listing.organizationName}
                {listing.publishedAt
                  ? ` · ${formatDate(listing.publishedAt, { day: "numeric", month: "short", year: "numeric" })}`
                  : ""}
              </p>
              <p className="mt-1 text-[0.75rem] text-stone-deep">
                Listing ID {listing.referenceId}
              </p>
              <div className="mt-4">
                <ReportListing
                  referenceId={listing.referenceId}
                  loggedIn={Boolean(session)}
                />
              </div>
              <ViewBeacon referenceId={listing.referenceId} />
            </div>
          </aside>
        </div>
      </main>
      {shell && <ServiceFooter shell={shell} />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line-light pb-2 sm:block sm:border-b-0 sm:pb-0">
      <dt className="text-stone-deep">{label}</dt>
      <dd className="text-right sm:mt-0.5 sm:text-left">{value}</dd>
    </div>
  );
}
