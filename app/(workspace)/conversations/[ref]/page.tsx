import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit, TextArea } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, StatusBadge } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDateTime, formatDay } from "@/lib/format";
import { ADMIN_ACCESS_HOURS, adminAccessUntil, getConversationForAdmin, listConversationsForAdmin } from "@/lib/services/stays/messages";
import { BOOKING_STATUS_TONES } from "@/lib/stays/labels";
import { openForReviewAction } from "../actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Conversation ${(await params).ref}` };
}

const orNotFound = (e: unknown): never => {
  if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
  throw e;
};

export default async function ConversationReviewPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("conversations.view", `/conversations/${ref}`, "platform");
  const until = await adminAccessUntil(actor, ref).catch(orNotFound);

  if (!until) {
    // Before reading: who and which stay only, and the reason form.
    const summary = (await listConversationsForAdmin(actor, { q: ref }, 1)).rows.find((r) => r.referenceId === ref);
    if (!summary) notFound();
    return (
      <>
        <PageHeader eyebrow={<BackLink href="/conversations">Conversations</BackLink>} title="Read a private conversation" meta={<ReferenceId value={ref} />} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card title="Why do you need to read it?" description="Conversations between guests and hosts are private. Reading one is for resolving a dispute or a safety concern.">
            <ActionForm action={openForReviewAction} className="space-y-4">
              <input type="hidden" name="ref" value={ref} />
              <TextArea
                label="Reason"
                name="reason"
                required
                rows={3}
                maxLength={500}
                placeholder="For example: guest disputes the cancellation on BKG-…, checking what the host agreed."
                hint={`Recorded in the audit log with your name, and shown to other admins who open this conversation. You can read it for the next ${ADMIN_ACCESS_HOURS} hours.`}
              />
              <Submit>Read the conversation</Submit>
            </ActionForm>
          </Card>
          <Card title="Conversation">
            <DescriptionList
              columns={1}
              items={[
                ["Guest", `${summary.guest.name} (${summary.guest.referenceId})`],
                ["Host", `${summary.host.name} (${summary.host.referenceId})`],
                ["Stay", summary.listing.title],
                ["Messages", String(summary.messageCount)],
                ["Bookings between them", String(summary.bookings)],
              ]}
            />
          </Card>
        </div>
      </>
    );
  }

  const c = await getConversationForAdmin(actor, ref).catch(orNotFound);
  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/conversations">Conversations</BackLink>}
        title={`${c.guest.name} and ${c.host.name}`}
        meta={
          <>
            <ReferenceId value={c.referenceId} />
            <span>{c.listing.title}</span>
            <StatusBadge tone="neutral">Read-only</StatusBadge>
          </>
        }
      />
      <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem]">
        Your access is recorded in the audit log and lasts until {formatDateTime(c.grantedUntil)}. Reading doesn&apos;t change what the guest or host see as read.
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title={`Messages (${c.messages.length})`} padded={false}>
          {c.messages.length === 0 ? (
            <p className="p-5 text-[0.875rem] text-stone-deep">No messages yet.</p>
          ) : (
            <ol className="divide-y divide-line-light" aria-label="Messages, oldest first">
              {c.messages.map((m) => (
                <li key={m.seq} className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-5">
                  <div className="text-[0.8125rem]">
                    <p className="font-medium">
                      {m.senderName}{" "}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-[0.6875rem] ${m.senderRole === "host" ? "bg-ink text-paper" : "bg-ink/6 text-ink"}`}>
                        {m.senderRole === "host" ? "Host" : "Guest"}
                      </span>
                    </p>
                    <p className="mt-1 text-stone-deep">
                      <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
                    </p>
                  </div>
                  <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="People">
            <DescriptionList
              columns={1}
              items={[
                [
                  "Guest",
                  <span key="g">
                    {c.guest.name} · {c.guest.email}{" "}
                    <ReferenceId value={c.guest.referenceId} href={`/users/${c.guest.referenceId}`} copy={false} />
                  </span>,
                ],
                [
                  "Host",
                  <span key="h">
                    {c.host.name} · {c.host.email}{" "}
                    <ReferenceId value={c.host.hostReferenceId ?? c.host.referenceId} href={c.host.hostReferenceId ? `/hosts/${c.host.hostReferenceId}` : `/users/${c.host.referenceId}`} copy={false} />
                  </span>,
                ],
                [
                  "Stay",
                  <Link key="l" href={`/properties/${c.listing.referenceId}`} className="underline">
                    {c.listing.title}
                  </Link>,
                ],
              ]}
            />
          </Card>
          <Card title="Bookings between them">
            {c.bookings.length === 0 ? (
              <p className="text-[0.8125rem] text-stone-deep">None.</p>
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
          <Card title="Who has read this" description="Every admin access, with the reason given.">
            <ul className="space-y-3 text-[0.8125rem]">
              {c.access.map((a, i) => (
                <li key={i}>
                  <p>
                    <span className="font-medium">{a.actorName}</span> <span className="text-stone-deep">· {formatDateTime(a.at)}</span>
                  </p>
                  <p className="text-graphite">“{a.reason}”</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
