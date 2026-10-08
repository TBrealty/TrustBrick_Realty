# Trustbrick API v1 (for the mobile app)

The Trustbrick app (React Native + Expo, one codebase for Android and iOS) talks to the same
Next.js server and database as the website, through `/api/v1`. Each endpoint is a thin shell over
the services the website uses (`lib/services/*`), so rules, permissions, rate limits and the audit
trail are the same everywhere. The app never connects to the database.

Code: `lib/api/http.ts` (the wrapper every route uses) and `app/api/v1/**/route.ts`.
Tests: `tests/api-v1.test.ts`.

## Conventions

- **Base URL**: the website's origin, e.g. `https://trustbrick.in/api/v1`.
- **Auth**: sign in with `POST /auth/sign-in`, keep the returned `token` in secure storage
  (`expo-secure-store`), and send it on every request as `Authorization: Bearer <token>`.
  Sessions last 7 days and are extended while the app is used; a `401` means sign in again.
- **Workspaces**: agents, hosts and staff send `X-Trustbrick-Workspace: <membershipId>` (from
  `GET /me`) to act in a workspace. With only one workspace it's used without the header.
- **Success**: `200` (or `201`) with `{ "data": … }`.
- **Errors**: `{ "error": { "code", "message", "fieldErrors"?, "reason"? } }`.

  | Status | `code` | Meaning |
  | --- | --- | --- |
  | 401 | `UNAUTHORIZED` | Not signed in, or the token has expired or been revoked |
  | 403 | `FORBIDDEN` | Signed in but not allowed (`reason` says why when the app should react) |
  | 404 | `NOT_FOUND` | Doesn't exist, or isn't visible to this person |
  | 409 | `CONFLICT` | Changed meanwhile, or not allowed in its current state |
  | 422 | `VALIDATION_ERROR` | `fieldErrors` maps each field to a message to show under it |
  | 429 | `RATE_LIMITED` | Too many attempts; wait `Retry-After` seconds |
  | 500 | `INTERNAL_ERROR` | Our side; safe to retry later |

  `reason` values: `EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED` (sign-in); `SIGN_IN_REQUIRED`,
  `PLUS_REQUIRED` (virtual tours).
- **Paths** in responses (`image`, photo `key`s, tour `url`s, notification `link`s) are relative to
  the base origin. Photos are public; tour files under `/media/…` need the bearer token as a
  header on the image request (React Native `Image` accepts `source={{ uri, headers }}`).
- **Links**: notification `link`s and listing pages are website paths (`/listings/LST-…`,
  `/account/bookings`). The app maps them to screens, and Android App Links can open the same
  URLs straight in the app.
- Responses are never cached (`Cache-Control: no-store`); every response carries
  `X-Trustbrick-Api: 1`.

## Endpoints

### Account

| Method and path | Auth | Body → result |
| --- | --- | --- |
| `GET /` | — | The API's name and version |
| `POST /auth/sign-up` | — | `{ name, email, password, intent? }` → `201 { message }`. The email must be confirmed (link by email) before signing in. The answer is the same whether or not the email was already registered |
| `POST /auth/sign-in` | — | `{ email, password }` → `{ token, expiresAt, user: { referenceId, name, email } }`. Rate-limited per address and per account |
| `POST /auth/sign-out` | user | Ends this session; its push registration goes with it |
| `POST /auth/forgot-password` | — | `{ email }` → `{ message }` (same either way) |
| `GET /me` | user | `{ user, workspaces[], activeWorkspace, plan: { code, name, features[], subscription, trialAvailable }, unreadNotifications }` |

### Push notifications

| Method and path | Auth | Body → result |
| --- | --- | --- |
| `POST /devices` | user | `{ token: "ExponentPushToken[…]", platform: "android" \| "ios", appVersion? }` → `201`. Call after each sign-in and when Expo gives a new token |
| `DELETE /devices` | user | `{ token }`: stop pushes to this phone |
| `GET /notifications` | user | `{ unread, items: [{ id, type, title, body, link, read, createdAt }] }` (latest 50) |
| `POST /notifications/read` | user | `{ id? }`: one, or all without an id → `{ unread }` |

Every in-app notification (new lead, booking request, tour hidden, plan changes…) is also pushed
to the person's signed-in phones, with `data: { notificationId, type, link }` and the unread
count as the badge. Delivery happens after the request that created it has committed; muted
notification types aren't created, so aren't pushed. A phone stops getting pushes when it signs
out, when its session is revoked (password reset, suspension), or when Expo reports the token gone.

### Browsing (customers)

| Method and path | Auth | Body → result |
| --- | --- | --- |
| `GET /listings?kind=buy\|rent\|pg\|stay\|invest&…` | optional | `{ items[], total, nextCursor }`, 12 at a time. The website's query parameters (`city`, `locality`, `q`, `min`, `max`, `type`, `bhk`, `furnishing`, `amenity`, `tour=1`, `sort`, `cursor`…; repeat a key for several values). Signed in, each item has `saved` |
| `GET /listings/options?kind=…` | — | `{ cities[{ slug, name, localities[] }], types[], amenities[] }` for the filters |
| `GET /listings/{ref}` | optional | The listing page's data, plus `saved`, `tourAccess` (`open`, `plus_required`, `sign_in_required` or `null` when there's no tour) and `contact` (agent name, verified, `hasOpenEnquiry`) |
| `GET /listings/{ref}/tour` | optional | `{ rooms[{ id, name, url, thumbnailUrl }], model, link }` for Plus members; `401`/`403` with `reason` otherwise |
| `POST /listings/{ref}/enquiries` | user | `{ name, phone, message?, wantsVisit, visitDate?, visitTime? }` → `201 { leadReferenceId, visitReferenceId }` |
| `GET /bookmarks` | user | `{ items[] }` saved homes |
| `PUT /bookmarks/{ref}` / `DELETE /bookmarks/{ref}` | user | Save or remove the home behind a listing |

### Stays and messages

| Method and path | Auth | Body → result |
| --- | --- | --- |
| `GET /listings/{ref}/availability` | — | `{ unavailable: [{ from, to }] }`: booked and blocked nights (`to` is the first free night) |
| `POST /listings/{ref}/quote` | — | `{ checkIn, checkOut, adults, children?, pets? }` → nightly prices and total, or `{ ok: false, message, field }` |
| `POST /listings/{ref}/bookings` | user | The quote's fields plus `{ name, phone, message?, agree: true }` → `201 { referenceId, status }`. A request (or an instant booking); the host is notified |
| `GET /trips` · `GET /trips/{ref}` | user | The person's bookings; one booking, with the address and host's phone once confirmed |
| `POST /trips/{ref}/cancel` | user | `{ reason? }` → the updated booking, under the stay's cancellation policy |
| `GET /listings/{ref}/conversation` | user | `{ existing: "MSG-…" }` or a `draft` to start one |
| `POST /listings/{ref}/messages` | user | `{ body }`: message the host before booking (starts the conversation) |
| `GET /conversations` | user | `{ unread, items[] }` |
| `GET /conversations/{ref}` | user | The conversation (marks it read) |
| `GET /conversations/{ref}/messages?after=N` / `?before=N` | user | New messages since N (poll while open), or older ones |
| `POST /conversations/{ref}/messages` | user | `{ body }` → `201` |

A host's reply notifies the guest in the app too (`host_message`), so it's pushed to their phone.

### Plans

| Method and path | Auth | Body → result |
| --- | --- | --- |
| `GET /plans?for=customer\|partner` | — | `{ plans[] }` with prices, trial days and features |
| `GET /subscription` | user | The person's plan overview |
| `POST /subscription/trial` | user | `{ plan, cycle }` → `201` with the new overview. Paid checkout comes with the payment gateway (Play billing rules apply to in-app digital subscriptions) |

### Partner mode (agents and hosts)

Every partner endpoint acts in a workspace (send `X-Trustbrick-Workspace`) and follows the same
permissions as the website's workspace pages: a customer gets `403`, an agent sees the leads in
their scope (own, team or organization), a host sees their own stays. Paged lists take `?page=N`
and return `{ rows, total, page, pageSize }` (25 a page).

| Method and path | Auth | Body → result |
| --- | --- | --- |
| `GET /partner/summary` | user | The home screen: `{ workspace, leads, visits, bookings, inbox, listings }`. A part is `null` when the role doesn't cover it, which is also how the app decides which tabs to show |
| `GET /partner/leads?open=1&status=&q=` | user | Leads |
| `GET /partner/leads/{ref}` | user | One lead: contact, listing, visits, notes, history and the statuses it can move to |
| `POST /partner/leads/{ref}/status` | user | `{ status, note?, lostReason? }` → the updated lead. The customer is notified when it matters |
| `POST /partner/leads/{ref}/notes` | user | `{ note }` → `201` with the lead |
| `GET /partner/visits?upcoming=1&status=` | user | Site visits |
| `POST /partner/visits/{ref}` | user | `{ action: "schedule", scheduledAt }` confirms a time (the customer is notified); `complete`, `no_show`, `cancel` close it |
| `GET /partner/bookings?group=requests\|upcoming\|past\|cancelled` | user | A host's bookings, with `counts` per group |
| `GET /partner/bookings/{ref}` | user | One booking: nights, guest contact once confirmed, history, and the `actions` open to the host now |
| `POST /partner/bookings/{ref}/actions` | user | `{ action, reason? }` (`accept`, `decline`, `check_in`, `complete`, `no_show`, `host_cancel`) → the updated booking |
| `POST /partner/bookings/{ref}/conversation` | user | Opens (or finds) the conversation with the guest → `{ referenceId }` |
| `GET /partner/conversations?show=unread&q=` · `GET /partner/conversations/{ref}` | user | The host's inbox; one conversation (marks it read) |
| `GET` / `POST /partner/conversations/{ref}/messages` | user | As for customers. A reply notifies and pushes to the guest |
| `GET /partner/listings?group=&q=&sort=` | user | The workspace's listings, each with `statusLabel` and the tour status |
| `GET /partner/listings/{ref}` | user | One listing with its tour: rooms (`id`, `name`, thumbnails), the 3D model, the hosted link, `tourMode` and `tourReviewWaiting` |

**The tour, from the phone.** `tourMode` says what can be changed: `draft` (anything; reviewed
with the listing), `live` (changes show straight away and each one goes to Approvals → Virtual
tours), `locked` (the tour was hidden; it stays hidden until an admin approves a fix) or `view`
(no permission to edit).

| Method and path | Auth | Body → result |
| --- | --- | --- |
| `POST /partner/listings/{ref}/media?kind=panorama\|model_3d` | user | The file itself as the body (not a form), with `Content-Type` and `X-File-Name` (URL-encoded) → `201` with the new room or model. A 360° photo must be a 2:1 panorama; a model is a `.glb` up to 100 MB. Photos for the listing itself aren't taken here (`409`) |
| `PUT /partner/listings/{ref}/media/{id}` | user | `{ name }` renames a room |
| `DELETE /partner/listings/{ref}/media/{id}` | user | Removes a room or the model |
| `PUT /partner/listings/{ref}/media-order` | user | `{ ids[] }`: the room order (the first opens the tour) |
| `PUT /partner/listings/{ref}/tour-link` | user | `{ url }` (Matterport, Kuula…), or `""` to remove it |

Uploads are rate-limited per person. The app sends the raw file so a phone can upload in the
background and resume after losing signal.

The app itself is in [`mobile/`](../mobile/README.md). Tests for this section:
`tests/api-partner.test.ts`.

## Server settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUSH_DRIVER` | `expo` in production, `log` otherwise | `expo` sends through Expo's push service; `log` only logs; `off` |
| `EXPO_ACCESS_TOKEN` | — | Only if Expo's enhanced push security is turned on for the project |
| `API_CORS_ORIGIN` | `http://localhost:8081` in development | The one browser origin allowed to call the API: the app's web preview. Native apps need none |
| `PUSH_CRON_SECRET` | — | Enables `POST /api/internal/push` (Bearer this secret) for a scheduler to retry anything left unsent |
| `STORAGE_DRIVER` | `local` | `s3` for S3-compatible object storage (S3, Cloudflare R2, MinIO), needed once uploads come from many phones and servers |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | — | Required with `STORAGE_DRIVER=s3` |
| `S3_REGION` / `S3_ENDPOINT` | `auto` / — | R2: `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com` |
| `S3_FORCE_PATH_STYLE` | `false` | `true` for MinIO |

Moving existing files from local storage to a bucket is a copy of `.data/storage/` to the bucket
with the same keys, then `UPDATE real_estate.media SET storage_provider = 's3' WHERE storage_provider = 'local'`.
