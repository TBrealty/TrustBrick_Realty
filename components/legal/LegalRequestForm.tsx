"use client";

import Link from "next/link";
import { useId } from "react";
import { legalRequestAction } from "@/app/legal-verification/apply/actions";
import { useFormAction } from "@/components/workspace/forms";
import type { ActionResult } from "@/lib/errors";
import { LEGAL_DOCUMENT_LABELS, LEGAL_PROPERTY_LABELS, LEGAL_PURPOSE_LABELS, LEGAL_SERVICE_INFO, LEGAL_STATE_LABELS } from "@/lib/legal/services";
import type { LegalService } from "@/lib/vocab";

const fieldClass =
  "block w-full min-w-0 rounded-[2px] border border-line-light bg-paper px-3.5 py-3 text-[0.9375rem] text-ink placeholder:text-stone focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_28%,transparent)] aria-invalid:border-brick";
const labelClass = "mb-1.5 block text-[0.8125rem] font-medium";

type Listing = { referenceId: string; title: string; place: string | null };

export type LegalFormDefaults = {
  service?: LegalService;
  state?: string;
  location?: string;
  listing?: Listing;
  name: string;
  email: string;
  signedIn: boolean;
};

function Err({ state, name }: { state: ActionResult | null; name: string }) {
  const msg = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  return msg ? (
    <p id={`err-${name}`} className="mt-1.5 text-[0.8125rem] text-brick">
      {msg}
    </p>
  ) : null;
}

function Group({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    // The rule is on a wrapper: on the fieldset itself, the legend would sit in the border.
    <div className="border-t border-line-light pt-6">
      <fieldset>
        <legend className="mb-5 flex w-full items-baseline gap-3">
          <span className="font-mono text-[0.8125rem] text-stone-deep tabular-nums">0{n}</span>
          <span className="text-[1.0625rem] font-medium">{title}</span>
        </legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>
      </fieldset>
    </div>
  );
}

function Select({ id, name, label, options, defaultValue, state }: { id: string; name: string; label: string; options: Record<string, string>; defaultValue?: string; state: ActionResult | null }) {
  const bad = state && !state.ok && state.fieldErrors?.[name] ? true : undefined;
  return (
    <div>
      <label htmlFor={`${id}-${name}`} className={labelClass}>
        {label}
      </label>
      <select id={`${id}-${name}`} name={name} required defaultValue={defaultValue ?? ""} className={fieldClass} aria-invalid={bad} aria-describedby={bad ? `err-${name}` : undefined}>
        <option value="" disabled>
          Choose one
        </option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      <Err state={state} name={name} />
    </div>
  );
}

export function LegalRequestForm({ defaults }: { defaults: LegalFormDefaults }) {
  const { state, pending, formAction, onSubmit } = useFormAction<ActionResult>(legalRequestAction);
  const id = useId();
  const bad = (name: string) => (state && !state.ok && state.fieldErrors?.[name] ? true : undefined);
  const describe = (name: string) => (bad(name) ? `err-${name}` : undefined);

  if (state?.ok) {
    return (
      <div role="status" className="border border-line-light bg-paper p-6 sm:p-8">
        <p className="eyebrow text-sage">Request received</p>
        <p className="display mt-4 text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.05]">Thank you. We&apos;ll call you.</p>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-graphite">
          Your reference is <span className="font-mono text-ink">{state.message}</span>. Someone from the team will call or email you to agree what&apos;s needed and the fee. Nothing
          is charged until you accept, and nothing is charged online.
        </p>
        <ol className="mt-6 space-y-2 border-t border-line-light pt-5 text-[0.9375rem] text-graphite">
          <li>1. Keep your copies of the documents to hand; the advocate will tell you how to send them.</li>
          <li>2. Don&apos;t pay the seller more than a small, refundable token until the report is back.</li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          {defaults.signedIn && (
            <Link href="/legal-verification/requests" className="btn btn-dark btn-compact">
              <span>Your requests</span>
            </Link>
          )}
          <Link href="/legal-verification/documents" className="btn btn-ghost-dark btn-compact">
            <span>Documents guide</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-8 border border-line-light bg-paper p-5 sm:p-8">
      {state && !state.ok && (
        <p role="alert" className="border-l-2 border-brick bg-brick/6 px-3.5 py-2.5 text-[0.875rem] text-brick">
          {state.code === "RATE_LIMITED" ? "You've sent a few requests already. Please wait a while, or write to us from Contact us." : state.message}
        </p>
      )}

      <fieldset>
        <legend className="mb-5 flex w-full items-baseline gap-3">
          <span className="font-mono text-[0.8125rem] text-stone-deep tabular-nums">01</span>
          <span className="text-[1.0625rem] font-medium">What do you need?</span>
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-describedby={describe("service")}>
          {(Object.entries(LEGAL_SERVICE_INFO) as [LegalService, (typeof LEGAL_SERVICE_INFO)[LegalService]][]).map(([value, s]) => (
            <label
              key={value}
              className="relative flex cursor-pointer gap-3 border border-line-light bg-ivory p-4 transition-colors hover:border-stone has-checked:border-ink has-checked:bg-card has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
            >
              <input type="radio" name="service" value={value} defaultChecked={defaults.service === value} required className="mt-1 size-4 shrink-0 accent-ink" />
              <span>
                <span className="block text-[0.9375rem] font-medium">{s.label}</span>
                <span className="mt-1 block text-[0.8125rem] leading-snug text-stone-deep">
                  {s.outcome}. {s.typical}.
                </span>
              </span>
            </label>
          ))}
        </div>
        <Err state={state} name="service" />
      </fieldset>

      <Group n={2} title="The property">
        {defaults.listing ? (
          <div className="border-l-2 border-sage bg-sage/8 px-4 py-3 sm:col-span-2">
            <input type="hidden" name="listing" value={defaults.listing.referenceId} />
            <p className="text-[0.8125rem] text-stone-deep">About this Trustbrick listing</p>
            <p className="mt-0.5 font-medium">{defaults.listing.title}</p>
            <p className="text-[0.8125rem] text-stone-deep">
              {defaults.listing.place ? `${defaults.listing.place} · ` : ""}
              <span className="font-mono">{defaults.listing.referenceId}</span>
            </p>
          </div>
        ) : null}
        <Select id={id} name="propertyType" label="Kind of property" options={LEGAL_PROPERTY_LABELS} state={state} />
        <Select id={id} name="purpose" label="Why you need it" options={LEGAL_PURPOSE_LABELS} state={state} />
        <Select id={id} name="state" label="State" options={LEGAL_STATE_LABELS} defaultValue={defaults.state} state={state} />
        <div>
          <label htmlFor={`${id}-location`} className={labelClass}>
            Locality and city
          </label>
          <input
            id={`${id}-location`}
            name="location"
            defaultValue={defaults.location}
            required
            maxLength={200}
            placeholder="e.g. Kondapur, Hyderabad"
            className={fieldClass}
            aria-invalid={bad("location")}
            aria-describedby={describe("location")}
          />
          <Err state={state} name="location" />
        </div>
        {!defaults.listing && (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-listing`} className={labelClass}>
              Trustbrick listing reference <span className="font-normal text-stone-deep">(optional)</span>
            </label>
            <input
              id={`${id}-listing`}
              name="listing"
              placeholder="LST-…"
              autoComplete="off"
              spellCheck={false}
              className={`${fieldClass} font-mono sm:max-w-64`}
              aria-invalid={bad("listing")}
              aria-describedby={describe("listing")}
            />
            <Err state={state} name="listing" />
          </div>
        )}
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>
            Documents you have now <span className="font-normal text-stone-deep">(tick any; copies are fine)</span>
          </legend>
          <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {Object.entries(LEGAL_DOCUMENT_LABELS).map(([value, text]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2.5 text-[0.9375rem] text-graphite">
                <input type="checkbox" name="documents" value={value} className="mt-1 size-4 shrink-0 accent-ink" />
                {text}
              </label>
            ))}
          </div>
          <p className="mt-3 text-[0.8125rem] text-stone-deep">
            Missing some? Apply anyway: finding and checking the records is part of the work.{" "}
            <Link href="/legal-verification/documents" className="underline">
              What each one is
            </Link>
          </p>
        </fieldset>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-details`} className={labelClass}>
            Anything else we should know <span className="font-normal text-stone-deep">(optional)</span>
          </label>
          <textarea
            id={`${id}-details`}
            name="details"
            rows={4}
            maxLength={2000}
            className={fieldClass}
            aria-invalid={bad("details")}
            aria-describedby={describe("details")}
            placeholder="For example: the seller holds a power of attorney, it's a resale flat with a loan on it, or you need the report by a date."
          />
          <Err state={state} name="details" />
        </div>
      </Group>

      <Group n={3} title="Your details">
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>
            Your name
          </label>
          <input id={`${id}-name`} name="name" defaultValue={defaults.name} autoComplete="name" required className={fieldClass} aria-invalid={bad("name")} aria-describedby={describe("name")} />
          <Err state={state} name="name" />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className={labelClass}>
            Phone
          </label>
          <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" required className={fieldClass} aria-invalid={bad("phone")} aria-describedby={describe("phone")} />
          <Err state={state} name="phone" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-email`} className={labelClass}>
            Email
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            defaultValue={defaults.email}
            autoComplete="email"
            required
            className={`${fieldClass} sm:max-w-md`}
            aria-invalid={bad("email")}
            aria-describedby={describe("email")}
          />
          <Err state={state} name="email" />
        </div>
        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-start gap-2.5 text-[0.9375rem] leading-relaxed text-graphite">
            <input type="checkbox" name="consent" value="yes" required className="mt-1 size-4 shrink-0 accent-ink" aria-invalid={bad("consent")} aria-describedby={describe("consent")} />
            <span>I agree to Trustbrick sharing these details with the advocate who takes on my request, and contacting me about it.</span>
          </label>
          <Err state={state} name="consent" />
        </div>
      </Group>

      {/* Left empty by people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col-reverse gap-4 border-t border-line-light pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[48ch] text-[0.8125rem] leading-relaxed text-stone-deep">
          {defaults.signedIn ? "You can follow this request in Your requests. " : ""}Don&apos;t put Aadhaar, PAN or bank details here; the advocate asks for what they need.
        </p>
        <button type="submit" disabled={pending} aria-busy={pending} className="btn btn-dark shrink-0">
          <span>{pending ? "Sending…" : "Apply for verification"}</span>
        </button>
      </div>
    </form>
  );
}
