"use client";

import { useId } from "react";
import { contactAction } from "@/app/contact/actions";
import { useFormAction } from "@/components/workspace/forms";
import type { ActionResult } from "@/lib/errors";

const fieldClass =
  "block w-full min-w-0 rounded-[2px] border border-line-light bg-paper px-3.5 py-3 text-[0.9375rem] text-ink placeholder:text-stone focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_28%,transparent)] aria-invalid:border-brick";

function Err({ state, name }: { state: ActionResult | null; name: string }) {
  const msg = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  return msg ? (
    <p id={`err-${name}`} className="mt-1.5 text-[0.8125rem] text-brick">
      {msg}
    </p>
  ) : null;
}

export function ContactForm({ topics, defaultName, defaultEmail, defaultTopic }: { topics: [string, string][]; defaultName: string; defaultEmail: string; defaultTopic?: string }) {
  const { state, pending, formAction, onSubmit } = useFormAction<ActionResult>(contactAction);
  const id = useId();
  const invalid = (name: string) => (state && !state.ok && state.fieldErrors?.[name] ? true : undefined);

  if (state?.ok) {
    return (
      <div role="status" className="border border-line-light bg-paper p-8">
        <p className="eyebrow text-sage">Message sent</p>
        <p className="display mt-4 text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.05]">Thank you. We&apos;ll be in touch.</p>
        <p className="mt-4 text-[0.9375rem] text-graphite">
          Your reference is <span className="font-mono text-ink">{state.message}</span>. Keep it handy if you write to us again about the same thing. We reply by email.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-5 border border-line-light bg-paper p-6 sm:grid-cols-2 sm:p-8">
      {state && !state.ok && (
        <p role="alert" className="border-l-2 border-brick bg-brick/6 px-3.5 py-2.5 text-[0.875rem] text-brick sm:col-span-2">
          {state.code === "RATE_LIMITED" ? "You've sent a few messages already. Please wait a while before sending another." : state.message}
        </p>
      )}
      <div>
        <label htmlFor={`${id}-name`} className="mb-1.5 block text-[0.8125rem] font-medium">
          Your name
        </label>
        <input id={`${id}-name`} name="name" defaultValue={defaultName} autoComplete="name" required className={fieldClass} aria-invalid={invalid("name")} />
        <Err state={state} name="name" />
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="mb-1.5 block text-[0.8125rem] font-medium">
          Email
        </label>
        <input id={`${id}-email`} name="email" type="email" defaultValue={defaultEmail} autoComplete="email" required className={fieldClass} aria-invalid={invalid("email")} />
        <Err state={state} name="email" />
      </div>
      <div>
        <label htmlFor={`${id}-phone`} className="mb-1.5 block text-[0.8125rem] font-medium">
          Phone <span className="font-normal text-stone-deep">(optional)</span>
        </label>
        <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" className={fieldClass} aria-invalid={invalid("phone")} />
        <Err state={state} name="phone" />
      </div>
      <div>
        <label htmlFor={`${id}-topic`} className="mb-1.5 block text-[0.8125rem] font-medium">
          What is it about?
        </label>
        <select id={`${id}-topic`} name="topic" required defaultValue={defaultTopic ?? ""} className={fieldClass} aria-invalid={invalid("topic")}>
          <option value="" disabled>
            Choose one
          </option>
          {topics.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Err state={state} name="topic" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-message`} className="mb-1.5 block text-[0.8125rem] font-medium">
          Message
        </label>
        <textarea
          id={`${id}-message`}
          name="message"
          rows={6}
          maxLength={4000}
          required
          className={fieldClass}
          aria-invalid={invalid("message")}
          placeholder="Tell us what you need. If it's about a listing, booking or your account, include its reference (LST-, BKG-, USR-…)."
        />
        <Err state={state} name="message" />
      </div>
      {/* Left empty by people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2">
        <p className="max-w-[46ch] text-[0.8125rem] text-stone-deep">We use these details only to reply to you. Don&apos;t include passwords, card numbers or ID numbers.</p>
        <button type="submit" disabled={pending} aria-busy={pending} className="btn btn-dark">
          <span>{pending ? "Sending…" : "Send message"}</span>
        </button>
      </div>
    </form>
  );
}
