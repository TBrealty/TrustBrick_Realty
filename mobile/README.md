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
remembers the choice. Everything an agent, broker or host does in the website's workspace can be
done here; the tabs and the More menu follow the person's role, as the website's sidebar does
(`can` in `/partner/summary`).

| Tab or screen | What it does |
| --- | --- |
| **Today** | What needs doing (booking requests, visits to confirm, new leads, listings sent back), shortcuts, the dashboard's numbers for 7, 30 or 90 days with a views chart, and the most viewed listings |
| **Properties** | Search, status groups with counts, and **Onboard** |
| **Leads** (agents) | Search and stages, a call a tap away; a lead's contact, status, notes, history and visits |
| **Bookings**, **Messages** (hosts) | Requests, upcoming, past, cancelled; accept, decline, check in, message the guest |
| **More** | Visits, Clients, Calendar, Agents (broker admins), Performance, Commission, Subscription, switching workspace or to customer mode |

**A property, end to end** (`src/app/partner/property/`):
- **Onboard** (`new.tsx`): what it's for, the kind of property, and where it is. The map pin can
  come from **Use my current location** (standing at the property) or a pasted Google or Apple
  Maps link. That creates the draft, then the steps follow.
- **Steps** (`[ref]/[step].tsx`): Location, Details (by category), Price and terms (by purpose;
  room types for a PG; nightly prices and rules for a homestay) and Amenities, with the website's
  fields, choices and hints (`src/partner/property-fields.ts`). The server checks everything and
  its message shows under the field.
- **Photos and files** (`[ref]/media.tsx`): take photos or pick them, add floor plans, videos and
  private documents; tap one to caption it, move it (the first photo is the cover) or remove it.
- **The property's page** (`[ref]/index.tsx`): status and the team's note, what's still missing
  before it can be submitted, each step, **Quick edit** for a live listing (price, availability,
  an offer; no new review), the actions open now (submit, withdraw, archive, mark sold or rented
  with the commission worked out, mark available again), its numbers and history.

**Hosting calendar**: each night's price, bookings and requests. Tap the first and last night to
block them or give them a special price; tap a blocked night to open it again.

**Profile & security** (`src/app/security.tsx`, from More or the Account tab): change the
password, see where you're signed in and sign out everywhere else, and choose which notifications
you get.

Admin work (approvals, users, platform settings) is still on the website; Account → **Open the
workspace** goes there.

**Recording a tour on site.** On a listing:
- **Take a 360° photo of a room** with this phone (`src/app/partner/capture/[ref].tsx`). Name the
  room, stand in the middle, and follow the dot: line it up in the circle and hold still, and the
  photo takes itself (about 30: round at eye level, above, below, the ceiling and the floor). The
  motion sensor says where the phone points (`src/capture/geometry.ts`). The photos are sent to
  Trustbrick, which joins them into one 360° photo in a minute or two (the stitching service,
  `stitcher/`) and adds it to the tour; the editor shows "Making the 360° photo…" until it's there,
  and a notification says when it's ready.
- **Add from a 360° camera** (Insta360, RICOH THETA…): its equirectangular photos, from the gallery.
  The app checks each is a 2:1 panorama before sending it.
- **More ways to show the home**: a **3D model** (`.glb`; *How to make one* explains scanning with
  an iPhone Pro, photo-scanning apps, or getting it from the architect) and a **hosted tour link**
  (Matterport, Kuula, CloudPano) for agents who already have one.

Rooms can be renamed, reordered and removed.

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

### Installed on the phone, updated over the cable (everyday use)

The app with its code inside it (a release build), so it opens quickly and needs nothing from the
dev server. The phone, on the USB cable, gets its data from the website on this computer.

```bash
npm run phone:update
```

That prepares the Android project, builds the app, installs it over the cable and opens it. The first
build takes 15–20 minutes; after that, run the same command after any change to update the app on
the phone (your sign-in and saved data stay). It also forwards the website to the phone, so keep
`npm run dev` running at the repository root.

- `npm run phone:connect`: after re-plugging the cable (or restarting the computer), forward the
  website to the phone again; the installed app needs it for its data.
- `npm run phone:dev`: switch back to the development build below, for live reload while working
  on the design.

This build talks to the website over plain `http://localhost:3000`, which release builds refuse by
default; `app.config.ts` allows it only when the script sets `TRUSTBRICK_LOCAL_RELEASE=1`. Store
builds never set it and stay https-only.

### Development build (live reload)

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
