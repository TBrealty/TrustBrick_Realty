import Link from "next/link";
import { earlierGuestAction, pollGuestAction, sendGuestMessageAction } from "@/app/account/(home-stay)/messages/actions";
import { StatusBadge } from "@/components/workspace/ui";
import { formatDay } from "@/lib/format";
import type { ConversationView } from "@/lib/services/stays/messages";
import { BOOKING_STATUS_TONES } from "@/lib/stays/labels";
import { ChatThread } from "./ChatThread";

const SUGGESTIONS = ["Is parking available?", "Can we check in early?", "Is it suitable for children?", "How far is the nearest beach or market?"];

/** A guest's conversation with a host: the chat, and beside it the stay and their bookings there. */
export function GuestConversation({ conversation: c }: { conversation: ConversationView }) {
  const host = c.counterpart.name;
  return (
    <div>
      <Link href="/account/messages" className="text-[0.875rem] text-stone-deep hover:text-ink">
        ← All messages
      </Link>
      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-8">
        <section
          aria-labelledby="conversation-title"
          className="flex h-[calc(100svh-var(--sticky-top,var(--header-h))-7rem)] min-h-[26rem] flex-col overflow-hidden rounded-[6px] border border-line-light bg-paper lg:max-h-[52rem]"
        >
          <header className="flex items-center gap-3 border-b border-line-light bg-card px-4 py-3 sm:px-5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-ink font-medium text-paper">
              {host.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 id="conversation-title" className="flex flex-wrap items-center gap-x-2 text-[1rem] font-medium">
                {host}
                <span className="text-[0.8125rem] font-normal text-stone-deep">Host</span>
                {c.counterpart.verified && <span className="rounded-full bg-sage/15 px-2 py-0.5 text-[0.6875rem] font-medium text-sage-deep">✓ Identity checked</span>}
              </h1>
              <p className="truncate text-[0.8125rem] text-stone-deep">
                <Link href={`/listings/${c.listing.referenceId}`} className="hover:text-ink hover:underline">
                  {c.listing.title}
                </Link>
                {c.listing.place ? ` · ${c.listing.place}` : ""}
              </p>
            </div>
          </header>
          <ChatThread
            referenceId={c.referenceId}
            listingReferenceId={c.listing.referenceId}
            counterpartName={host}
            initialMessages={c.messages}
            initialHasEarlier={c.hasEarlier}
            initialSeenUpTo={c.seenUpTo}
            canSend={c.canSend}
            closedReason={c.closedReason}
            basePath="/account/messages"
            send={sendGuestMessageAction}
            poll={pollGuestAction}
            earlier={earlierGuestAction}
            emptyTitle={`Ask ${host} anything`}
            emptyHint="Questions about the home, the area or your dates, before you book. The conversation is saved here, so it's waiting for you next time too."
            suggestions={SUGGESTIONS}
            safetyNote="Never share passwords, OTPs or card details."
          />
        </section>

        <aside className="space-y-5" aria-label="About this stay">
          <Link href={`/listings/${c.listing.referenceId}`} className="group block overflow-hidden rounded-[6px] border border-line-light bg-card">
            <span className="block aspect-[16/10] bg-sand">
              {c.listing.image && (
                // eslint-disable-next-line @next/next/no-img-element -- already resized
                <img src={c.listing.image} alt="" className="size-full object-cover" />
              )}
            </span>
            <span className="block p-4">
              <span className="block font-medium group-hover:underline">{c.listing.title}</span>
              {c.listing.place && <span className="mt-0.5 block text-[0.8125rem] text-stone-deep">{c.listing.place}</span>}
              <span className="mt-3 inline-block text-[0.8125rem] font-medium">View the stay →</span>
            </span>
          </Link>

          <div className="rounded-[6px] border border-line-light bg-card p-4">
            <h2 className="text-[0.9375rem] font-medium">Your bookings here</h2>
            {c.bookings.length === 0 ? (
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-stone-deep">None yet. When you&apos;re ready, choose your dates on the stay&apos;s page.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {c.bookings.map((b) => (
                  <li key={b.referenceId}>
                    <Link href={`/account/trips/${b.referenceId}`} className="flex items-start justify-between gap-3 text-[0.8125rem] hover:underline">
                      <span>
                        {formatDay(b.checkIn)} – {formatDay(b.checkOut)}
                        <span className="block font-mono text-[0.75rem] text-stone-deep">{b.referenceId}</span>
                      </span>
                      <StatusBadge tone={BOOKING_STATUS_TONES[b.status]}>{b.statusLabel}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-[6px] border border-line-light bg-paper p-4 text-[0.8125rem] leading-relaxed text-graphite">
            <h2 className="font-medium text-ink">Staying safe</h2>
            <p className="mt-1.5">
              Keep the conversation on Trustbrick so there&apos;s a record. The exact address is shared once your booking is confirmed, and you pay the host at the property,
              never in advance by link. If there&apos;s a dispute, the Trustbrick team may read this conversation to help resolve it.
            </p>
            <Link href="/contact?topic=problem" className="mt-2 inline-block underline">
              Something wrong? Tell us
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
