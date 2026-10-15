// Draws the app icons and launch-screen logos from the website's Trustbrick mark
// (app/icon.svg, components/brand/Logo.tsx). Run from mobile/: `node scripts/brand-assets.mjs`.
// Uses sharp from the website's node_modules.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(path.resolve("../package.json"));
const sharp = require("sharp");
const out = path.resolve("assets/images");
mkdirSync(out, { recursive: true });

const NAVY = "#0b1c48";
const BRICK = "#e2582a";
const GREEN = "#2f9a56";
const LIGHT_BG = "#f2eee6";
const DARK_BG = "#12151b";

const ARCH = "M17 40V21C33 7 67 7 83 21v19";
const SHIELD = "M13 44h74v14c0 18-15 30-37 40C28 88 13 76 13 58z";
const CHECK = "M35 33l15 16L86 8";
const BRICKS = [
  [13, 44, 23, 11], [39, 44, 22, 11], [64, 44, 23, 11],
  [13, 58, 11, 11], [27, 58, 21.5, 11], [51.5, 58, 21.5, 11], [76, 58, 11, 11],
  [13, 72, 23, 11], [39, 72, 22, 11], [64, 72, 23, 11],
  [13, 86, 36, 14], [51.5, 86, 36, 14],
];

/** The mark in a 100×100 box: "brand" colours, "halo" (brand plus a soft light behind the arch, for dark backgrounds) or one flat colour. */
function mark({ tone = "brand", color = "#ffffff" } = {}) {
  const flat = tone === "mono";
  const arch = flat ? color : NAVY;
  const brick = flat ? color : BRICK;
  const check = flat ? color : GREEN;
  const halo =
    tone === "halo"
      ? `<path d="${ARCH}" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" opacity="0.8" filter="url(#halo)"/>`
      : "";
  return `
    <defs>
      <clipPath id="s"><path d="${SHIELD}"/></clipPath>
      <mask id="k" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <rect width="100" height="100" fill="#fff"/>
        <path d="${CHECK}" fill="none" stroke="#000" stroke-width="19"/>
      </mask>
      <filter id="halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <g mask="url(#k)">
      ${halo}
      <path d="${ARCH}" fill="none" stroke="${arch}" stroke-width="7.5"/>
      <g clip-path="url(#s)" fill="${brick}">${BRICKS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join("")}</g>
    </g>
    <path d="${CHECK}" fill="none" stroke="${check}" stroke-width="9"/>`;
}

/** A square canvas with the mark centred at `scale` of its size. */
function canvas({ size = 1024, scale, background, tone, color }) {
  const m = size * scale;
  const offset = (size - m) / 2;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg}
    <svg x="${offset}" y="${offset}" width="${m}" height="${m}" viewBox="0 0 100 100">${mark({ tone, color })}</svg>
  </svg>`;
}

/** Android's adaptive-icon background: warm paper with a little light in the middle. */
const paper = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <defs><radialGradient id="g" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#fbf9f4"/><stop offset="1" stop-color="#e9e2d5"/></radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
</svg>`;

const png = (svg, file) => sharp(Buffer.from(svg)).png().toFile(path.join(out, file));

await Promise.all([
  // One launcher icon for Android (it has no dark variant) and the light iPhone icon.
  png(canvas({ scale: 0.6, background: LIGHT_BG }), "icon.png"),
  // iPhone home screen in dark mode, and the tinted look (grayscale; iOS applies the tint).
  png(canvas({ scale: 0.6, background: DARK_BG, tone: "halo" }), "icon-dark.png"),
  sharp(Buffer.from(canvas({ scale: 0.6, background: "#000000", tone: "halo" }))).grayscale().png().toFile(path.join(out, "icon-tinted.png")),
  // Android adaptive icon: the mark inside the safe zone, on warm paper.
  png(canvas({ scale: 0.46 }), "android-icon-foreground.png"),
  png(paper, "android-icon-background.png"),
  // Android 13+ themed icons: one flat shape the system colours to match the phone.
  png(canvas({ scale: 0.46, tone: "mono", color: "#ffffff" }), "android-icon-monochrome.png"),
  // Launch screen, light and dark.
  png(canvas({ scale: 0.9 }), "splash-icon.png"),
  png(canvas({ scale: 0.9, tone: "halo" }), "splash-icon-dark.png"),
  png(canvas({ size: 96, scale: 0.86 }), "favicon.png"),
]);
console.log("Brand assets written to", out);
