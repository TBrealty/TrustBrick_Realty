// 360° tours for seeded listings (sample-listings.mjs, dev-workspaces.mjs): one panorama per room,
// served from /public/images/tour like the home page's try-it tour. The room photos are CC0 from
// Poly Haven (public/images/tour/CREDITS.md). Each panorama is one media row, shared by every
// listing that shows it, the way the sample photos are.

const PANO = (file, room) => ({ key: `/images/tour/${file}.jpg`, thumb: `/images/tour/${file}-640.jpg`, room });

export const PANORAMAS = {
  living: [PANO("living-wooden", "Living room"), PANO("living-lythwood", "Living room"), PANO("living-cayley", "Living room")],
  bedroom: [PANO("bedroom-hotel", "Bedroom"), PANO("bedroom-lythwood", "Bedroom"), PANO("bedroom-seaview", "Main bedroom")],
  kitchen: [PANO("kitchen-kiara", "Kitchen and dining")],
  bathroom: [PANO("bathroom-ensuite", "Bathroom")],
  glasshouse: [PANO("glasshouse-360", "Living area with the view")],
  empty: [PANO("empty-house", "Hall")],
};

/** "Dollhouse" 3D models, made by scripts/make-sample-models.mjs. */
export const MODELS = {
  apartment: { key: "/models/apartment-2bhk.glb", name: "2 BHK apartment, 3D model.glb" },
  villa: { key: "/models/villa-3bhk.glb", name: "Villa with garden and pool, 3D model.glb" },
};

const all = Object.values(PANORAMAS).flat();

/** Media rows for every panorama, created or refreshed; returns their ids by key. */
export async function panoramaMedia(q) {
  const ids = {};
  for (const p of all) {
    const variants = JSON.stringify([
      { width: 640, key: p.thumb },
      { width: 4096, key: p.key },
    ]);
    const { rows } = await q(
      `INSERT INTO real_estate.media (id, storage_key, storage_provider, media_type, mime_type, width, height, alt_text, variants)
       VALUES (gen_random_uuid(), $1, 'public', 'panorama', 'image/jpeg', 4096, 2048, $2, $3::jsonb)
       ON CONFLICT (storage_key) DO UPDATE SET media_type = 'panorama', alt_text = EXCLUDED.alt_text, variants = EXCLUDED.variants, updated_at = now()
       RETURNING id`,
      [p.key, p.room, variants],
    );
    ids[p.key] = rows[0].id;
  }
  for (const m of Object.values(MODELS)) {
    const { rows } = await q(
      `INSERT INTO real_estate.media (id, storage_key, storage_provider, media_type, mime_type, original_filename, alt_text)
       VALUES (gen_random_uuid(), $1, 'public', 'model_3d', 'model/gltf-binary', $2, '3D model')
       ON CONFLICT (storage_key) DO UPDATE SET media_type = 'model_3d', original_filename = EXCLUDED.original_filename, updated_at = now()
       RETURNING id`,
      [m.key, m.name],
    );
    ids[m.key] = rows[0].id;
  }
  return ids;
}

/** The 3D model that suits a kind of home, if any: villas and houses get the villa, flats the apartment. */
export function modelFor(kind) {
  if (kind === "villa" || kind === "independent_house") return MODELS.villa;
  if (kind === "apartment" || kind === "builder_floor") return MODELS.apartment;
  return null;
}

/** Adds a 3D model to a property's tour. */
export async function addModel(q, mediaIds, propertyId, model) {
  await q(`INSERT INTO real_estate.media_links (id, media_id, property_id, sort_order) VALUES (gen_random_uuid(), $1, $2, 200)`, [mediaIds[model.key], propertyId]);
}

/** Gives a property a tour: the rooms in order, after its photos. */
export async function addTour(q, mediaIds, propertyId, rooms) {
  for (const [i, p] of rooms.entries()) {
    await q(`INSERT INTO real_estate.media_links (id, media_id, property_id, sort_order) VALUES (gen_random_uuid(), $1, $2, $3)`, [mediaIds[p.key], propertyId, 100 + i]);
  }
}

/** A sensible walk-through for a kind of home, picking rooms with `pick` (the seed's own randomness). */
export function roomsFor(kind, pick) {
  const P = PANORAMAS;
  switch (kind) {
    case "villa":
      return [pick([...P.glasshouse, ...P.living]), pick(P.bedroom), P.kitchen[0], P.bathroom[0]];
    case "independent_house":
      return [P.empty[0], pick(P.living), pick(P.bedroom), P.kitchen[0], P.bathroom[0]];
    case "studio":
      return [pick(P.living), P.bathroom[0]];
    case "pg":
      return [P.bedroom[0], P.bathroom[0]];
    default:
      return [pick(P.living), pick(P.bedroom), P.kitchen[0], P.bathroom[0]];
  }
}
