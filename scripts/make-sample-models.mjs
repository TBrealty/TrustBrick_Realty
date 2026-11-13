// Builds the "dollhouse" 3D models used by the seeded tours (db/seed/tours.mjs): an apartment and a
// villa, each a floor plan seen from above with low-cut walls, doorways, windows, floors and
// furniture. Plain boxes, one mesh per material, written as glTF 2.0 binary (.glb) with no
// dependencies. Output: public/models/*.glb.
//
//   node scripts/make-sample-models.mjs
import { mkdirSync, writeFileSync } from "node:fs";

// ── Materials (base colour, roughness, optional transparency) ──────────────────
const MATERIALS = {
  wall: { color: [0.94, 0.92, 0.88], rough: 0.95 },
  wallCut: { color: [0.36, 0.33, 0.3], rough: 0.95 }, // the cut top of the walls, darker so the plan reads
  wood: { color: [0.69, 0.52, 0.36], rough: 0.8 },
  tile: { color: [0.74, 0.78, 0.79], rough: 0.6 },
  stone: { color: [0.74, 0.72, 0.68], rough: 0.85 },
  deck: { color: [0.52, 0.38, 0.27], rough: 0.85 },
  grass: { color: [0.45, 0.6, 0.36], rough: 1 },
  water: { color: [0.36, 0.67, 0.82], rough: 0.15, alpha: 0.85 },
  glass: { color: [0.7, 0.85, 0.92], rough: 0.05, alpha: 0.35 },
  fabric: { color: [0.29, 0.4, 0.45], rough: 1 },
  fabricWarm: { color: [0.76, 0.42, 0.26], rough: 1 },
  linen: { color: [0.96, 0.95, 0.92], rough: 1 },
  darkWood: { color: [0.36, 0.25, 0.17], rough: 0.7 },
  counter: { color: [0.26, 0.27, 0.29], rough: 0.4 },
  white: { color: [0.97, 0.97, 0.97], rough: 0.3 },
  metal: { color: [0.62, 0.64, 0.66], rough: 0.35 },
  plant: { color: [0.26, 0.5, 0.27], rough: 1 },
  pot: { color: [0.69, 0.31, 0.17], rough: 0.9 },
  rug: { color: [0.82, 0.72, 0.58], rough: 1 },
};

// ── A scene of boxes: [material, x0, y0, z0, x1, y1, z1] in metres; y is up ───
function scene() {
  const boxes = [];
  const box = (m, x0, y0, z0, x1, y1, z1) => boxes.push([m, Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]);
  const H = 1.25; // walls cut low, dollhouse style, so every room can be seen from above
  const T = 0.12; // wall thickness
  // A wall along x or z from (a) to (b), with openings [from, to] along it (doorways and windows).
  const wall = (x0, z0, x1, z1, openings = []) => {
    const alongX = z0 === z1;
    const [start, end] = alongX ? [Math.min(x0, x1), Math.max(x0, x1)] : [Math.min(z0, z1), Math.max(z0, z1)];
    const cuts = [...openings].sort((a, b) => a.at[0] - b.at[0]);
    let from = start;
    const piece = (a, b, y0, y1, material) => {
      if (b - a < 0.01) return;
      if (alongX) box(material, a, y0, z0 - T / 2, b, y1, z0 + T / 2);
      else box(material, x0 - T / 2, y0, a, x0 + T / 2, y1, b);
    };
    const solid = (a, b) => {
      piece(a, b, 0, H - 0.04, "wall");
      piece(a, b, H - 0.04, H, "wallCut");
    };
    for (const o of cuts) {
      solid(from, o.at[0]);
      if (o.window) {
        piece(o.at[0], o.at[1], 0, 0.85, "wall"); // sill
        piece(o.at[0], o.at[1], 0.85, H, "glass");
      }
      from = o.at[1];
    }
    solid(from, end);
  };
  const floor = (m, x0, z0, x1, z1, y = 0) => box(m, x0, y - 0.05, z0, x1, y, z1);
  return { boxes, box, wall, floor };
}

// Furniture, placed by its footprint (x0, z0)–(x1, z1).
function furnish({ box }) {
  return {
    sofa(x0, z0, x1, z1, m = "fabric") {
      const alongX = x1 - x0 >= z1 - z0;
      box(m, x0, 0, z0, x1, 0.42, z1);
      if (alongX) box(m, x0, 0.42, z1 - 0.2, x1, 0.82, z1);
      else box(m, x1 - 0.2, 0.42, z0, x1, 0.82, z1);
    },
    table(x0, z0, x1, z1, h = 0.75, m = "darkWood") {
      box(m, x0, h - 0.04, z0, x1, h, z1);
      for (const [x, z] of [[x0, z0], [x1 - 0.06, z0], [x0, z1 - 0.06], [x1 - 0.06, z1 - 0.06]]) box(m, x, 0, z, x + 0.06, h - 0.04, z + 0.06);
    },
    chair(x, z) {
      box("darkWood", x - 0.22, 0.42, z - 0.22, x + 0.22, 0.46, z + 0.22);
      box("darkWood", x - 0.2, 0, z - 0.2, x + 0.2, 0.42, z + 0.2);
    },
    bed(x0, z0, x1, z1, headAtZ0 = true) {
      box("darkWood", x0, 0, z0, x1, 0.3, z1);
      box("linen", x0 + 0.05, 0.3, z0 + 0.05, x1 - 0.05, 0.5, z1 - 0.05);
      const zh = headAtZ0 ? z0 : z1 - 0.1;
      box("darkWood", x0, 0, zh, x1, 1.0, zh + 0.1);
      const zp = headAtZ0 ? z0 + 0.15 : z1 - 0.55;
      box("white", x0 + 0.15, 0.5, zp, (x0 + x1) / 2 - 0.05, 0.62, zp + 0.4);
      box("white", (x0 + x1) / 2 + 0.05, 0.5, zp, x1 - 0.15, 0.62, zp + 0.4);
      const zb = headAtZ0 ? z1 - 0.7 : z0 + 0.05;
      box("fabricWarm", x0 + 0.04, 0.5, zb, x1 - 0.04, 0.54, zb + 0.65);
    },
    wardrobe(x0, z0, x1, z1) {
      box("wood", x0, 0, z0, x1, 1.15, z1);
    },
    counter(x0, z0, x1, z1) {
      box("white", x0, 0, z0, x1, 0.86, z1);
      box("counter", x0, 0.86, z0, x1, 0.9, z1);
    },
    fridge(x0, z0) {
      box("metal", x0, 0, z0, x0 + 0.7, 1.2, z0 + 0.7);
    },
    rug(x0, z0, x1, z1) {
      box("rug", x0, 0, z0, x1, 0.015, z1);
    },
    tv(x0, z0, x1, z1) {
      box("darkWood", x0, 0, z0, x1, 0.45, z1);
      const alongX = x1 - x0 >= z1 - z0;
      if (alongX) box("counter", x0 + 0.2, 0.45, (z0 + z1) / 2 - 0.03, x1 - 0.2, 1.1, (z0 + z1) / 2 + 0.03);
      else box("counter", (x0 + x1) / 2 - 0.03, 0.45, z0 + 0.2, (x0 + x1) / 2 + 0.03, 1.1, z1 - 0.2);
    },
    toilet(x, z) {
      box("white", x - 0.2, 0, z - 0.3, x + 0.2, 0.4, z + 0.3);
      box("white", x - 0.2, 0.4, z - 0.3, x + 0.2, 0.75, z - 0.15);
    },
    basin(x0, z0, x1, z1) {
      box("white", x0, 0, z0, x1, 0.82, z1);
    },
    shower(x0, z0, x1, z1) {
      box("tile", x0, 0, z0, x1, 0.05, z1);
      box("glass", x0, 0.05, z1 - 0.03, x1, 1.2, z1);
    },
    plant(x, z) {
      box("pot", x - 0.18, 0, z - 0.18, x + 0.18, 0.35, z + 0.18);
      box("plant", x - 0.25, 0.35, z - 0.25, x + 0.25, 0.9, z + 0.25);
    },
    lounger(x0, z0, x1, z1) {
      box("white", x0, 0, z0, x1, 0.3, z1);
      box("white", x0, 0.3, z0, x1, 0.65, z0 + 0.35);
    },
  };
}

// ── The apartment: a 2 BHK, about 11 m × 8.5 m ────────────────────────────────
function apartment() {
  const s = scene();
  const f = furnish(s);
  const { wall, floor } = s;
  // Floors: living and dining, kitchen, two bedrooms, bathroom, balcony.
  floor("wood", 0, 0, 6, 5); // living + dining
  floor("tile", 6, 0, 9, 3.4); // kitchen
  floor("tile", 6, 3.4, 9, 5); // utility / passage
  floor("wood", 0, 5, 4.4, 8.5); // bedroom 1
  floor("wood", 6, 5, 11, 8.5); // bedroom 2 (main)
  floor("tile", 4.4, 5, 6, 8.5); // bathroom
  floor("deck", -1.6, 0.6, 0, 4.4); // balcony
  floor("tile", 9, 0, 11, 5); // entrance and foyer
  // Outer walls, with windows and the balcony door.
  wall(0, 0, 11, 0, [{ at: [1, 3.4], window: true }, { at: [6.6, 8.4], window: true }]);
  wall(0, 0, 0, 8.5, [{ at: [1.4, 3.6] }, { at: [5.8, 7.6], window: true }]);
  wall(0, 8.5, 11, 8.5, [{ at: [1, 3.2], window: true }, { at: [7, 9.8], window: true }]);
  wall(11, 0, 11, 8.5, [{ at: [1.4, 2.5] }, { at: [5.8, 7.8], window: true }]);
  // Inner walls with doorways.
  wall(0, 5, 11, 5, [{ at: [2.6, 3.5] }, { at: [4.8, 5.6] }, { at: [6.4, 7.3] }]);
  wall(6, 0, 6, 3.4, [{ at: [0.6, 1.6] }]);
  wall(9, 0, 9, 5, [{ at: [3.6, 4.6] }]);
  wall(4.4, 5, 4.4, 8.5);
  wall(6, 5, 6, 8.5);
  // Balcony railing.
  s.box("glass", -1.6, 0, 0.6, -1.55, 1.0, 4.4);
  // Living and dining.
  f.rug(0.6, 0.8, 3.6, 3.4);
  f.sofa(0.5, 2.9, 3.7, 3.8);
  f.table(1.4, 1.6, 2.8, 2.3, 0.42);
  f.tv(0.6, 0.15, 3.6, 0.6);
  f.table(4.1, 1.3, 5.6, 2.4);
  for (const [x, z] of [[4.5, 1.0], [5.2, 1.0], [4.5, 2.7], [5.2, 2.7]]) f.chair(x, z);
  f.plant(5.6, 4.5);
  // Kitchen.
  f.counter(6.1, 0.1, 8.9, 0.7);
  f.counter(8.3, 0.7, 8.9, 2.6);
  f.fridge(6.15, 2.6);
  // Bedroom 1.
  f.bed(0.5, 6.4, 2.1, 8.4, false);
  f.wardrobe(3.6, 5.1, 4.3, 6.9);
  // Main bedroom.
  f.bed(7.6, 5.1, 9.4, 7.2, true);
  f.wardrobe(10.3, 5.6, 10.9, 7.9);
  f.rug(7.2, 7.2, 9.8, 8.3);
  // Bathroom.
  f.toilet(5.0, 8.1);
  f.basin(4.5, 5.1, 5.3, 5.6);
  f.shower(4.5, 6.3, 5.9, 7.4);
  // Balcony.
  f.plant(-1.2, 1.0);
  f.plant(-1.2, 4.0);
  f.lounger(-1.45, 1.8, -0.35, 3.4);
  return s.boxes;
}

// ── The villa: 3 bedrooms, open living, a garden and a pool ───────────────────
function villa() {
  const s = scene();
  const f = furnish(s);
  const { wall, floor } = s;
  floor("grass", -1.5, -5, 15.5, 11.5, -0.06); // the plot
  floor("stone", 0, 0, 14, 10, -0.01); // the house, just under the room floors so they don't flicker
  floor("wood", 0, 0, 8, 6); // living + dining
  floor("tile", 8, 0, 14, 4); // kitchen
  floor("wood", 0, 6, 4.5, 10); // bedroom 1
  floor("wood", 4.5, 6, 9, 10); // bedroom 2
  floor("wood", 10.5, 4, 14, 10); // main bedroom
  floor("tile", 9, 6, 10.5, 10); // bathroom
  floor("deck", 0, -4, 8, 0); // terrace
  s.box("stone", 9, -0.05, -4.2, 15, 0, -0.6); // pool deck
  s.box("water", 9.5, -0.04, -3.8, 14.5, 0.01, -1.0); // pool
  wall(0, 0, 14, 0, [{ at: [0.8, 3.6] }, { at: [4.4, 7.2], window: true }, { at: [9, 12.5], window: true }]);
  wall(0, 0, 0, 10, [{ at: [1.2, 4.6], window: true }, { at: [7, 9], window: true }]);
  wall(0, 10, 14, 10, [{ at: [1, 3.5], window: true }, { at: [5.2, 8.2], window: true }, { at: [11, 13.4], window: true }]);
  wall(14, 0, 14, 10, [{ at: [1, 3], window: true }, { at: [5.5, 8.5], window: true }]);
  wall(0, 6, 9, 6, [{ at: [2.8, 3.7] }, { at: [6.6, 7.5] }]);
  wall(8, 0, 8, 4, [{ at: [1.4, 2.6] }]);
  wall(8, 4, 14, 4, [{ at: [8.8, 9.9] }, { at: [11.6, 12.6] }]);
  wall(4.5, 6, 4.5, 10);
  wall(9, 6, 9, 10, [{ at: [6.6, 7.5] }]);
  wall(10.5, 4, 10.5, 10, [{ at: [7.2, 8.1] }]);
  // Living and dining.
  f.rug(0.8, 1.5, 4.4, 4.6);
  f.sofa(0.6, 4.4, 4.6, 5.4);
  f.sofa(4.6, 1.4, 5.5, 4.6, "fabricWarm");
  f.table(1.8, 2.4, 3.4, 3.4, 0.42);
  f.tv(0.6, 0.15, 4.6, 0.6);
  f.table(5.9, 1.2, 7.6, 3.4);
  for (const [x, z] of [[6.4, 0.9], [7.1, 0.9], [6.4, 3.7], [7.1, 3.7]]) f.chair(x, z);
  f.plant(7.6, 5.5);
  // Kitchen.
  f.counter(8.1, 0.1, 13.9, 0.7);
  f.counter(10, 1.8, 12.4, 2.6);
  f.fridge(13.2, 3.2);
  // Bedrooms.
  f.bed(0.8, 7.9, 2.6, 9.9, false);
  f.wardrobe(3.8, 6.1, 4.4, 7.8);
  f.bed(5.6, 7.9, 7.4, 9.9, false);
  f.wardrobe(8.3, 6.1, 8.9, 7.8);
  f.bed(11.4, 6.4, 13.4, 8.6, true);
  f.wardrobe(10.6, 9.3, 12.6, 9.9);
  // Bathroom.
  f.toilet(9.4, 9.6);
  f.basin(9.1, 6.1, 10.4, 6.6);
  f.shower(9.1, 7.6, 10.4, 8.8);
  // Terrace and pool.
  f.table(2.4, -2.8, 4.4, -1.6);
  for (const [x, z] of [[2.9, -3.2], [3.9, -3.2], [2.9, -1.2], [3.9, -1.2]]) f.chair(x, z);
  f.lounger(9.6, -0.55, 10.6, 1.0 - 1.4);
  f.plant(0.4, -3.6);
  f.plant(7.6, -3.6);
  for (const [x, z] of [[-0.8, 10.8], [14.8, 10.8], [-0.8, 4], [14.8, 4.5]]) f.plant(x, z);
  return s.boxes;
}

// ── glTF 2.0 binary writer ─────────────────────────────────────────────────────
const FACES = [
  // normal, then the four corners as (x?, y?, z?) picks of min (0) or max (1)
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
  [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function glb(boxes, name) {
  // Centre the model on the origin, standing on y = 0.
  const xs = boxes.flatMap((b) => [b[1], b[4]]);
  const zs = boxes.flatMap((b) => [b[3], b[6]]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const byMaterial = new Map();
  for (const b of boxes) {
    if (!byMaterial.has(b[0])) byMaterial.set(b[0], []);
    byMaterial.get(b[0]).push(b);
  }
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const materials = [];
  const push = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };
  for (const [mName, list] of byMaterial) {
    const pos = [];
    const nor = [];
    const idx = [];
    for (const [, x0, y0, z0, x1, y1, z1] of list) {
      const P = [[x0 - cx, x1 - cx], [y0, y1], [z0 - cz, z1 - cz]];
      for (const [n, corners] of FACES) {
        const base = pos.length / 3;
        for (const c of corners) {
          pos.push(P[0][c[0]], P[1][c[1]], P[2][c[2]]);
          nor.push(...n);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const positions = new Float32Array(pos);
    const min = [0, 1, 2].map((a) => Math.min(...pos.filter((_, i) => i % 3 === a)));
    const max = [0, 1, 2].map((a) => Math.max(...pos.filter((_, i) => i % 3 === a)));
    const big = positions.length / 3 > 65535;
    const indices = big ? new Uint32Array(idx) : new Uint16Array(idx);
    const pv = push(positions, 34962);
    const nv = push(new Float32Array(nor), 34962);
    const iv = push(indices, 34963);
    accessors.push({ bufferView: pv, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max });
    accessors.push({ bufferView: nv, componentType: 5126, count: nor.length / 3, type: "VEC3" });
    accessors.push({ bufferView: iv, componentType: big ? 5125 : 5123, count: idx.length, type: "SCALAR" });
    const m = MATERIALS[mName];
    materials.push({
      name: mName,
      // glTF colours are linear; the palette above is written as screen (sRGB) colours.
      pbrMetallicRoughness: { baseColorFactor: [...m.color.map(toLinear), m.alpha ?? 1], metallicFactor: 0, roughnessFactor: m.rough },
      ...(m.alpha ? { alphaMode: "BLEND", doubleSided: true } : {}),
    });
    const a = accessors.length - 3;
    meshes.push({ name: mName, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: materials.length - 1 }] });
  }
  const json = {
    asset: { version: "2.0", generator: "trustbrick scripts/make-sample-models.mjs" },
    scene: 0,
    scenes: [{ name, nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })),
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const bin = Buffer.concat(chunks);
  let jsonBytes = Buffer.from(JSON.stringify(json));
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBytes.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonBytes, bh, bin]);
}

mkdirSync("public/models", { recursive: true });
for (const [file, build, name] of [
  ["apartment-2bhk.glb", apartment, "2 BHK apartment"],
  ["villa-3bhk.glb", villa, "3 bedroom villa"],
]) {
  const boxes = build();
  const out = glb(boxes, name);
  writeFileSync(`public/models/${file}`, out);
  console.log(`public/models/${file}: ${boxes.length} boxes, ${(out.length / 1024).toFixed(0)} KB`);
}
