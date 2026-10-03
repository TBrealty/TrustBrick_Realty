"use client";

import { CloseDealFields } from "./CloseDealFields";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition } from "react";
import { listingAvailabilityAction, loadListingCardAction, updateListingTermsAction } from "@/app/(workspace)/properties/card-actions";
import { formatCount, formatDateTime, formatDay } from "@/lib/format";
import type { ListingCardData } from "@/lib/services/listings/card";
import { ActionForm, Checkbox, Submit, TextArea, TextInput } from "./forms";
import { ReferenceId } from "./ReferenceId";
import { StatusBadge, When } from "./ui";

type Tab = "overview" | "edit";

/**
 * "View" in the Action column of Properties & listings. Opens a card with everything about
 * the listing and, for people allowed to, an Edit tab: availability, price and terms, PG beds
 * and the offer. Loaded on demand; the server re-checks permission and scope on every call.
 */
export function ViewListing({ referenceId, title }: { referenceId: string; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [data, setData] = useState<ListingCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await loadListingCardAction(referenceId);
      if (result.ok && result.data) {
        setData(result.data);
        setError(null);
      } else setError(result.ok ? "Nothing to show." : result.message);
    });
  }, [referenceId]);

  const open = (initial: Tab) => {
    setTab(initial);
    dialogRef.current?.showModal();
    load();
  };

  const changed = () => {
    load();
    router.refresh();
  };

  const editable = data ? data.can.editTerms || data.can.availability.length > 0 : false;

  return (
    <>
      <button type="button" className="wbtn wbtn-secondary wbtn-sm" onClick={() => open("overview")} aria-haspopup="dialog" aria-label={`View ${title}`}>
        View
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-busy={pending}
        className="m-auto max-h-[min(92svh,60rem)] w-[min(62rem,calc(100vw-1.5rem))] overflow-hidden rounded-[4px] border border-line-light bg-card p-0 text-left text-ink shadow-2xl backdrop:bg-ink/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="flex max-h-[min(92svh,60rem)] flex-col">
          <header className="border-b border-line-light px-5 pt-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-medium tracking-[0.12em] text-stone-deep uppercase">{data ? `${data.purposeLabel} · ${data.priceLabel}` : "Property"}</p>
                <h2 id={titleId} className="mt-0.5 line-clamp-2 text-[1.25rem] font-semibold tracking-[-0.01em]">
                  {data?.title ?? title}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {data && <StatusBadge tone={data.statusTone}>{data.statusLabel}</StatusBadge>}
                  <ReferenceId value={referenceId} />
                  {data && <ReferenceId value={data.propertyReferenceId} copy={false} />}
                  {data?.isSample && <span className="rounded-[2px] bg-ink px-1.5 py-0.5 font-mono text-[0.625rem] tracking-wider text-paper uppercase">Sample</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="-mr-2 grid size-9 shrink-0 place-items-center rounded-[3px] text-stone-deep hover:bg-paper hover:text-ink"
                aria-label="Close"
              >
                <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div role="tablist" aria-label="Property card" className="mt-3 flex gap-5">
              {(["overview", "edit"] as const)
                .filter((t) => t === "overview" || editable)
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`-mb-px border-b-2 pb-2.5 text-[0.8125rem] font-medium ${tab === t ? "border-ink text-ink" : "border-transparent text-stone-deep hover:text-ink"}`}
                  >
                    {t === "overview" ? "Overview" : "Edit price, availability & offer"}
                  </button>
                ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6" role="tabpanel">
            {error ? (
              <p role="alert" className="rounded-[3px] border-l-2 border-brick bg-brick/10 px-3.5 py-2.5 text-[0.8125rem]">
                {error}
              </p>
            ) : !data ? (
              <Loading />
            ) : tab === "edit" && editable ? (
              <EditPanel data={data} onChanged={changed} />
            ) : (
              <Overview data={data} />
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-light px-5 py-3 sm:px-6">
            <p className="text-[0.75rem] text-stone-deep">{pending && data ? "Refreshing…" : "Changes here are recorded in the audit log."}</p>
            <div className="flex flex-wrap gap-2">
              {data?.publicUrl && (
                <Link href={data.publicUrl} target="_blank" className="wbtn wbtn-ghost wbtn-sm">
                  Public page ↗
                </Link>
              )}
              <button type="button" className="wbtn wbtn-secondary wbtn-sm" onClick={() => dialogRef.current?.close()}>
                Close
              </button>
              {data && (
                <Link href={data.href} className="wbtn wbtn-primary wbtn-sm">
                  Open full page
                </Link>
              )}
            </div>
          </footer>
        </div>
      </dialog>
    </>
  );
}

function Loading() {
  return (
    <div className="space-y-4" aria-label="Loading">
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-[3px] bg-paper" />
        ))}
      </div>
      <div className="h-16 animate-pulse rounded-[3px] bg-paper" />
      <div className="h-40 animate-pulse rounded-[3px] bg-paper" />
    </div>
  );
}

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[0.8125rem] font-semibold">{title}</h3>
        {hint && <p className="text-[0.75rem] text-stone-deep">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function OfferBanner({ offer }: { offer: NonNullable<ListingCardData["offer"]> }) {
  return (
    <div className={`rounded-[3px] border-l-2 px-3.5 py-2.5 text-[0.8125rem] ${offer.active ? "border-brick bg-brick/8" : "border-line-light bg-paper text-stone-deep"}`}>
      <p className="font-medium">
        Offer: {offer.title}
        {!offer.active && " (ended)"}
      </p>
      {offer.details && <p className="mt-0.5">{offer.details}</p>}
      {offer.validUntil && <p className="mt-0.5 text-[0.75rem] text-stone-deep">Valid until {formatDay(offer.validUntil)}</p>}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function Overview({ data }: { data: ListingCardData }) {
  return (
    <>
      {data.photos.length > 0 ? (
        <div className="-mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-1">
          {data.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- workspace thumbnails, already sized
            <img key={p.url} src={p.url} alt={p.alt} className="aspect-[4/3] w-44 shrink-0 snap-start rounded-[3px] bg-sand object-cover sm:w-52" />
          ))}
        </div>
      ) : (
        <p className="rounded-[3px] bg-paper px-3 py-2.5 text-[0.8125rem] text-stone-deep">No photos yet.</p>
      )}

      {(data.statusReason || data.offer) && (
        <div className="mt-4 space-y-2">
          {data.statusReason && (
            <p className="rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem]">
              <span className="font-medium">Note:</span> {data.statusReason}
            </p>
          )}
          {data.offer && <OfferBanner offer={data.offer} />}
        </div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {[
          ["Price", data.priceLabel],
          ["Views", `${formatCount(data.stats.views)}`, `${formatCount(data.stats.uniqueViewers)} unique`],
          ["Leads", formatCount(data.stats.leads)],
          ["Site visits", formatCount(data.stats.visits)],
          ["Saved by", formatCount(data.stats.saves), "customers"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-[3px] border border-line-light px-3 py-2.5">
            <dt className="text-[0.75rem] text-stone-deep">{label}</dt>
            <dd className="mt-0.5 text-[1.0625rem] font-semibold tabular-nums">{value}</dd>
            {hint && <dd className="text-[0.6875rem] text-stone-deep">{hint}</dd>}
          </div>
        ))}
      </dl>

      {data.sections.map((s) => (
        <Section key={s.title} title={s.title}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 lg:grid-cols-3">
            {s.facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[0.75rem] text-stone-deep">{k}</dt>
                <dd className="mt-0.5 text-[0.875rem] break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}

      {data.rooms.length > 0 && (
        <Section title="Rooms and rent">
          <div className="overflow-x-auto rounded-[3px] border border-line-light">
            <table className="w-full text-[0.8125rem]">
              <thead className="bg-paper text-left text-[0.75rem] text-stone-deep">
                <tr>
                  <th className="px-3 py-2 font-medium">Room</th>
                  <th className="px-3 py-2 text-right font-medium">Rent per bed</th>
                  <th className="px-3 py-2 text-right font-medium">Deposit</th>
                  <th className="px-3 py-2 text-right font-medium">Beds free</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-light">
                {data.rooms.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">₹{r.rentPerBed.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.deposit ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.bedsAvailable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {data.amenities.length > 0 && (
        <Section title="Amenities">
          <ul className="flex flex-wrap gap-1.5">
            {data.amenities.map((a) => (
              <li key={a} className="rounded-full border border-line-light px-2.5 py-0.5 text-[0.75rem]">
                {a}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.description && (
        <Section title="Description">
          <p className="text-[0.875rem] whitespace-pre-line text-graphite">{data.description}</p>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <Section title="Price history">
          {data.priceHistory.length === 0 ? (
            <p className="text-[0.8125rem] text-stone-deep">Recorded once the listing is live.</p>
          ) : (
            <ul className="space-y-1.5 text-[0.8125rem]">
              {data.priceHistory.map((h) => (
                <li key={h.from} className="flex justify-between gap-3">
                  <span className="font-medium tabular-nums">{h.price}</span>
                  <span className="text-stone-deep">
                    {formatDay(h.from)} → {h.to ? formatDay(h.to) : "now"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Status history">
          <ol className="space-y-2 text-[0.8125rem]">
            {data.history.map((h, i) => (
              <li key={i}>
                <p>
                  <span className="font-medium">{h.label}</span>
                  <span className="text-stone-deep">
                    {" "}
                    · {h.actor ?? "System"} · <When at={h.at} />
                  </span>
                </p>
                {h.reason && <p className="text-[0.75rem] text-stone-deep">&ldquo;{h.reason}&rdquo;</p>}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}

// ── Edit ────────────────────────────────────────────────────────────────────

function EditPanel({ data, onChanged }: { data: ListingCardData; onChanged: () => void }) {
  const formRef = useRef<HTMLDivElement>(null);
  const t = data.terms;
  const money = (v: number | null) => (v === null ? "" : String(v));

  const clearOffer = () => {
    for (const name of ["offerTitle", "offerDetails", "offerValidUntil"]) {
      const el = formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
      if (el) el.value = "";
    }
  };

  return (
    <>
      <Availability data={data} onChanged={onChanged} />

      {data.can.frozenReason && <p className="mt-5 rounded-[3px] bg-paper px-3.5 py-2.5 text-[0.8125rem] text-stone-deep">{data.can.frozenReason}</p>}

      {data.can.editTerms && (
        <div ref={formRef}>
          <ActionForm action={updateListingTermsAction} onSuccess={onChanged} className="mt-6">
            <input type="hidden" name="ref" value={data.referenceId} />
            <Section title="Price and terms" hint={data.status === "published" ? "Live: changes show to customers straight away and enter the price history." : undefined}>
              {data.purpose === "stay" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextInput label="Price per night (₹)" name="price" defaultValue={money(t.price)} inputMode="numeric" required />
                  <TextInput label="Weekend price per night (₹)" name="weekendPrice" defaultValue={money(t.weekendPrice)} inputMode="numeric" hint="Friday and Saturday nights." />
                  <TextInput label="Cleaning fee (₹)" name="cleaningFee" defaultValue={money(t.cleaningFee)} inputMode="numeric" />
                  <div className="grid grid-cols-2 gap-3">
                    <TextInput label="Shortest stay" name="minNights" defaultValue={money(t.minNights)} inputMode="numeric" required />
                    <TextInput label="Longest stay" name="maxNights" defaultValue={money(t.maxNights)} inputMode="numeric" required />
                  </div>
                  <div className="sm:col-span-2">
                    <Checkbox label="Instant book" name="instantBook" defaultChecked={t.instantBook} hint="Guests are confirmed straight away instead of waiting for approval." />
                  </div>
                  <p className="text-[0.75rem] text-stone-deep sm:col-span-2">Block dates and set festival prices from the Calendar.</p>
                </div>
              ) : data.purpose === "pg" ? (
                <>
                  <div className="space-y-3">
                    {data.rooms.map((r, i) => (
                      <fieldset key={r.id} className="grid grid-cols-1 gap-3 rounded-[3px] border border-line-light p-3 sm:grid-cols-[1fr_10rem_8rem] sm:items-end">
                        <legend className="sr-only">{r.label}</legend>
                        <input type="hidden" name={`rooms[${i}][id]`} value={r.id} />
                        <p className="text-[0.875rem] font-medium sm:pb-2.5">{r.label}</p>
                        <TextInput label="Rent per bed (₹)" name={`rooms[${i}][rentPerBed]`} defaultValue={r.rentPerBed} inputMode="numeric" required />
                        <TextInput label="Beds free" name={`rooms[${i}][bedsAvailable]`} defaultValue={r.bedsAvailable} inputMode="numeric" required />
                      </fieldset>
                    ))}
                  </div>
                  <p className="mt-2 text-[0.75rem] text-stone-deep">Set beds free to 0 when a room type is full. The listing shows the lowest rent among rooms with free beds.</p>
                  <div className="mt-3 max-w-xs">
                    <TextInput label="Available from" name="availableFrom" type="date" defaultValue={t.availableFrom ?? ""} />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextInput label={data.purpose === "sale" ? "Price (₹)" : "Monthly rent (₹)"} name="price" defaultValue={money(t.price)} inputMode="numeric" required />
                  {data.purpose !== "sale" && <TextInput label="Security deposit (₹)" name="depositAmount" defaultValue={money(t.depositAmount)} inputMode="numeric" />}
                  <TextInput label="Maintenance (₹ per month)" name="maintenanceAmount" defaultValue={money(t.maintenanceAmount)} inputMode="numeric" />
                  <TextInput label="Available from" name="availableFrom" type="date" defaultValue={t.availableFrom ?? ""} />
                  <div className="sm:col-span-2">
                    <Checkbox label="Price is negotiable" name="priceNegotiable" defaultChecked={t.priceNegotiable} />
                  </div>
                </div>
              )}
            </Section>

            <Section
              title="Offer"
              hint={
                <button type="button" onClick={clearOffer} className="underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                  Clear offer
                </button>
              }
            >
              <p className="mb-3 text-[0.75rem] text-stone-deep">Shown on the listing, e.g. &ldquo;No brokerage&rdquo;, &ldquo;First month&apos;s rent free&rdquo; or &ldquo;₹2 L off till Diwali&rdquo;. Leave empty for no offer.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_12rem]">
                <TextInput label="Offer title" name="offerTitle" defaultValue={t.offerTitle ?? ""} maxLength={60} />
                <TextInput label="Valid until (optional)" name="offerValidUntil" type="date" defaultValue={t.offerValidUntil ?? ""} />
                <TextArea label="Details (optional)" name="offerDetails" defaultValue={t.offerDetails ?? ""} rows={2} maxLength={280} fieldClassName="sm:col-span-2" />
              </div>
            </Section>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-light pt-4">
              <p className="text-[0.75rem] text-stone-deep">
                Photos, description and property details change through the {data.can.openFullEditor ? "full editor" : "agent's editor"}; live listings need a new review for those.
              </p>
              <Submit>Save changes</Submit>
            </div>
          </ActionForm>
        </div>
      )}
    </>
  );
}

function Availability({ data, onChanged }: { data: ListingCardData; onChanged: () => void }) {
  const [confirming, setConfirming] = useState<ListingCardData["can"]["availability"][number] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [closeErrors, setCloseErrors] = useState<Record<string, string>>({});
  const run = (action: "mark_closed" | "reopen", close?: { outcome: string; dealValue: string; brokerage: string }) =>
    startTransition(async () => {
      const result = await listingAvailabilityAction(data.referenceId, action, close);
      // A sale or rental that needs another look at its deal details keeps the form open.
      if (!result.ok && result.fieldErrors && close) {
        setCloseErrors(result.fieldErrors);
        setMessage({ ok: false, text: result.message });
        return;
      }
      setConfirming(null);
      setCloseErrors({});
      setMessage(result.ok ? { ok: true, text: action === "reopen" ? "It's back on the marketplace." : "Marked. It's off the marketplace now." } : { ok: false, text: result.message });
      if (result.ok) onChanged();
    });

  return (
    <Section title="Availability">
      <div className="rounded-[3px] border border-line-light p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.8125rem]">
            Now: <StatusBadge tone={data.statusTone}>{data.statusLabel}</StatusBadge>
            {data.status === "published" && <span className="ml-2 text-stone-deep">Customers can see and enquire.</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {data.can.availability.map((a) => (
              <button
                key={a.action}
                type="button"
                className={`wbtn wbtn-sm ${a.action === "reopen" ? "wbtn-primary" : "wbtn-secondary"}`}
                onClick={() => {
                  setMessage(null);
                  setConfirming(a);
                }}
                disabled={pending}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        {data.can.availability.length === 0 && (
          <p className="mt-2 text-[0.75rem] text-stone-deep">
            {data.status === "published" || data.status === "transacted"
              ? "You can't change this listing's availability."
              : "Availability can be changed once the listing is live. Drafts and listings in review change through the full page."}
          </p>
        )}
        {confirming && (
          <div role="alertdialog" aria-label={`${confirming.label}?`} className="mt-3 rounded-[3px] bg-paper p-3 text-[0.8125rem]">
            <p className="font-medium">{confirming.label}?</p>
            <p className="mt-0.5 text-stone-deep">{confirming.confirm}</p>
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const value = (k: string) => (typeof f.get(k) === "string" ? String(f.get(k)) : "");
                run(confirming.action, confirming.action === "mark_closed" && data.deal ? { outcome: value("outcome"), dealValue: value("dealValue"), brokerage: value("brokerage") } : undefined);
              }}
            >
              {confirming.action === "mark_closed" && data.deal && (
                <div className="mb-3">
                  <CloseDealFields deal={data.deal} errors={closeErrors} />
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit" className="wbtn wbtn-primary wbtn-sm" disabled={pending}>
                  {pending ? "Working…" : `Yes, ${confirming.label.toLowerCase()}`}
                </button>
                <button
                  type="button"
                  className="wbtn wbtn-secondary wbtn-sm"
                  onClick={() => {
                    setConfirming(null);
                    setCloseErrors({});
                  }}
                  disabled={pending}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
        {message && (
          <p role={message.ok ? "status" : "alert"} className={`mt-3 text-[0.8125rem] ${message.ok ? "text-sage" : "text-brick"}`}>
            {message.text}
          </p>
        )}
      </div>
      {data.history[0] && <p className="mt-2 text-[0.6875rem] text-stone-deep">Last status change {formatDateTime(data.history[0].at)}.</p>}
    </Section>
  );
}
