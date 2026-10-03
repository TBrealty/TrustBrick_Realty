# Homestays

Airbnb-style stays on Trustbrick: people list a whole home or a private room by the night, guests
request or book, and the host is paid at the property. Built as part of the same platform: a stay
is an ordinary **listing** (`transaction_type = 'stay'`) of an ordinary **property**, so photos,
moderation, reference IDs, permissions, the audit log and the property card all apply unchanged.
What is new lives in the `stays` schema.

This covers phases 1 and 2 of the plan, plus host–guest messaging ([§5a](#5a-messages)). Online
payments, reviews and calendar sync are designed for but not built (see [What is not built](#9-what-is-not-built)).

## 1. Who does what

| Person | Can |
| --- | --- |
| **Guest** (any confirmed account) | Search `/stays` by dates and guests, request or instantly book, see trips at `/account/trips`, cancel before check-in |
| **Host** (approved at `/become-a-host`) | List homes as homestays only; set nightly, weekend and festival prices, cleaning fee, stay length, house rules and cancellation policy; close dates on the Calendar; accept or decline requests; check guests in |
| **Agent / broker** | Everything a host can, for stays in their scope, alongside their other listings |
| **Admin** | Approve and verify hosts (`hosts.*`), review stay listings in the normal queue, see all bookings, cancel one on Trustbrick's behalf (`bookings.manage`) |
| **SuperAdmin** | Sees everything, acts on nothing (as for the rest of the platform) |

Hosts get a `host` role in their own personal organization. The role carries `listings.*` and
`bookings.*` at `own` scope and **may only list stays**: roles declare the purposes they may list
(`ROLES[code].purposes`), and `createDraft` refuses anything else. Like agent roles, the host role is in
force only while the host profile is active, so suspending a host removes the workspace and pauses their
live stays.

## 2. Data model (`stays` schema)

| Table | Holds |
| --- | --- |
| `host_profiles` (`HST-`) | Phone, city, languages, about, relationship to the home, status, identity check |
| `stay_terms` (one per listing) | Entire home or private room, guests, beds, weekend price, cleaning fee, min/max nights, check-in/out times, instant book, cancellation policy, pets/smoking/events, house rules. The base nightly price is `listings.price`, so stays sort and filter like any listing |
| `stay_rates` | A different nightly price for some dates. Ranges never overlap (exclusion constraint) |
| `stay_blocks` | Dates the host closed. Ranges never overlap; adjacent blocks merge |
| `bookings` (`BKG-`) | Dates as `daterange [check-in, check-out)`, guests, the night-by-night price at booking time, totals, status, guest contact, policy and times snapshot |
| `booking_events` | Every status change, append-only |
| `conversations` (`MSG-`) | One per guest and stay (unique on listing + guest), kept for good; each side's last-read message |
| `messages` | The chat log: sender, role (`guest` / `host`), plain-text body up to 2,000 characters, and a global `seq`. Append-only |

**No double bookings.** `bookings_no_overlap` is `EXCLUDE USING gist (listing_id WITH =, dates WITH &&)`
for bookings that hold dates (`confirmed`, `checked_in`, `completed`). The service also locks the
listing's `stay_terms` row while it checks the host's closed dates, so a booking and a block can't race.
Half-open ranges mean one guest's check-out day is the next guest's check-in day.

**Price is always computed on the server**, night by night: a special rate if one covers the night, else
the weekend price on Friday and Saturday nights, else the base price; plus the cleaning fee. It is stored
on the booking (`nightly_breakdown`, `subtotal`, `total`), so later price changes never touch confirmed
stays. Trustbrick adds no fee and computes no tax yet (payment is at the property).

## 3. Becoming a host

`/become-a-host` (signed-in, confirmed accounts): phone, city, relationship to the home, languages, a
short intro, and a declaration that they're allowed to host (owner's and housing society's permission,
local registration, Form C for foreign guests). The application appears on **Hosts** in the admin
workspace with a badge. An admin with `hosts.verify` calls the host, checks a government ID (never stored
in Trustbrick), and approves with or without the **Identity checked** badge. Approval creates the personal
organization and `host` membership. Applications can be paused in Platform settings.

## 4. Bookings

```
requested ──accept──▶ confirmed ──check_in──▶ checked_in ──complete──▶ completed
    │  └──decline──▶ declined        │ └──no_show──▶ no_show
    └──(24 h)──▶ expired             └──cancel──▶ cancelled (by guest, host or admin)
```

- **Instant book** stays skip `requested`.
- A **request** expires after 24 hours, or at the end of the check-in day if sooner. Expiry is applied
  whenever bookings are read or written, so there is no scheduler.
- **Accepting** a request declines every other request overlapping it, and tells those guests.
- **Guests** may cancel requests and confirmed stays before check-in. **Hosts** must give a reason to cancel a
  confirmed stay. **Admins** can cancel any open booking for safety or policy reasons.
- **Check-in** and **no-show** are available from the check-in date; **complete** after check-in.
- Like listings, the client names an action (`BOOKING_ACTIONS` in `lib/stays/booking-lifecycle.ts`); the server
  checks who may take it, the current status and the date rule.
- Every step writes `booking_events`, an audit row (`BOOKING_*`), notifications, and emails, which go to
  `/dev/mailbox` in development.

**Privacy.** Stay pages show the locality, never the street. The exact address, map pin and host's phone
appear on the guest's trip page only once the booking is confirmed; the host sees the guest's phone and
email at the same point.

## 5. Pages

| URL | Who | What |
| --- | --- | --- |
| `/stays` | Everyone | Search with check-in/out, guests, place type, instant book, pets, price per night, city, amenities |
| `/listings/LST-…` | Everyone | For stays: the stay, house rules, cancellation, host card, and the booking panel (calendar with taken nights struck through, live price) |
| `/account/trips`, `/account/trips/BKG-…` | Guests | Trips, status, price, address once confirmed, cancel, message the host |
| `/account/messages`, `/account/messages/MSG-…` | Guests | Conversations with hosts; `/account/messages/new?listing=LST-…` opens the existing one or a new one |
| `/messages`, `/messages/MSG-…` | Hosts, agents with stays | Guests' conversations: read, reply, their bookings alongside |
| `/conversations`, `/conversations/MSG-…` | Admins with `conversations.view` | Dispute review: find a conversation, give a reason, read the transcript |
| `/become-a-host` | Signed-in customers | Apply to host |
| `/dashboard` | Hosts | Requests waiting, upcoming stays, nights booked, value this month, your stays |
| `/properties/new` | Hosts, agents | Hosts go straight to the type of home; agents choose "Homestay" as the purpose |
| `/properties/LST-…/edit?step=pricing` | Hosts, agents | "Price & house rules" |
| `/bookings`, `/bookings/BKG-…` | Hosts (own), admins (all) | Upcoming, requests, past, cancelled; accept, decline, cancel, check in |
| `/calendar` | Hosts, agents with stays | Month view; close dates; special prices |
| `/hosts`, `/hosts/HST-…` | Admins | Applications and hosts: approve, reject, identity check, suspend |

The property card (**View** in Properties & listings) shows stay terms, and its Edit tab changes the
nightly and weekend price, cleaning fee, stay length and instant book on a live stay. **Stop taking
bookings** takes a stay off the marketplace.

## 5a. Messages

Guests can message a host before booking, and host and guest can keep talking before and during a stay.

- **One conversation per guest and stay, kept for good.** A guest who comes back months later, or books the
  same home again, finds everything said before. Bookings between them are listed beside the chat on both sides.
- **Who starts it.** The guest, from **Message the host** on the stay's page (host section and booking sidebar)
  or from a trip. Nothing is stored until the first message is sent. A host can open a conversation only with
  someone who has booked with them (**Message guest** on the booking). Hosts can't message their own stays, and
  guests need a confirmed email address.
- **Where it lives.** Guests: **Messages** in the account (`/account/messages`), with an unread badge, plus a
  **Messages** item in the user menu. Hosts: **Messages** under Hosting in the workspace (`/messages`), with an
  unread badge, *All* / *Unread* tabs and search by guest, stay or reference.
- **Live updates** by polling every 4 seconds while the tab is visible (and at once when it becomes visible
  again). Every send locks the conversation row, so `seq` order is commit order within a conversation and a
  client asking for "everything after seq N" never misses a message. Read receipts ("Seen by Rahul") and
  unread counts use each side's last-read `seq`.
- **Alerts.** The first message the other side hasn't read yet sends an email (and a `stay_message`
  notification for hosts); a burst of messages is one alert, not ten.
- **Safety and privacy.** Plain text only: line endings are normalised, control characters dropped, nothing is
  rendered as HTML or auto-linked. Rate limits: 40 messages per 10 minutes, 10 new conversations a day. Messages
  can't be edited or deleted (the app role has no `UPDATE`/`DELETE`, and a trigger rejects updates). Guests
  still don't see the address or phone number until a booking is confirmed. Both sides are told that Trustbrick
  may read the conversation to resolve a dispute.
- **Dispute review by admins.** Admins granted `conversations.view` (in the Operations and Support presets; not
  Moderation, and not the SuperAdmin by default) get **Conversations** in the sidebar. The list shows only who,
  which stay, how many messages and bookings, never message text; it searches by name, email or any MSG-, BKG-,
  LST- or USR- reference, and a booking links to its conversation (**Review conversation**). To read one, the
  admin first gives a reason (at least 10 characters). It is written to the audit log as
  `CONVERSATION_ACCESSED`, shown to other admins who open the conversation, and opens it to that admin for 8
  hours. The transcript is read-only: admins can't reply, and reading doesn't change either side's read receipts.
  The host inbox (`/messages`) stays closed to the platform workspace.
- **Accessibility.** The message list is an ARIA live log, so new messages are announced; each message says who
  sent it and when; the composer is a labelled textarea. On a keyboard, Enter sends and Shift + Enter adds a line;
  on touch screens Enter adds a line and the Send button (44 px) sends. Earlier messages load on request
  without losing your place, and a "new messages" button appears if you've scrolled up.

## 6. Migrations

| Migration | What it does |
| --- | --- |
| `0012_stays` | Adds `'stay'` to `transaction_type`; the `stays` schema and its tables; exclusion constraints; append-only guard on `booking_events`; reference-ID triggers; `'stay'` in the intent, amenity-category and property-type-purpose checks |
| `0013_booking_events_cascade` | Booking history goes only with its booking (the app never deletes bookings), matching listing history |
| `0016_stay_messages` | `conversations` and `messages`; append-only guard on `messages`; reference-ID trigger |

`npm run db:seed:reference` marks apartments, houses, villas, builder floors, studios and a new
**Farmhouse** type as available for stays, adds stay amenities, and adds **Goa** (North Goa: Calangute,
Anjuna, Candolim, Panaji). The new enum value is never used inside a migration, so a fresh database
migrates in one transaction.

## 7. Development data

`npm run db:seed:sample` adds eight sample stays without hosts: they can be browsed but not booked.
`npm run db:seed:dev` adds:

- `host.rahul@trustbrick.test`: a verified host with a villa in Calangute (request to book) and a garden room in Anjuna
  (instant book), closed dates, a festival price, and bookings: confirmed, requested, completed, cancelled.
- `host.sneha@trustbrick.test`: a pending host application.
- Messages: Ananya's conversation with Rahul about the villa (she asked before booking; his last reply is
  unread), and an unanswered question from Vikram, so both sides show an unread badge.

The password is the usual development password.

## 8. Tests

`tests/stays.test.ts` covers:

- hosts can list only stays;
- applying, approval and suspension, including paused stays;
- search by dates and guests;
- night-by-night pricing with weekend and special rates;
- the host's rules on stay length, guests and pets;
- no street address on the public page;
- request → accept, with auto-declined overlaps and the address revealed;
- the exclusion constraint when the service is bypassed;
- instant book and closed dates;
- expiry;
- cancellations by guest, host and admin;
- scope and IDOR across hosts, guests and agents;
- hosts can't book their own stay, and unconfirmed accounts can't book.

`tests/messages.test.ts` covers the first message creating the conversation, one alert per unread burst,
read tracking and polling, one conversation per guest and stay across bookings, privacy (other guests, other
hosts), validation, the append-only log, hosts opening a conversation from a booking, and admin review (permission,
the reason gate, the audit row, and read receipts left untouched).

## 9. What is not built

- **Online payments**, payment holds, refunds, host payouts, a Trustbrick service fee and GST invoices. A
  payment provider (for example Razorpay) and tax advice come first.
- **Reviews** after a completed stay, both directions.
- **Messaging extras**: photos and attachments, push notifications, and a way for guests to report a message
  (for now they use Contact us). Messages are delivered by polling, not WebSockets.
- **iCal sync** with Airbnb and Booking.com calendars, so hosts on several platforms aren't double-booked.
- **Map search** and superhost-style quality badges.
- **An email and SMS provider.** Without one, booking emails reach only `/dev/mailbox`. This is required
  before launch.
- **Legal checks** to confirm before launch: GST on short stays and platform obligations, state homestay
  registration, housing-society permission, and Form C for foreign guests.
