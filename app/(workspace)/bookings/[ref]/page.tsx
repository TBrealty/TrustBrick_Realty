import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmAction, Submit } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, StatusBadge, Timeline } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDateTime, formatDay, formatPrice } from "@/lib/format";
import { bookingCommission } from "@/lib/services/commission";
import { getBookingForActor } from "@/lib/services/stays/bookings";
import { conversationForBooking } from "@/lib/services/stays/messages";
import { BOOKING_ACTIONS, type BookingActionDef } from "@/lib/stays/booking-lifecycle";
import { BOOKING_STATUS_TONES, nightsLabel, timeLabel } from "@/lib/stays/labels";
import { messageGuestAction } from "../../messages/actions";
import { bookingTransitionAction } from "../actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

const money = (v: number) => formatPrice(v, { compact: false });
const ACTOR_LABEL: Record<string, string> = { guest: "Guest", host: "Host", admin: "Trustbrick", system: "Automatic" };

export default async function BookingPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("bookings.view", `/bookings/${ref}`);
  const b = await getBookingForActor(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  // Hosts talk to their guests in Messages; admins may read the conversation, with a logged reason, for a dispute.
  const canReview = actor.workspace === "platform" && can(actor, "conversations.view", "platform");
  const conversationRef = actor.workspace === "professional" || canReview ? await conversationForBooking(b.referenceId) : null;
  const canMessage = actor.workspace === "professional" && can(actor, "bookings.manage");
  const commission = await bookingCommission(actor, b.referenceId);
  const host = actor.workspace === "professional";
  const groups = new Map<number, number>();
  for (const n of b.nightly) groups.set(n.price, (groups.get(n.price) ?? 0) + 1);

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/bookings">Bookings</BackLink>}
        title={`${b.guestName} · ${formatDay(b.checkIn)} – ${formatDay(b.checkOut)}`}
        meta={
          <>
            <ReferenceId value={b.referenceId} />
            <StatusBadge tone={BOOKING_STATUS_TONES[b.status]}>{b.statusLabel}</StatusBadge>
            <span>{nightsLabel(b.nights)}</span>
          </>
        }
        actions={[
          conversationRef ? (
            <Link key="messages" href={`${canReview ? "/conversations" : "/messages"}/${conversationRef}`} className="wbtn wbtn-secondary">
              {canReview ? "Review conversation" : "Open conversation"}
            </Link>
          ) : canMessage ? (
            <ActionForm key="messages" action={messageGuestAction}>
              <input type="hidden" name="booking" value={b.referenceId} />
              <Submit variant="secondary">Message guest</Submit>
            </ActionForm>
          ) : null,
          ...b.actions.map((a) => {
          const def: BookingActionDef = BOOKING_ACTIONS[a];
          return (
            <ConfirmAction
              key={a}
              label={def.label}
              title={`${def.label}?`}
              description={def.confirm ?? (a === "accept" ? "The guest is confirmed and sees your address and phone number. Other requests for these dates are declined." : undefined)}
              action={bookingTransitionAction}
              hidden={{ ref: b.referenceId, action: a }}
              variant={a === "accept" ? "primary" : a === "decline" || a.endsWith("cancel") ? "danger" : "secondary"}
              reason={def.reason ? { required: def.reason === "required", label: def.reason === "required" ? "Reason (the guest sees this)" : "Note for the guest (optional)" } : undefined}
            />
          );
          }),
        ]}
      />

      {b.status === "requested" && b.expiresAt && (
        <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem]">
          Answer by <strong className="font-medium">{formatDateTime(b.expiresAt)}</strong> or the request expires. Accepting confirms the guest and shares your address and phone number with them.
        </p>
      )}
      {b.statusReason && ["declined", "cancelled", "expired"].includes(b.status) && (
        <p className="mb-5 rounded-[3px] border-l-2 border-line-light bg-paper px-3.5 py-2.5 text-[0.8125rem]">
          {b.cancelledBy ? `Cancelled by the ${b.cancelledBy === "admin" ? "Trustbrick team" : b.cancelledBy}: ` : ""}
          {b.statusReason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card title="Stay">
            <DescriptionList
              columns={3}
              items={[
                ["Check-in", `${formatDay(b.checkIn)}, from ${timeLabel(b.checkInTime)}`],
                ["Check-out", `${formatDay(b.checkOut)}, by ${timeLabel(b.checkOutTime)}`],
                ["Guests", `${b.adults} adult${b.adults === 1 ? "" : "s"}${b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}${b.pets ? ", a pet" : ""}`],
                [
                  "Home",
                  <Link key="l" href={`/properties/${b.listing.referenceId}`} className="underline">
                    {b.listing.title}
                  </Link>,
                ],
                ["Where", [b.listing.locality, b.listing.city].filter(Boolean).join(", ")],
                ["Cancellation policy", `${b.cancellationPolicy.label}: ${b.cancellationPolicy.rule}`],
              ]}
            />
            {b.guestMessage && (
              <blockquote className="mt-5 border-l-2 border-line-light pl-4 text-[0.875rem] text-graphite">
                &ldquo;{b.guestMessage}&rdquo;
                <footer className="mt-1 text-[0.75rem] text-stone-deep">— {b.guestName}</footer>
              </blockquote>
            )}
          </Card>
          <Card title="Price">
            <dl className="max-w-md space-y-1.5 text-[0.875rem]">
              {[...groups.entries()].map(([price, count]) => (
                <div key={price} className="flex justify-between gap-3">
                  <dt className="text-graphite">
                    {money(price)} × {nightsLabel(count)}
                  </dt>
                  <dd className="tabular-nums">{money(price * count)}</dd>
                </div>
              ))}
              {b.cleaningFee > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-graphite">Cleaning fee</dt>
                  <dd className="tabular-nums">{money(b.cleaningFee)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-line-light pt-2 font-medium">
                <dt>Guest pays at the property</dt>
                <dd className="tabular-nums">{money(b.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[0.75rem] text-stone-deep">The price was fixed when the guest booked. Later changes to your prices don&apos;t affect it.</p>

            {commission && (
              <div className="mt-4 max-w-md border-t border-line-light pt-4 text-[0.875rem]">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-medium">Trustbrick&apos;s commission</h3>
                  {commission.state === "charged" && (
                    <StatusBadge tone={commission.overdue ? "danger" : commission.status === "paid" ? "success" : commission.status === "due" ? "warning" : "neutral"}>
                      {commission.overdue ? "Overdue" : commission.status === "paid" ? "Paid" : commission.status === "due" ? "Due" : "Waived"}
                    </StatusBadge>
                  )}
                </div>
                {commission.state === "none" || commission.state === "unrecorded" ? (
                  <p className="mt-1 text-[0.8125rem] text-stone-deep">
                    {commission.state === "none" ? "None: the stay didn't go ahead." : "None: this stay began before Trustbrick recorded commission on stays."}
                  </p>
                ) : (
                  <>
                    <dl className="mt-2 space-y-1.5">
                      <div className="flex justify-between gap-3">
                        <dt className="text-graphite">
                          {commission.percent}% of {money(b.total)}
                        </dt>
                        <dd className="tabular-nums">{money(commission.amount)}</dd>
                      </div>
                      {commission.gst > 0 && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-graphite">GST</dt>
                          <dd className="tabular-nums">{money(commission.gst)}</dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-3 border-t border-line-light pt-2 font-medium">
                        <dt>{commission.state === "charged" ? "Commission charged" : "Commission, about"}</dt>
                        <dd className="tabular-nums">{money(commission.total)}</dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-[0.75rem] text-stone-deep">
                      {commission.state === "charged" ? (
                        <>
                          Charged when the guest checked in, as <ReferenceId value={commission.referenceId} copy={false} />
                          {commission.status === "paid" && commission.paymentReference ? `; paid (ref ${commission.paymentReference})` : ""}.{" "}
                        </>
                      ) : (
                        <>Charged when the guest checks in, at the rate in force then. </>
                      )}
                      {host ? "You keep the full payment from the guest; Trustbrick bills the commission to you separately." : "Billed to the host separately; the guest pays the host in full."}{" "}
                      <Link href={host ? "/commission" : "/commissions"} className="underline">
                        {host ? "Your commission" : "All charges"}
                      </Link>
                    </p>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Guest">
            <DescriptionList
              columns={1}
              items={[
                ["Name", b.guestName],
                ["Account", <ReferenceId key="u" value={b.guestReferenceId} copy={false} />],
                [
                  "Phone",
                  b.guestContact ? (
                    <a key="p" href={`tel:${b.guestContact.phone}`} className="underline">
                      {b.guestContact.phone}
                    </a>
                  ) : (
                    <span key="p" className="text-stone-deep">Shown once the booking is confirmed</span>
                  ),
                ],
                ["Email", b.guestContact?.email ?? <span key="e" className="text-stone-deep">Shown once the booking is confirmed</span>],
              ]}
            />
          </Card>
          <Card title="History">
            <Timeline
              items={b.events.map((e, i) => ({
                id: String(i),
                title: <strong className="font-medium">{e.label}</strong>,
                body: e.note ? `“${e.note}”` : undefined,
                at: e.at,
                actor: ACTOR_LABEL[e.actorRole] ?? e.actorRole,
              }))}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
