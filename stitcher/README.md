# Stitcher: joining phone photos into 360° panoramas

Agents can take a 360° photo of a room with the app's guided camera (mobile:
`src/app/partner/capture/[ref].tsx`). The app shows a dot to line up and takes about 30 photos
(12 round at eye level, 8 tilted up, 8 tilted down, the ceiling and the floor), recording where
the phone pointed for each. The website collects them (`lib/services/tour-captures.ts`) and sends
them here; this service joins them into one equirectangular (2:1) panorama, which the website adds
to the listing's tour like an uploaded 360° photo.

It wraps [Hugin](https://hugin.sourceforge.io/)'s command-line tools:

1. `pto_gen`, `pto_var`: one rectilinear lens; each photo placed where the phone pointed.
2. `cpfind --prealigned`, `cpclean`: matching points, only between photos that overlap.
3. `autooptimiser`: refine positions and the shared field of view (the first photo stays put), then
   exposure and vignetting so the seams don't show. With too few matches (a bare wall), the
   phone's directions alone are used.
4. `pano_modify --straighten`: level horizon, full 360 × 180 at 6000 × 3000.
5. `nona`, `verdandi --wrap`: render and blend (enblend left black patches across the 180° seam).

## Running it

```bash
npm run stitcher:up     # build and start it (Docker, port 8090 on 127.0.0.1)
npm run stitcher:test   # the self-test: cuts 30 photos out of a known panorama, joins them, compares
```

The website finds it at `STITCHER_URL` (default `http://127.0.0.1:8090`). Captures are stitched
right after the app finishes sending the photos, and again when the agent opens the listing; for
anything left waiting (the service was down), schedule `POST /api/internal/captures` with
`Authorization: Bearer $CRON_SECRET` every few minutes.

## API

- `POST /stitch` with JSON `{ "hfov": 52, "shots": [{ "yaw": 0, "pitch": 0, "roll": 0, "data": "<base64 JPEG>" }] }`.
  Angles are degrees: yaw turns right from the first photo, pitch is up from the horizon.
  - Success: `200 image/jpeg`, with `X-Stitch-Info` (photos, matches, whether aligned, field of view).
  - Can't be joined: `422 { "error": "…" }`.
- `GET /health` → `ok`.

It stitches one capture at a time: about a minute or two, and up to a gigabyte or two of memory
(the container is capped at 2 GB). In production, run it next to the website and don't expose it
publicly.

## Quality

Photos from a handheld phone stitch well when the agent turns on one spot, with the room lit and
nobody walking through. Things very close to the phone (a door frame, a chair beside you) can show
a seam, because the lens moves a little as you turn. A 360° camera (Insta360, RICOH THETA) still
gives the cleanest result, and the app accepts its photos too.
