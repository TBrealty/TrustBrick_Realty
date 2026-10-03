"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/errors";
import type { ChatMessage, PollResult } from "@/lib/services/stays/messages";
import { MESSAGE_MAX_LENGTH } from "@/lib/vocab";
import { MESSAGES_READ_EVENT } from "./events";

type Sent = ActionResult<{ referenceId: string; message: ChatMessage }>;
type Item = ChatMessage & { key: string; pending?: boolean };

type Props = {
  /** Null for a conversation that doesn't exist yet: the first message creates it. */
  referenceId: string | null;
  listingReferenceId: string;
  counterpartName: string;
  initialMessages: ChatMessage[];
  initialHasEarlier: boolean;
  initialSeenUpTo: number;
  canSend: boolean;
  closedReason: string | null;
  /** Where conversations live, so the address can follow once the first message creates one. */
  basePath: string;
  send: (target: { conversation?: string; listing?: string }, body: string) => Promise<Sent>;
  poll: (referenceId: string, afterSeq: number) => Promise<PollResult | null>;
  earlier: (referenceId: string, beforeSeq: number) => Promise<{ messages: ChatMessage[]; hasEarlier: boolean } | null>;
  emptyTitle: string;
  emptyHint: string;
  suggestions?: string[];
  safetyNote: string;
};

const POLL_MS = 4000;
const TZ = "Asia/Kolkata";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLong = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeShort = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

function dayLabel(iso: string, now: number) {
  const key = dayKey.format(new Date(iso));
  if (key === dayKey.format(new Date(now))) return "Today";
  if (key === dayKey.format(new Date(now - 86_400_000))) return "Yesterday";
  return dayLong.format(new Date(iso));
}

const merge = (items: Item[], incoming: ChatMessage[]): Item[] => {
  const known = new Set(items.filter((i) => !i.pending).map((i) => i.seq));
  const fresh = incoming.filter((m) => !known.has(m.seq)).map((m) => ({ ...m, key: `m${m.seq}` }));
  if (fresh.length === 0) return items;
  const confirmed = [...items.filter((i) => !i.pending), ...fresh].sort((a, b) => a.seq - b.seq);
  return [...confirmed, ...items.filter((i) => i.pending)];
};

/**
 * A guest ↔ host conversation: the message log, live updates and the composer. The same
 * component serves both sides; the page passes in that side's server actions.
 *
 * Accessibility: the log is an ARIA live region, so new messages are announced; every message
 * says who sent it and when; the composer is a labelled textarea whose Enter behaviour is
 * explained next to it (on touch keyboards Enter makes a new line and the Send button sends).
 */
export function ChatThread(props: Props) {
  const { listingReferenceId, counterpartName, basePath, send, poll, earlier } = props;
  const [ref, setRef] = useState(props.referenceId);
  const [items, setItems] = useState<Item[]>(() => props.initialMessages.map((m) => ({ ...m, key: `m${m.seq}` })));
  const [hasEarlier, setHasEarlier] = useState(props.initialHasEarlier);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [seenUpTo, setSeenUpTo] = useState(props.initialSeenUpTo);
  const [open, setOpen] = useState({ canSend: props.canSend, reason: props.closedReason });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unseenBelow, setUnseenBelow] = useState(0);
  const [touch, setTouch] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const lastSeq = useRef(props.initialMessages.at(-1)?.seq ?? 0);
  const keepOffset = useRef<number | null>(null);
  const stickNext = useRef(true);
  const id = useId();
  const hintId = `${id}-hint`;
  const countId = `${id}-count`;

  // Opening the conversation marked it read on the server.
  useEffect(() => {
    window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
  }, []);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(coarse.matches);
    update();
    coarse.addEventListener("change", update);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      coarse.removeEventListener("change", update);
      clearInterval(tick);
    };
  }, []);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
    setUnseenBelow(0);
  }, []);

  // Keep the view where the reader expects it: pinned to the newest message, or steady while
  // earlier messages load above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
      return;
    }
    if (stickNext.current || atBottom.current) {
      el.scrollTop = el.scrollHeight;
      stickNext.current = false;
    }
  }, [items]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setUnseenBelow(0);
  };

  const accept = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    lastSeq.current = Math.max(lastSeq.current, ...incoming.map((m) => m.seq));
    const fromThem = incoming.filter((m) => !m.mine).length;
    if (fromThem > 0 && !atBottom.current) setUnseenBelow((n) => n + fromThem);
    setItems((current) => merge(current, incoming));
  }, []);

  // Live updates: poll while the tab is visible, and straight away when it becomes visible again.
  useEffect(() => {
    if (!ref) return;
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    async function tick() {
      if (stopped || busy || document.visibilityState !== "visible") return schedule();
      busy = true;
      try {
        const result = await poll(ref!, lastSeq.current);
        if (result && !stopped) {
          accept(result.messages);
          if (result.messages.some((m) => !m.mine)) window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
          setSeenUpTo((s) => Math.max(s, result.seenUpTo));
          setOpen({ canSend: result.canSend, reason: result.closedReason });
        }
      } catch {
        // A dropped poll is retried on the next tick.
      } finally {
        busy = false;
      }
      schedule();
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ref, poll, accept]);

  const resize = () => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  useLayoutEffect(resize, [draft]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending || !open.canSend) return;
    if (body.length > MESSAGE_MAX_LENGTH) {
      setError(`Keep it under ${MESSAGE_MAX_LENGTH.toLocaleString("en-IN")} characters.`);
      return;
    }
    const key = `pending-${Date.now()}`;
    stickNext.current = true;
    setItems((current) => [...current, { key, seq: Number.MAX_SAFE_INTEGER, body, mine: true, senderName: "You", createdAt: new Date().toISOString(), pending: true }]);
    setDraft("");
    setError(null);
    setSending(true);
    let result: Sent | null = null;
    try {
      result = await send(ref ? { conversation: ref } : { listing: listingReferenceId }, body);
    } catch {
      result = null;
    }
    if (result?.ok && result.data) {
      const { message, referenceId } = result.data;
      lastSeq.current = Math.max(lastSeq.current, message.seq);
      stickNext.current = true;
      setItems((current) => merge(current.filter((i) => i.key !== key), [message]));
      if (!ref) {
        setRef(referenceId);
        // The conversation now exists: give it its own address without reloading the page.
        window.history.replaceState(null, "", `${basePath}/${referenceId}`);
      }
    } else {
      setItems((current) => current.filter((i) => i.key !== key));
      setDraft((d) => (d ? d : body));
      setError(
        result && !result.ok
          ? result.code === "UNAUTHORIZED"
            ? "You've been signed out. Sign in again to send this message."
            : result.fieldErrors?.body ?? result.message
          : "Your message wasn't sent. Check your connection and try again.",
      );
    }
    setSending(false);
    input.current?.focus();
  }

  async function loadEarlier() {
    const first = items.find((i) => !i.pending);
    if (!ref || !first || loadingEarlier) return;
    setLoadingEarlier(true);
    const result = await earlier(ref, first.seq).catch(() => null);
    if (result) {
      const el = scroller.current;
      keepOffset.current = el ? el.scrollHeight - el.scrollTop : null;
      setItems((current) => merge(current, result.messages));
      setHasEarlier(result.hasEarlier);
    }
    setLoadingEarlier(false);
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !touch) {
      e.preventDefault();
      void submit();
    }
  };

  const lastMine = [...items].reverse().find((i) => i.mine && !i.pending);
  const remaining = MESSAGE_MAX_LENGTH - draft.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
        {hasEarlier && (
          <div className="mb-5 text-center">
            <button type="button" onClick={loadEarlier} disabled={loadingEarlier} className="rounded-full border border-line-light bg-card px-4 py-1.5 text-[0.8125rem] text-graphite hover:border-ink/40 disabled:opacity-60">
              {loadingEarlier ? "Loading…" : "Show earlier messages"}
            </button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="mx-auto flex h-full max-w-[34ch] flex-col items-center justify-center py-8 text-center">
            <span aria-hidden className="grid size-12 place-items-center rounded-full bg-sand text-ink">
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M3.5 4.5h13v9.5H9.5l-4 3v-3h-2z" />
              </svg>
            </span>
            <p className="mt-4 font-medium">{props.emptyTitle}</p>
            <p className="mt-1.5 text-[0.875rem] leading-relaxed text-stone-deep">{props.emptyHint}</p>
          </div>
        ) : null}

        <div role="log" aria-live="polite" aria-relevant="additions" aria-label={`Messages with ${counterpartName}`}>
        <ol className="space-y-1.5">
          {items.map((m, index) => {
            const day = dayLabel(m.createdAt, now);
            const prev = items[index - 1];
            const showDay = !prev || dayLabel(prev.createdAt, now) !== day;
            const grouped = !showDay && prev && prev.mine === m.mine && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
            const who = m.mine ? "You" : m.senderName;
            return (
              <li key={m.key} className={showDay ? "pt-3" : grouped ? "" : "pt-2.5"}>
                {showDay && (
                  <p className="mb-4 flex items-center gap-3 text-[0.75rem] text-stone-deep" suppressHydrationWarning>
                    <span aria-hidden className="h-px flex-1 bg-line-light" />
                    {day}
                    <span aria-hidden className="h-px flex-1 bg-line-light" />
                  </p>
                )}
                <div className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                  {!grouped && !m.mine && <p className="mb-1 px-1 text-[0.75rem] font-medium text-graphite">{m.senderName}</p>}
                  <div
                    className={`max-w-[min(85%,34rem)] rounded-2xl px-3.5 py-2.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap ${
                      m.mine ? "rounded-br-md bg-ink text-paper" : "rounded-bl-md border border-line-light bg-card text-ink"
                    } ${m.pending ? "opacity-70" : ""}`}
                  >
                    <span className="sr-only">{who}: </span>
                    {m.body}
                  </div>
                  <p className="mt-1 px-1 text-[0.6875rem] text-stone-deep">
                    {m.pending ? (
                      "Sending…"
                    ) : (
                      <>
                        <time dateTime={m.createdAt} suppressHydrationWarning>
                          {timeShort.format(new Date(m.createdAt))}
                        </time>
                        {m.key === lastMine?.key && <span> · {seenUpTo >= m.seq ? `Seen by ${counterpartName}` : "Sent"}</span>}
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        </div>
      </div>

      {unseenBelow > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[0.8125rem] text-paper shadow-lg"
          >
            {unseenBelow === 1 ? "1 new message" : `${unseenBelow} new messages`} ↓
          </button>
        </div>
      )}

      <div className="border-t border-line-light bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        {open.canSend ? (
          <>
            {items.length === 0 && props.suggestions && props.suggestions.length > 0 && !draft && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Suggested questions">
                {props.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setDraft(s);
                      input.current?.focus();
                    }}
                    className="shrink-0 rounded-full border border-line-light px-3.5 py-1.5 text-[0.8125rem] text-graphite hover:border-ink/40 hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="mb-2.5 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.8125rem] text-brick">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor={`${id}-body`} className="sr-only">
                Message {counterpartName}
              </label>
              <textarea
                id={`${id}-body`}
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={MESSAGE_MAX_LENGTH}
                placeholder={`Message ${counterpartName}`}
                aria-describedby={`${hintId}${remaining < 200 ? ` ${countId}` : ""}`}
                aria-invalid={error ? true : undefined}
                className="block max-h-40 min-h-11 w-full min-w-0 flex-1 resize-none rounded-[22px] border border-line-light bg-ivory px-4 py-2.5 text-[0.9375rem] leading-relaxed text-ink placeholder:text-stone focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_28%,transparent)]"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-busy={sending}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-[0.875rem] font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 sm:px-5"
              >
                <svg viewBox="0 0 20 20" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 10 16.5 3.5 12 16.5l-2.5-5z" />
                </svg>
                <span>Send</span>
              </button>
            </form>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[0.6875rem] text-stone-deep">
              <p id={hintId}>{touch ? props.safetyNote : `Enter to send, Shift + Enter for a new line. ${props.safetyNote}`}</p>
              {remaining < 200 && (
                <p id={countId} aria-live="polite" className={remaining < 0 ? "text-brick" : ""}>
                  {remaining} characters left
                </p>
              )}
            </div>
          </>
        ) : (
          <p role="status" className="px-1 py-2 text-[0.875rem] text-graphite">
            {open.reason}
          </p>
        )}
      </div>
    </div>
  );
}
