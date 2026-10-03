// Normalises source photography dropped into /public/images.
// Next.js serves responsive AVIF/WebP variants at request time; this script only
// keeps the originals lean (max 2560px wide, progressive mozjpeg) so the repo and
// the image optimizer are not working from 10MB camera files.
//
//   npm run images:optimize
import { readdir, stat, rename, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve("public/images");
const MAX_WIDTH = 2560;
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXT.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

for await (const file of walk(ROOT)) {
  if (file.includes(`${path.sep}brand${path.sep}`)) continue;
  const before = (await stat(file)).size;
  const out = file.replace(/\.(png|webp|jpeg)$/i, ".jpg");
  const tmp = `${out}.tmp`;
  await sharp(file)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 76, mozjpeg: true, progressive: true })
    .toFile(tmp);
  if (out !== file) await unlink(file);
  await rename(tmp, out);
  const after = (await stat(out)).size;
  console.log(`${path.relative(ROOT, out).padEnd(44)} ${(before / 1024).toFixed(0).padStart(6)} KB → ${(after / 1024).toFixed(0).padStart(5)} KB`);
}
