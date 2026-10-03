import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatThread } from "@/components/messages/ChatThread";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, StatusBadge } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { getHostConversation } from "@/lib/services/stays/messages";
import { BOOKING_STATUS_TONES } from "@/lib/stays/labels";
import { earlierHostAction, pollHostAction, sendHostMessageAction } from "../actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Messages · ${(await params).ref}` };
}

export default async function HostConversationPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("bookings.view", `/messages/${ref}`);
  const c = await getHostConversation(actor, ref).catch((e) => {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  });
  const guest = c.counterpart;

  return (
    <>
      <div className="mb-4">
        <BackLink href="/messages">Messages</BackLink>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="conversation-title"
          className="flex h-[calc(100svh-12rem)] min-h-[26rem] flex-col overflow-hidden rounded-[6px] border border-line-light bg-paper lg:max-h-[52rem]"
        >
          <header className="flex items-center gap-3 border-b border-line-light bg-card px-4 py-3 sm:px-5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-ink font-medium text-paper">
              {guest.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 id="conversation-title" className="flex flex-wrap items-center gap-x-2 text-[1rem] font-medium">
                {guest.fullName}
                <span className="text-[0.8125rem] font-normal text-stone-deep">Guest</span>
              </h1>
              <p className="truncate text-[0.8125rem] text-stone-deep">
                <Link href={`/properties/${c.listing.referenceId}`} className="hover:text-ink hover:underline">
                  {c.listing.title}
                </Link>
                {c.listing.place ? ` · ${c.listing.place}` : ""}
              </p>
            </div>
          </header>
          <ChatThread
            referenceId={c.referenceId}
            listingReferenceId={c.listing.referenceId}
            counterpartName={guest.name}
            initialMessages={c.messages}
            initialHasEarlier={c.hasEarlier}
            initialSeenUpTo={c.seenUpTo}
            canSend={c.canSend}
            closedReason={c.closedReason}
            basePath="/messages"
            send={sendHostMessageAction}
            poll={pollHostAction}
            earlier={earlierHostAction}
            emptyTitle="No messages yet"
            emptyHint={`Say hello to ${guest.name}: arrival plans, directions, or anything they should know before they come.`}
            safetyNote="Never ask a guest to pay outside the booking."
          />
        </section>

        <div className="space-y-6">
          <Card title="Guest">
            <p className="text-[0.875rem] font-medium">{guest.fullName}</p>
            {guest.referenceId && (
              <p className="mt-1">
                <ReferenceId value={guest.referenceId} copy={false} />
              </p>
            )}
            <p className="mt-3 text-[0.8125rem] text-stone-deep">Their phone number and email are shared with you once you confirm a booking.</p>
          </Card>
          <Card title="Their bookings for this stay">
            {c.bookings.length === 0 ? (
              <p className="text-[0.8125rem] text-stone-deep">No bookings yet. A request appears in Bookings when they choose dates.</p>
            ) : (
              <ul className="space-y-3">
                {c.bookings.map((b) => (
                  <li key={b.referenceId}>
                    <Link href={`/bookings/${b.referenceId}`} className="flex items-start justify-between gap-3 text-[0.8125rem] hover:underline">
                      <span>
                        {formatDay(b.checkIn)} – {formatDay(b.checkOut)}
                        <span className="block">
                          <ReferenceId value={b.referenceId} copy={false} />
                        </span>
                      </span>
                      <StatusBadge tone={BOOKING_STATUS_TONES[b.status]}>{b.statusLabel}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Conversation">
            {c.referenceId && <ReferenceId value={c.referenceId} />}
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-stone-deep">
              Messages can&apos;t be edited or deleted, so this is a reliable record for you and the guest. If there&apos;s a dispute, the Trustbrick team may read
              this conversation to help resolve it.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
