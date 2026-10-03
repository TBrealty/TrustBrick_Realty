"use client";

import { useMemo, useState } from "react";
import { useFormAction } from "@/components/workspace/forms";
import { createDraftAction } from "@/app/(workspace)/properties/actions";
import type { ActionResult } from "@/lib/errors";
import { CATEGORY_LABELS, PURPOSE_LABELS } from "@/lib/listings/onboarding-schema";
import type { OnboardingOptions } from "@/lib/services/listings/onboarding";
import { MapLinkField } from "./MapLinkField";

type Purpose = keyof typeof PURPOSE_LABELS;
type Category = keyof typeof CATEGORY_LABELS;

const PURPOSE_HINTS: Record<Purpose, string> = {
  sale: "Sell a home, commercial space or land.",
  rent: "Let a home or space on a monthly rent.",
  lease: "A longer commercial or residential lease.",
  pg: "Paying-guest rooms or co-living, priced per bed.",
  stay: "Host guests for nights or weeks, like Airbnb. Priced per night.",
};

const CATEGORY_HINTS: Record<Category, string> = {
  residential: "Apartments, houses, villas, floors, studios.",
  commercial: "Offices, shops, showrooms, warehouses.",
  land: "Residential, commercial, agricultural or industrial land.",
  co_living: "PGs, co-living and hostels.",
};

const STEPS = ["Purpose", "Category", "Type", "Location"] as const;
const LOCATION_FIELDS = ["localityId", "line1", "line2", "landmark", "postalCode", "mapLink"];

/**
 * Steps 1–4 of Onboard Property. One form; the steps only change what is visible. The draft
 * is created on the server when this form is submitted, and the rest of the workflow edits it.
 */
export function StartWizard({ options, purposes, initialPurpose }: { options: OnboardingOptions; purposes: Purpose[]; initialPurpose?: Purpose }) {
  const { state, pending, formAction, onSubmit } = useFormAction<ActionResult>(createDraftAction);
  // A single allowed purpose (hosts can only list homestays) skips the question entirely.
  const start = purposes.length === 1 ? purposes[0] : initialPurpose && purposes.includes(initialPurpose) ? initialPurpose : null;
  const startCategories = start ? (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => options.types.some((t) => t.category === c && t.purposes.includes(start))) : [];
  const [step, setStep] = useState(start ? (startCategories.length === 1 ? 2 : 1) : 0);
  const [purpose, setPurpose] = useState<Purpose | null>(start);
  const [category, setCategory] = useState<Category | null>(startCategories.length === 1 ? startCategories[0] : null);
  const [type, setType] = useState<string | null>(null);
  const [cityId, setCityId] = useState("");
  const [localityId, setLocalityId] = useState("");
  const [seenState, setSeenState] = useState(state);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  // Jump to the step that holds the first server error (adjusting state during render, not in an effect).
  if (state !== seenState) {
    setSeenState(state);
    if (state && !state.ok) {
      if (errors.purpose) setStep(0);
      else if (errors.propertyType) setStep(2);
      else if (Object.keys(errors).some((k) => LOCATION_FIELDS.includes(k))) setStep(3);
    }
  }

  const categories = useMemo(
    () => (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => purpose && options.types.some((t) => t.category === c && t.purposes.includes(purpose))),
    [purpose, options.types],
  );
  const types = options.types.filter((t) => t.category === category && purpose && t.purposes.includes(purpose));
  const city = options.cities.find((c) => c.id === cityId);

  const choosePurpose = (p: Purpose) => {
    setPurpose(p);
    const cats = (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => options.types.some((t) => t.category === c && t.purposes.includes(p)));
    // PG has exactly one category; skip a step with a single choice.
    if (cats.length === 1) {
      setCategory(cats[0]);
      setType(null);
      setStep(2);
    } else {
      setCategory(null);
      setType(null);
      setStep(1);
    }
  };

  return (
    <form action={formAction} onSubmit={onSubmit} className="mx-auto max-w-3xl" noValidate>
      <input type="hidden" name="purpose" value={purpose ?? ""} />
      <input type="hidden" name="propertyType" value={type ?? ""} />

      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <span className={`block h-1 rounded-full ${i <= step ? "bg-ink" : "bg-ink/10"}`} aria-hidden />
            <span className={`mt-1.5 block text-[0.75rem] ${i === step ? "font-medium text-ink" : "text-stone-deep"}`}>
              <span className="sr-only">Step {i + 1}: </span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {state && !state.ok && (
        <p role="alert" className="mb-4 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.8125rem] text-brick">
          {state.message}
        </p>
      )}

      {step === 0 && (
        <Step title="What is the property for?">
          <Choices>
            {purposes.map((p) => (
              <Choice key={p} selected={purpose === p} onSelect={() => choosePurpose(p)} title={PURPOSE_LABELS[p]} hint={PURPOSE_HINTS[p]} />
            ))}
          </Choices>
        </Step>
      )}

      {step === 1 && purpose && (
        <Step title="What kind of property is it?" onBack={() => setStep(0)}>
          <Choices>
            {categories.map((c) => (
              <Choice
                key={c}
                selected={category === c}
                onSelect={() => {
                  setCategory(c);
                  setType(null);
                  setStep(2);
                }}
                title={CATEGORY_LABELS[c]}
                hint={CATEGORY_HINTS[c]}
              />
            ))}
          </Choices>
        </Step>
      )}

      {step === 2 && purpose && category && (
        <Step title="Which property type?" onBack={purposes.length === 1 && categories.length === 1 ? undefined : () => setStep(categories.length === 1 ? 0 : 1)} error={errors.propertyType}>
          <Choices>
            {types.map((t) => (
              <Choice
                key={t.code}
                selected={type === t.code}
                onSelect={() => {
                  setType(t.code);
                  setStep(3);
                }}
                title={t.name}
              />
            ))}
          </Choices>
        </Step>
      )}

      <div hidden={step !== 3}>
        <Step title="Where is it?" onBack={() => setStep(2)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="mb-1.5 block text-[0.8125rem] font-medium">
                City <span className="text-brick" aria-hidden>*</span>
              </label>
              <select
                id="city"
                className="winput"
                value={cityId}
                onChange={(e) => {
                  setCityId(e.target.value);
                  setLocalityId("");
                }}
              >
                <option value="">Choose a city</option>
                {options.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}, {c.state}
                  </option>
                ))}
              </select>
            </div>
            <Labeled id="localityId" label="Locality" required error={errors.localityId}>
              <select id="localityId" name="localityId" className="winput" value={localityId} onChange={(e) => setLocalityId(e.target.value)} disabled={!city} aria-invalid={errors.localityId ? true : undefined}>
                <option value="">{city ? "Choose a locality" : "Choose a city first"}</option>
                {city?.localities.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled id="line1" label="Building / street" required error={errors.line1} className="sm:col-span-2">
              <input id="line1" name="line1" className="winput" autoComplete="address-line1" placeholder="e.g. Tower B, Green Meadows, Road No. 12" aria-invalid={errors.line1 ? true : undefined} />
            </Labeled>
            <Labeled id="line2" label="Area or sub-locality" error={errors.line2}>
              <input id="line2" name="line2" className="winput" autoComplete="address-line2" />
            </Labeled>
            <Labeled id="landmark" label="Landmark" error={errors.landmark}>
              <input id="landmark" name="landmark" className="winput" placeholder="e.g. Opposite the metro station" />
            </Labeled>
            <Labeled id="postalCode" label="PIN code" error={errors.postalCode}>
              <input id="postalCode" name="postalCode" className="winput" inputMode="numeric" maxLength={6} autoComplete="postal-code" />
            </Labeled>
          </div>

          <div className="mt-5">
            <MapLinkField error={errors.mapLink} />
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <CreateButton disabled={!purpose || !type} pending={pending} />
          </div>
          <p className="mt-3 text-right text-[0.75rem] text-stone-deep">This creates a private draft. Nothing is visible to customers until it&apos;s reviewed and approved.</p>
        </Step>
      </div>
    </form>
  );
}

function Step({ title, children, onBack, error }: { title: string; children: React.ReactNode; onBack?: () => void; error?: string }) {
  return (
    <section className="wcard p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-semibold">{title}</h2>
        {onBack && (
          <button type="button" onClick={onBack} className="wbtn wbtn-ghost wbtn-sm">
            ← Back
          </button>
        )}
      </div>
      {error && <p className="mb-3 text-[0.8125rem] text-brick">{error}</p>}
      {children}
    </section>
  );
}

function Choices({ children }: { children: React.ReactNode }) {
  return (
    <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {children}
    </div>
  );
}

function Choice({ selected, onSelect, title, hint }: { selected: boolean; onSelect: () => void; title: string; hint?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`min-h-16 rounded-[4px] border px-4 py-3.5 text-left transition-colors ${
        selected ? "border-ink bg-ink text-paper" : "border-line-light bg-card hover:border-ink/40"
      }`}
    >
      <span className="block text-[0.9375rem] font-medium">{title}</span>
      {hint && <span className={`mt-0.5 block text-[0.8125rem] ${selected ? "text-paper/70" : "text-stone-deep"}`}>{hint}</span>}
    </button>
  );
}

function Labeled({ id, label, required, error, hint, className = "", children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-medium">
        {label}
        {required && (
          <span className="ml-0.5 text-brick" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {(error || hint) && <p className={`mt-1.5 text-[0.75rem] ${error ? "text-brick" : "text-stone-deep"}`}>{error ?? hint}</p>}
    </div>
  );
}

function CreateButton({ disabled, pending }: { disabled: boolean; pending: boolean }) {
  return (
    <button type="submit" className="wbtn wbtn-primary" disabled={disabled || pending}>
      {pending ? "Creating draft…" : "Create draft and continue"}
    </button>
  );
}
