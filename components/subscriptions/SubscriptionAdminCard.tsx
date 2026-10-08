"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { pauseSubscriptionAction, resumeSubscriptionAction, revokeSubscriptionAction } from "@/app/(workspace)/subscriptions/actions";
import { formatDay } from "@/lib/format";
import type { SubscriptionView } from "@/lib/services/subscriptions";
import { CYCLE_LABELS, LIVE_STATES, STATE_LABELS, inr } from "@/lib/subscriptions/terms";

type Mode = "pause" | "resume" | "revoke";

const TONE: Record<string, string> = {
  success: "bg-sage/15 text-sage-deep",
  info: "bg-slate/10 text-slate",
  warning: "bg-amber/12 text-amber",
  danger: "bg-brick/10 text-brick",
  neutral: "bg-ink/6 text-graphite",
};

/**
 * A subscription as the team sees it, with Pause, Resume and Revoke. Pausing and revoking need a
 * remark, which the subscriber is shown. `readOnlyNote` is for an organization's plan seen from
 * one member's page: it covers the whole team, so it's changed on the organization's page.
 */
export function SubscriptionAdminCard({
  sub,
  title,
  canManage,
  onChanged,
  readOnlyNote,
  compact = false,
}: {
  sub: SubscriptionView;
  title?: string;
  canManage: boolean;
  onChanged?: () => void;
  readOnlyNote?: { text: string; href: string; label: string };
  /** Just the buttons and the remark form, for a row that already shows the details. */
  compact?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [mode, setMode] = useState<Mode | null>(null);
  const [remark, setRemark] = useState("");
  const [until, setUntil] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const live = (LIVE_STATES as readonly string[]).includes(sub.state);
  const label = STATE_LABELS[sub.state];

  const open = (m: Mode) => {
    setMode(m);
    setRemark("");
    setUntil("");
    setMessage(null);
  };
  const needsRemark = mode === "pause" || mode === "revoke";
  const tooShort = needsRemark && remark.trim().length < 10;

  const submit = () =>
    start(async () => {
      const r =
        mode === "pause"
          ? await pauseSubscriptionAction(sub.referenceId, remark, until)
          : mode === "revoke"
            ? await revokeSubscriptionAction(sub.referenceId, remark)
            : await resumeSubscriptionAction(sub.referenceId, remark);
      setMessage({ ok: r.ok, text: r.ok ? (r.message ?? "Done.") : r.message });
      if (r.ok) {
        setMode(null);
        if (onChanged) onChanged();
        else router.refresh();
      }
    });

  return (
    <div className={compact ? "text-[0.8125rem]" : "rounded-[3px] border border-line-light p-3.5 text-[0.8125rem]"}>
      {!compact && (
      <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {title && <p className="text-[0.75rem] text-stone-deep">{title}</p>}
          <p className="text-[0.9375rem] font-semibold">
            {sub.plan.name}
            <span className="font-normal text-stone-deep">
              {" "}
              · {sub.price === 0 ? "complimentary" : `${inr(sub.price)} ${CYCLE_LABELS[sub.billingCycle].per}`}
            </span>
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[0.75rem] font-medium ${TONE[label.tone]}`}>{label.label}</span>
      </div>

      <p className="mt-1.5 text-graphite">
        {sub.state === "trialing" && sub.trialEndsAt && `Free trial until ${formatDay(sub.trialEndsAt)}.`}
        {sub.state === "pending_payment" && "Chosen, waiting for the first payment."}
        {(sub.state === "active" || sub.state === "past_due") && sub.currentPeriodEnd && `${sub.cancelAtPeriodEnd ? "Ends" : "Paid until"} ${formatDay(sub.currentPeriodEnd)}.`}
        {sub.state === "paused" && sub.pausedAt && `Paused since ${formatDay(sub.pausedAt)}${sub.pauseUntil ? `, resumes ${formatDay(sub.pauseUntil)}` : ", until resumed"}.`}
        {(sub.state === "cancelled" || sub.state === "expired" || sub.state === "revoked") && "Not running."}{" "}
        <span className="font-mono text-stone-deep">{sub.referenceId}</span>
      </p>
      {sub.statusReason && (sub.state === "paused" || sub.state === "revoked") && (
        <p className="mt-1.5 rounded-[2px] bg-paper px-2.5 py-1.5 text-graphite">
          <span className="text-stone-deep">Remark:</span> “{sub.statusReason}”
        </p>
      )}
      </>
      )}

      {readOnlyNote ? (
        <p className="mt-2 text-stone-deep">
          {readOnlyNote.text}{" "}
          <Link href={readOnlyNote.href} className="underline">
            {readOnlyNote.label}
          </Link>
        </p>
      ) : (
        canManage &&
        live && (
          <div className={`flex flex-wrap gap-2 ${compact ? "lg:justify-end" : "mt-3"}`}>
            {sub.state === "paused" ? (
              <button type="button" className="wbtn wbtn-primary wbtn-sm" onClick={() => open("resume")} disabled={pending}>
                Resume
              </button>
            ) : (
              <button type="button" className="wbtn wbtn-secondary wbtn-sm" onClick={() => open("pause")} disabled={pending}>
                Pause
              </button>
            )}
            <button type="button" className="wbtn wbtn-danger wbtn-sm" onClick={() => open("revoke")} disabled={pending}>
              Revoke
            </button>
          </div>
        )
      )}

      {mode && (
        <div role="group" aria-label={mode === "pause" ? "Pause the subscription" : mode === "revoke" ? "Revoke the subscription" : "Resume the subscription"} className={`mt-3 rounded-[3px] bg-paper p-3 ${compact ? "w-72 max-w-full text-left" : ""}`}>
          <p className="font-medium text-ink">
            {mode === "pause" ? `Pause ${sub.plan.name}?` : mode === "revoke" ? `Revoke ${sub.plan.name}?` : `Resume ${sub.plan.name}?`}
          </p>
          <p className="mt-0.5 text-stone-deep">
            {mode === "pause"
              ? "The plan's features stop until it's resumed. The time it's paused is added back to their trial or paid period."
              : mode === "revoke"
                ? "It ends now and they're back on Free. This can't be undone; they can choose a plan again later."
                : "It starts working again, with the time it was paused added back."}
          </p>
          <label htmlFor={`${id}-remark`} className="mt-3 mb-1 block font-medium text-ink">
            Remark {needsRemark ? <span className="text-brick">*</span> : <span className="font-normal text-stone-deep">(optional)</span>}
          </label>
          <textarea
            id={`${id}-remark`}
            className="winput"
            rows={3}
            maxLength={500}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder={mode === "resume" ? "e.g. Payment dispute resolved" : "Why? They'll see this."}
            aria-describedby={`${id}-hint`}
          />
          <p id={`${id}-hint`} className="mt-1 text-[0.75rem] text-stone-deep">
            {needsRemark ? `At least 10 characters. The subscriber sees it, and it's kept in the history.` : "Kept in the history."}
          </p>
          {mode === "pause" && (
            <div className="mt-3">
              <label htmlFor={`${id}-until`} className="mb-1 block font-medium text-ink">
                Pause until <span className="font-normal text-stone-deep">(optional)</span>
              </label>
              <input id={`${id}-until`} type="date" className="winput max-w-48" value={until} onChange={(e) => setUntil(e.target.value)} />
              <p className="mt-1 text-[0.75rem] text-stone-deep">It resumes by itself that day. Leave blank to resume it by hand.</p>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" className={`wbtn wbtn-sm ${mode === "revoke" ? "wbtn-danger" : "wbtn-primary"}`} onClick={submit} disabled={pending || tooShort} aria-busy={pending}>
              {pending ? "Working…" : mode === "pause" ? "Pause" : mode === "revoke" ? "Revoke" : "Resume"}
            </button>
            <button type="button" className="wbtn wbtn-secondary wbtn-sm" onClick={() => setMode(null)} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-2 ${message.ok ? "text-sage-deep" : "text-brick"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
