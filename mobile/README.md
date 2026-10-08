# Trustbrick app

The Trustbrick mobile app: React Native with Expo (SDK 57) and Expo Router. One codebase builds
the Android app now and the iPhone app later. It talks to the website's server through the JSON
API at `/api/v1` ([`docs/mobile-api.md`](../docs/mobile-api.md)) and never to the database, so
every rule, permission and notification is shared with the website.

## What's in it (customer side)

| Tab or screen | What it does |
| --- | --- |
| **Explore** | Buy, Rent, PGs, Home Stay and Invest; search as you type; the website's filters (city, localities, budget, bedrooms, furnishing, type, virtual tour, sort); results load as you scroll |
| **Listing** | Photos, price and key facts, the virtual tour box, details, stay terms and host, PG rooms, amenities; contact the agent, or check dates and message the host for a stay |
| **Virtual tour** | 360° rooms, the 3D model and hosted tours, for Plus members (the same viewers as the website, in a WebView) |
| **Book a stay** | A calendar with taken nights crossed out, guests, a live price, and the request (or instant booking) |
| **Saved** | Saved homes |
| **Messages** | Conversations with hosts; a chat that checks for replies while open |
| **Alerts** | Notifications (also sent as push notifications); tapping one opens the right screen |
| **Account** | Plan, your stays (with the address and host's phone once confirmed, and cancelling), partner mode, sign out |
| **Plans** | Plus, monthly or yearly, and the free trial |

## Partner mode (agents and hosts)

Account → **Switch to partner mode** (and pick the workspace if there are several). The app
remembers the choice; the tabs follow the person's role, as the website's workspace does.

| Tab or screen | What it does |
| --- | --- |
| **Today** | New and open leads, upcoming visits, booking requests, unread guest messages and listings by status |
| **Leads** (agents) | Leads and site visits; a lead's contact (call, WhatsApp, email), status, notes and history; schedule a visit (the customer is notified), mark it done or missed |
| **Bookings** (hosts) | Requests, upcoming, past, cancelled; accept or decline, check the guest in, complete or cancel, and message the guest |
| **Inbox** (hosts) | Guest conversations |
| **Listings** | The workspace's listings with their status and tour; each opens to its virtual tour editor |

**Recording a tour on site.** On a listing: **Add 360° photos** (from the gallery: take them with a
360° camera's app, e.g. Insta360 or RICOH THETA, or a 360° photo app) and **Add a 3D model**
(`.glb`), or paste a hosted tour link. Rooms can be renamed, reordered and removed. The app checks a
photo is a 2:1 panorama before sending it.

Picked files are copied into the app's storage and uploaded one at a time with progress
(`src/uploads/queue.ts`). With no signal they wait, survive the app closing, and go up when the app
is opened again with a connection; a file the server turns down stays with its reason until it's
removed. On a live listing, changes show straight away and each goes to Trustbrick's review, like
on the website; a tour Trustbrick hid can't be changed until an admin approves a fix.

Notifications for leads, visits, bookings and guest messages open the matching partner screen.

## Run it on your phone

Start the database and the website first, from the repository root (`npm run db:up`, then
`npm run dev`): the app gets everything from the website's API. Sign in with any website account,
e.g. the seeded `@trustbrick.test` ones.

### Development build (recommended)

The app's own installable copy (`expo-dev-client`), with push notifications. It's built once;
after that it loads the code from your computer and reloads as you edit, like Expo Go. Rebuild
only when a native package or `app.json` changes.

**Build it on your computer, phone on a USB cable.** Needs the Android SDK (`ANDROID_HOME`; Android
Studio's SDK manager or its command-line tools) and USB debugging on the phone (Settings → About
phone → tap Build number 7 times → Developer options → USB debugging; accept the prompt when you
plug in). Gradle downloads the JDK 17 it needs by itself. Then:

```bash
npx expo run:android
```

It builds (15–20 minutes the first time, a minute or two after), installs the app and starts the
dev server. Gradle's cache and the SDK take several GB: on a nearly full C: drive, point
`GRADLE_USER_HOME` and `ANDROID_HOME` at another drive.

**Next time**, with the build installed: plug the phone in and forward the two ports over the cable,
so the phone needs no Wi-Fi or firewall setup at all (the app then finds the dev server and the
website on `localhost`):

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
npx expo start --dev-client
```

then open the Trustbrick app on the phone and pick `http://localhost:8081` (enter it once under
"Enter URL manually"; it's remembered). If it shows "unexpected end of stream", the dev server
wasn't up yet: tap Reload. `adb` is in `%ANDROID_HOME%\platform-tools` if it isn't on your PATH.

**Or build it in Expo's cloud** (no Android SDK needed; installs from a link):

```bash
npx eas-cli@latest build --profile development --platform android
```

Over Wi-Fi instead of a cable, the phone and computer must be on the same network, and on Windows
that network must be set to **Private** (Settings → Network & internet → Wi-Fi → the network →
Network profile type) or the firewall blocks the phone.

### Expo Go (quick look, no push)

Install **Expo Go** from the Play Store, run `npx expo start` here and scan the QR code (same Wi-Fi,
as above). Everything works except push notifications, which Expo Go on Android can't receive.

### Push notifications (one-time setup)

1. **Expo account**: create one at expo.dev, then link this folder to an EAS project (this
   writes `extra.eas.projectId` and `owner` into `app.json`; commit that):

   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

2. **Firebase** (Android delivers pushes through Firebase Cloud Messaging): in the Firebase
   console, create a project and add an Android app with the package `in.trustbrick.app`.
   Download its `google-services.json` into this folder (`app.json` points at it; it holds only
   public identifiers, so it can be committed).
3. **Push key for Expo**: Firebase → Project settings → Service accounts → Generate new private
   key. Upload it with `npx eas-cli@latest credentials` → Android → (any profile; the key belongs
   to the app's package) → Google Service Account → Push Notifications (FCM V1) → Upload. Then
   delete the downloaded key; never commit it (`.gitignore` covers the usual names).
4. **The website** only logs pushes in development: set `PUSH_DRIVER=expo` in `.env.local`.

To check: sign in on the phone, allow notifications, and reply to that person's conversation from
the website (as the host). The push arrives within seconds, and tapping it opens the conversation.

### Web preview

`npm run web` shows the app in a browser (the website allows it from `localhost:8081` in
development). It can't play tours, has no push notifications and doesn't keep pending uploads
after the page closes; the phone does all three.

## Things to know

- **Shared code**: plain TypeScript from the website's `../lib` (formatting, listing labels,
  filters, plan and tour rules, stay labels) is imported as `@/lib/…`, so prices and labels read
  the same in both. Metro watches `../lib` (`metro.config.js`). Only import files there that have
  no server code (no `server-only`, database or Next.js imports).
- **Sign-in** keeps the session token in secure storage (`src/auth`); `src/api/client.ts` sends
  it as `Authorization: Bearer …`.
- **Push notifications** need a development or store build linked to EAS. In Expo Go on Android
  `src/push.ts` doesn't even load `expo-notifications` (importing it there throws since SDK 53),
  so pushes are simply off and everything else works.
- **Hermes**, the app's JavaScript engine, lacks some `Intl` features browsers have, notably
  `Intl.RelativeTimeFormat` (`lib/format.ts` falls back to the same wording; `tests/format.test.ts`).
  Shared `../lib` code that works on the website can still fail on the phone: check new `Intl`
  use on a device.
- **Before the first Play Store upload**, check `android.package` in `app.json`
  (`in.trustbrick.app`): it can't change once published. Set `EXPO_PUBLIC_API_URL` to the live
  website for store builds.
- **Capture** goes through the phone's gallery: the app doesn't drive a 360° camera directly.
  Taking the photo in the camera's own app and adding it here works with any camera.
- **Tours** load Photo Sphere Viewer and model-viewer from jsDelivr into the WebView; serving
  them from the website instead is a to-do before launch.

## Building

```bash
npx eas-cli@latest build --platform android   # an .aab for the Play Store, built in the cloud
npx eas-cli@latest build --platform ios       # later; no Mac needed
```

Checks: `npx tsc --noEmit` and `npx expo lint`.
