"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useFormAction } from "@/components/workspace/forms";
import { enquiryAction, recordViewAction, reportAction } from "@/app/(browse)/listings/actions";
import type { ActionResult } from "@/lib/errors";

type Context = { agentName: string; organization: string | null; agentVerified: boolean; hasOpenEnquiry: boolean; isOwn: boolean } | null;

const fieldClass =
  "block w-full rounded-[2px] border border-line-light bg-paper px-3.5 py-2.5 text-[0.9375rem] focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_28%,transparent)]";

function Send({ children, pending }: { children: React.ReactNode; pending: boolean }) {
  return (
    <button type="submit" className="btn btn-dark w-full" disabled={pending} aria-busy={pending}>
      <span>{pending ? "Sending…" : children}</span>
    </button>
  );
}

function Err({ state, name }: { state: ActionResult | null; name: string }) {
  const msg = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  return msg ? <p className="mt-1.5 text-[0.8125rem] text-brick">{msg}</p> : null;
}

/**
 * Contact the agent, or ask to visit. Logged-in customers only, because the agent needs a
 * real, confirmed person to call back. The phone number is shared with the agent for this purpose.
 */
export function ListingContact({ referenceId, context, loggedIn, defaultName, minVisitDate }: { referenceId: string; context: Context; loggedIn: boolean; defaultName: string; minVisitDate: string }) {
  const [open, setOpen] = useState(false);
  const [visit, setVisit] = useState(false);
  const { state, pending, formAction, onSubmit } = useFormAction<ActionResult>(enquiryAction);
  const id = useId();

  if (!context) {
    return (
      <p className="border border-line-light bg-paper px-4 py-3 text-[0.875rem] text-stone-deep">
        This is a sample listing without an agent, so it can&apos;t be contacted.
      </p>
    );
  }
  if (context.isOwn) return <p className="text-[0.875rem] text-stone-deep">This is your listing. Enquiries arrive in your workspace.</p>;
  if (!loggedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/listings/${referenceId}`)}`} className="btn btn-dark w-full">
        <span>Log in to contact the agent</span>
      </Link>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="border-l-2 border-sage bg-sage/10 px-4 py-3 text-[0.875rem] text-graphite">
        {state.message}
      </p>
    );
  }
  if (!open) {
    return (
      <>
        <button type="button" className="btn btn-dark w-full" onClick={() => setOpen(true)} aria-expanded={false}>
          <span>{context.hasOpenEnquiry ? "Message the agent again" : "Contact the agent"}</span>
        </button>
        <p className="mt-2 text-[0.8125rem] text-stone-deep">
          {context.agentName}
          {context.organization ? `, ${context.organization}` : ""}
          {context.agentVerified ? " · Verified agent" : ""}
        </p>
      </>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-3 border border-line-light bg-paper p-4" noValidate>
      <p className="text-[0.875rem] font-medium">
        Contact {context.agentName}
        {context.organization ? ` (${context.organization})` : ""}
      </p>
      {state && !state.ok && (
        <p role="alert" className="text-[0.8125rem] text-brick">
          {state.message}
        </p>
      )}
      <input type="hidden" name="ref" value={referenceId} />
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-[0.8125rem] font-medium">
          Your name
        </label>
        <input id={`${id}-name`} name="name" defaultValue={defaultName} autoComplete="name" className={fieldClass} required />
        <Err state={state} name="name" />
      </div>
      <div>
        <label htmlFor={`${id}-phone`} className="mb-1 block text-[0.8125rem] font-medium">
          Phone
        </label>
        <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" className={fieldClass} required />
        <Err state={state} name="phone" />
      </div>
      <div>
        <label htmlFor={`${id}-msg`} className="mb-1 block text-[0.8125rem] font-medium">
          Message (optional)
        </label>
        <textarea id={`${id}-msg`} name="message" rows={3} maxLength={1000} className={fieldClass} placeholder="When are you looking to move? Any questions?" />
      </div>
      <label className="flex items-center gap-2 text-[0.875rem]">
        <input type="checkbox" name="wantsVisit" checked={visit} onChange={(e) => setVisit(e.target.checked)} className="size-4 accent-ink" />
        I&apos;d like to visit
      </label>
      {visit && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-date`} className="mb-1 block text-[0.8125rem] font-medium">
              Preferred date
            </label>
            <input id={`${id}-date`} name="visitDate" type="date" min={minVisitDate} className={fieldClass} />
            <Err state={state} name="visitDate" />
          </div>
          <div>
            <label htmlFor={`${id}-time`} className="mb-1 block text-[0.8125rem] font-medium">
              Time
            </label>
            <select id={`${id}-time`} name="visitTime" className={fieldClass}>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </div>
        </div>
      )}
      <Send pending={pending}>{visit ? "Request a visit" : "Send"}</Send>
      <p className="text-[0.75rem] text-stone-deep">The agent sees your name, phone and email so they can reply.</p>
    </form>
  );
}

export function ReportListing({ referenceId, loggedIn }: { referenceId: string; loggedIn: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { state, pending, formAction, onSubmit } = useFormAction<ActionResult>(reportAction);
  const id = useId();
  if (!loggedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/listings/${referenceId}`)}`} className="text-[0.8125rem] text-stone-deep underline">
        Report this listing
      </Link>
    );
  }
  return (
    <>
      <button type="button" className="text-[0.8125rem] text-stone-deep underline hover:text-ink" onClick={() => ref.current?.showModal()}>
        Report this listing
      </button>
      <dialog ref={ref} aria-labelledby={`${id}-t`} className="m-auto w-[min(28rem,calc(100vw-2rem))] border border-line-light bg-paper p-6 text-ink backdrop:bg-ink/50">
        <h2 id={`${id}-t`} className="text-[1.125rem] font-semibold">
          Report this listing
        </h2>
        {state?.ok ? (
          <>
            <p role="status" className="mt-3 text-[0.875rem]">
              {state.message}
            </p>
            <button type="button" className="btn btn-dark mt-5 min-h-11 w-full" onClick={() => ref.current?.close()}>
              <span>Close</span>
            </button>
          </>
        ) : (
          <form action={formAction} onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
            <input type="hidden" name="ref" value={referenceId} />
            {state && !state.ok && (
              <p role="alert" className="text-[0.8125rem] text-brick">
                {state.message}
              </p>
            )}
            <fieldset className="space-y-1.5 text-[0.875rem]">
              <legend className="mb-1.5 font-medium">What&apos;s wrong?</legend>
              {[
                ["fraud", "Looks like a scam or fraud"],
                ["incorrect_details", "Price, photos or details are wrong"],
                ["duplicate", "It's a duplicate of another listing"],
                ["unavailable", "It's no longer available"],
                ["offensive", "Offensive or inappropriate content"],
                ["other", "Something else"],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input type="radio" name="reason" value={value} className="accent-ink" required /> {label}
                </label>
              ))}
            </fieldset>
            <div>
              <label htmlFor={`${id}-d`} className="mb-1 block text-[0.8125rem] font-medium">
                Details
              </label>
              <textarea id={`${id}-d`} name="details" rows={3} maxLength={1000} className={fieldClass} />
              <Err state={state} name="details" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost-dark min-h-11 flex-1" onClick={() => ref.current?.close()}>
                <span>Cancel</span>
              </button>
              <div className="flex-1">
                <Send pending={pending}>Send report</Send>
              </div>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

/** Records one view after the page is actually shown, not on prefetch. */
export function ViewBeacon({ referenceId }: { referenceId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const t = setTimeout(() => void recordViewAction(referenceId), 1500);
    return () => clearTimeout(t);
  }, [referenceId]);
  return null;
}
