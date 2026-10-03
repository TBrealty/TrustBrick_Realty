import Link from "next/link";
import type { ConversationSummary } from "@/lib/services/stays/messages";

const TZ = "Asia/Kolkata";
const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const time = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" });

/** "4:05 pm" today, "12 Sept" before that. */
function when(iso: string) {
  const d = new Date(iso);
  return sameDay.format(d) === sameDay.format(new Date()) ? time.format(d) : date.format(d);
}

/** Conversations, newest first. Each row is one link, and its accessible name reads like a sentence. */
export function ConversationList({ conversations, hrefBase, activeRef }: { conversations: ConversationSummary[]; hrefBase: string; activeRef?: string }) {
  return (
    <ul className="divide-y divide-line-light">
      {conversations.map((c) => {
        const unread = c.unread > 0;
        const active = c.referenceId === activeRef;
        return (
          <li key={c.referenceId}>
            <Link
              href={`${hrefBase}/${c.referenceId}`}
              aria-current={active ? "page" : undefined}
              className={`group flex gap-3.5 px-4 py-4 transition-colors sm:px-5 ${active ? "bg-ink/[0.04]" : "hover:bg-ink/[0.025]"}`}
            >
              <span className="relative size-14 shrink-0 overflow-hidden rounded-[4px] bg-sand">
                {c.listing.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- small thumbnail, already resized
                  <img src={c.listing.image} alt="" className="size-full object-cover" loading="lazy" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`truncate text-[0.9375rem] ${unread ? "font-semibold text-ink" : "font-medium text-ink"}`}>{c.counterpartName}</span>
                  {c.last && (
                    <time dateTime={c.last.at} className={`shrink-0 text-[0.75rem] ${unread ? "font-medium text-ink" : "text-stone-deep"}`} suppressHydrationWarning>
                      {when(c.last.at)}
                    </time>
                  )}
                </span>
                <span className="block truncate text-[0.8125rem] text-stone-deep">{c.listing.title}</span>
                <span className="mt-1 flex items-center justify-between gap-3">
                  <span className={`truncate text-[0.875rem] ${unread ? "text-ink" : "text-graphite"}`}>
                    {c.last ? `${c.last.mine ? "You: " : ""}${c.last.body}` : "No messages yet"}
                  </span>
                  {unread && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brick px-1.5 text-[0.6875rem] font-semibold text-on-contrast tabular-nums">
                      {c.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
