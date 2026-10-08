/**
 * The page the tour WebView shows: the same viewers as the website (Photo Sphere Viewer for 360°
 * rooms, <model-viewer> for the 3D model), loaded from a CDN. Tour files are Plus-only, so the
 * page fetches them with the session token (handed over in memory, never in a URL) and shows
 * them from blob URLs. The app switches rooms with window.showRoom(i).
 */
const PSV = "5.15.1";

export function tourHtml(): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@${PSV}/index.css">
<script type="importmap">{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js",
  "@photo-sphere-viewer/core":"https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@${PSV}/index.module.js",
  "@photo-sphere-viewer/gyroscope-plugin":"https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/gyroscope-plugin@${PSV}/index.module.js"
}}</script>
<style>
  html,body{margin:0;height:100%;background:#0d1119;color:#f3f1ec;font-family:system-ui,sans-serif;overflow:hidden}
  #viewer,model-viewer{position:absolute;inset:0;width:100%;height:100%}
  model-viewer{background:#e4ddd0;--poster-color:#e4ddd0}
  #msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:15px;opacity:.85}
</style>
</head><body>
<div id="viewer"></div><div id="msg">Loading the tour…</div>
<script type="module">
  const post = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const msg = document.getElementById("msg");
  const fail = (text) => { msg.style.display = "flex"; msg.textContent = text; post({ type: "error", message: text }); };
  const cache = new Map();
  async function blobUrl(url) {
    if (cache.has(url)) return cache.get(url);
    const r = await fetch(url, { headers: window.__TOUR.headers });
    if (!r.ok) throw new Error(r.status === 403 ? "This tour is for Trustbrick Plus members." : "The tour couldn't be loaded.");
    const u = URL.createObjectURL(await r.blob());
    cache.set(url, u);
    return u;
  }
  async function start() {
    const t = window.__TOUR;
    try {
      if (t.mode === "model") {
        await import("https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js");
        const mv = document.createElement("model-viewer");
        mv.setAttribute("camera-controls", ""); mv.setAttribute("auto-rotate", ""); mv.setAttribute("touch-action", "pan-y");
        mv.setAttribute("shadow-intensity", "1"); mv.setAttribute("alt", "3D model of " + t.title);
        mv.src = await blobUrl(t.model);
        document.body.appendChild(mv);
        msg.style.display = "none";
        return;
      }
      const [{ Viewer }, { GyroscopePlugin }] = await Promise.all([import("@photo-sphere-viewer/core"), import("@photo-sphere-viewer/gyroscope-plugin")]);
      const first = await blobUrl(t.rooms[0].url);
      const viewer = new Viewer({
        container: document.getElementById("viewer"), panorama: first, caption: t.rooms[0].name, defaultZoomLvl: 0,
        navbar: ["zoom", "gyroscope", "caption", "fullscreen"], plugins: [GyroscopePlugin], loadingTxt: "Loading the room…",
        lang: { gyroscope: "Look around by moving your phone" },
      });
      viewer.addEventListener("ready", () => { msg.style.display = "none"; post({ type: "ready" }); }, { once: true });
      window.showRoom = async (i) => {
        try { await viewer.setPanorama(await blobUrl(t.rooms[i].url), { caption: t.rooms[i].name, transition: { speed: 1000 } }); post({ type: "room", index: i }); }
        catch (e) { fail(e.message); }
      };
      // Load the next rooms quietly, so switching is quick.
      t.rooms.slice(1).forEach((r) => blobUrl(r.url).catch(() => {}));
    } catch (e) { fail(e && e.message ? e.message : "The tour couldn't be shown on this phone."); }
  }
  if (window.__TOUR) start(); else window.addEventListener("tourready", start, { once: true });
</script>
</body></html>`;
}
