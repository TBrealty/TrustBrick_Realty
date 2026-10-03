// Reference data: permissions and role templates, property types, amenities, platform
// settings and a starter set of places. Real, non-sample data; idempotent, safe to run in
// any environment.
//
//   npm run db:seed:reference
//
// The permission catalogue is imported from the TypeScript source of truth, which is why
// the npm script runs Node with --experimental-strip-types.
import pg from "pg";
import { v7 as uuidv7 } from "uuid";
import { PERMISSIONS, ROLES } from "../../lib/authz/catalog.ts";

try {
  process.loadEnvFile(".env.local");
} catch {}

const SALE_RENT_LEASE = ["sale", "rent", "lease"];
// Homes that can also be offered as homestays.
const HOME = ["sale", "rent", "lease", "stay"];

// [code, name, category, sort order, purposes the onboarding wizard offers it for]
export const PROPERTY_TYPES = [
  ["apartment", "Apartment", "residential", 10, HOME],
  ["independent_house", "Independent house", "residential", 20, HOME],
  ["villa", "Villa", "residential", 30, HOME],
  ["builder_floor", "Builder floor", "residential", 40, HOME],
  ["farmhouse", "Farmhouse", "residential", 45, ["sale", "stay"]],
  ["studio", "Studio apartment", "residential", 50, ["sale", "rent", "stay"]],
  ["office", "Office space", "commercial", 60, SALE_RENT_LEASE],
  ["retail", "Shop / retail", "commercial", 70, SALE_RENT_LEASE],
  ["showroom", "Showroom", "commercial", 72, SALE_RENT_LEASE],
  ["warehouse", "Warehouse", "commercial", 80, SALE_RENT_LEASE],
  ["industrial", "Industrial shed", "commercial", 82, SALE_RENT_LEASE],
  ["coworking", "Co-working space", "commercial", 84, ["rent", "lease"]],
  ["commercial_other", "Other commercial", "commercial", 88, SALE_RENT_LEASE],
  // Plots (sold in square yards) appear under Buy as well as Invest.
  ["residential_plot", "Plot", "land", 90, ["sale"]],
  ["open_plot", "Open plot", "land", 92, ["sale"]],
  ["commercial_plot", "Commercial land", "land", 100, ["sale", "lease"]],
  ["agricultural_land", "Agricultural land", "land", 110, ["sale", "lease"]],
  ["industrial_land", "Industrial land", "land", 112, ["sale", "lease"]],
  ["land_other", "Other land", "land", 118, ["sale", "lease"]],
  ["pg", "PG", "co_living", 120, ["pg"]],
  ["co_living", "Co-living", "co_living", 122, ["pg"]],
  ["hostel", "Hostel", "co_living", 124, ["pg"]],
];

// Defaults only: an existing value, set by a SuperAdmin, is never overwritten.
export const SYSTEM_SETTINGS = {
  "agents.applications_open": true,
  "stays.host_applications_open": true,
};

export const AMENITIES = [
  ["lift", "Lift", "building", 10],
  ["power_backup", "Power backup", "building", 20],
  ["covered_parking", "Covered parking", "building", 30],
  ["gym", "Gym", "building", 40],
  ["swimming_pool", "Swimming pool", "building", 50],
  ["clubhouse", "Clubhouse", "building", 60],
  ["children_play_area", "Children's play area", "building", 70],
  ["gated_security", "Gated security", "safety", 80],
  ["cctv", "CCTV", "safety", 90],
  ["fire_safety", "Fire safety", "safety", 100],
  ["modular_kitchen", "Modular kitchen", "unit", 110],
  ["air_conditioning", "Air conditioning", "unit", 120],
  ["wardrobes", "Wardrobes", "unit", 130],
  ["wifi", "Wi-Fi", "pg", 140],
  ["laundry", "Laundry", "pg", 150],
  ["housekeeping", "Housekeeping", "pg", 160],
  ["hot_water", "Hot water", "pg", 170],
  ["study_table", "Study table", "pg", 180],
  ["tv", "TV", "stay", 200],
  ["washing_machine", "Washing machine", "stay", 210],
  ["workspace", "Dedicated workspace", "stay", 220],
  ["self_check_in", "Self check-in", "stay", 230],
  ["kitchen", "Kitchen guests can use", "stay", 240],
  ["first_aid", "First aid kit", "safety", 250],
];

// Approximate locality centroids [lat, lng] and a representative PIN code.
export const PLACES = {
  country: { slug: "in", name: "India" },
  states: [
    {
      slug: "telangana",
      name: "Telangana",
      cities: [
        {
          slug: "hyderabad",
          name: "Hyderabad",
          centroid: [17.385, 78.4867],
          localities: [
            ["gachibowli", "Gachibowli", 17.4401, 78.3489, "500032"],
            ["kondapur", "Kondapur", 17.47, 78.357, "500084"],
            ["madhapur", "Madhapur", 17.4483, 78.3915, "500081"],
            ["kukatpally", "Kukatpally", 17.4948, 78.3996, "500072"],
            ["kokapet", "Kokapet", 17.399, 78.331, "500075"],
          ],
        },
      ],
    },
    {
      slug: "karnataka",
      name: "Karnataka",
      cities: [
        {
          slug: "bengaluru",
          name: "Bengaluru",
          centroid: [12.9716, 77.5946],
          localities: [
            ["whitefield", "Whitefield", 12.9698, 77.75, "560066"],
            ["hsr_layout", "HSR Layout", 12.9121, 77.6446, "560102"],
            ["indiranagar", "Indiranagar", 12.9784, 77.6408, "560038"],
            ["electronic_city", "Electronic City", 12.8452, 77.6602, "560100"],
            ["sarjapur_road", "Sarjapur Road", 12.91, 77.687, "560035"],
          ],
        },
      ],
    },
    {
      slug: "maharashtra",
      name: "Maharashtra",
      cities: [
        {
          slug: "pune",
          name: "Pune",
          centroid: [18.5204, 73.8567],
          localities: [
            ["baner", "Baner", 18.559, 73.7868, "411045"],
            ["hinjewadi", "Hinjewadi", 18.5913, 73.7389, "411057"],
            ["kharadi", "Kharadi", 18.5515, 73.9348, "411014"],
            ["wakad", "Wakad", 18.5989, 73.765, "411057"],
          ],
        },
        {
          slug: "mumbai",
          name: "Mumbai",
          centroid: [19.076, 72.8777],
          localities: [
            ["powai", "Powai", 19.1176, 72.906, "400076"],
            ["andheri_west", "Andheri West", 19.1364, 72.8296, "400053"],
            ["goregaon_east", "Goregaon East", 19.1646, 72.8493, "400063"],
            ["chembur", "Chembur", 19.0522, 72.9005, "400071"],
          ],
        },
      ],
    },
    {
      slug: "goa",
      name: "Goa",
      cities: [
        {
          slug: "north_goa",
          name: "North Goa",
          centroid: [15.5, 73.83],
          localities: [
            ["calangute", "Calangute", 15.5439, 73.7553, "403516"],
            ["anjuna", "Anjuna", 15.5736, 73.7407, "403509"],
            ["candolim", "Candolim", 15.5183, 73.7627, "403515"],
            ["panaji", "Panaji", 15.4909, 73.8278, "403001"],
          ],
        },
      ],
    },
  ],
};

const point = (lat, lng) => `SRID=4326;POINT(${lng} ${lat})`;

async function upsertPlace(client, { parentId, placeType, name, slug, path, centroid }) {
  const { rows } = await client.query(
    `INSERT INTO geography.places (id, parent_id, place_type, name, slug, path, centroid)
     VALUES ($1, $2, $3, $4, $5, $6::ltree, $7::geography)
     ON CONFLICT (path) DO UPDATE SET name = EXCLUDED.name, centroid = EXCLUDED.centroid, updated_at = now()
     RETURNING id`,
    [uuidv7(), parentId, placeType, name, slug, path, centroid ? point(...centroid) : null],
  );
  return rows[0].id;
}

async function seedAuthorization(client) {
  const codes = Object.keys(PERMISSIONS);
  for (const [code, def] of Object.entries(PERMISSIONS)) {
    await client.query(
      `INSERT INTO orgs.permissions (code, domain, description, is_platform) VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET domain = EXCLUDED.domain, description = EXCLUDED.description, is_platform = EXCLUDED.is_platform`,
      [code, def.domain, def.description, def.platform],
    );
  }
  // Permissions removed from the catalogue stop existing everywhere (grants cascade).
  await client.query(`DELETE FROM orgs.permissions WHERE NOT (code = ANY($1::text[]))`, [codes]);

  let sortOrder = 0;
  for (const [code, role] of Object.entries(ROLES)) {
    const { rows } = await client.query(
      `INSERT INTO orgs.roles (id, organization_id, code, name, description, workspace, sort_order)
       VALUES ($1, NULL, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT roles_org_code_unique
       DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, workspace = EXCLUDED.workspace,
                     sort_order = EXCLUDED.sort_order, updated_at = now()
       RETURNING id`,
      [uuidv7(), code, role.name, role.description, role.workspace, (sortOrder += 10)],
    );
    // Template grants are replaced wholesale, so the catalogue is always exactly what runs.
    await client.query(`DELETE FROM orgs.role_permissions WHERE role_id = $1`, [rows[0].id]);
    for (const [permission, scope] of Object.entries(role.grants)) {
      await client.query(`INSERT INTO orgs.role_permissions (role_id, permission_code, scope) VALUES ($1, $2, $3)`, [rows[0].id, permission, scope]);
    }
  }
  return { permissions: codes.length, roles: Object.keys(ROLES).length };
}

export async function seedReference(client) {
  const authorization = await seedAuthorization(client);
  for (const [code, name, category, sortOrder, purposes] of PROPERTY_TYPES) {
    await client.query(
      `INSERT INTO real_estate.property_types (id, code, name, category, sort_order, purposes) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, sort_order = EXCLUDED.sort_order,
                                        purposes = EXCLUDED.purposes`,
      [uuidv7(), code, name, category, sortOrder, purposes],
    );
  }
  for (const [key, value] of Object.entries(SYSTEM_SETTINGS)) {
    await client.query(`INSERT INTO platform.system_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING`, [key, JSON.stringify(value)]);
  }
  for (const [code, name, category, sortOrder] of AMENITIES) {
    await client.query(
      `INSERT INTO real_estate.amenities (id, code, name, category, sort_order) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, sort_order = EXCLUDED.sort_order`,
      [uuidv7(), code, name, category, sortOrder],
    );
  }

  const countryId = await upsertPlace(client, { parentId: null, placeType: "country", name: PLACES.country.name, slug: "in", path: "in" });
  let localities = 0;
  for (const state of PLACES.states) {
    const statePath = `in.${state.slug}`;
    const stateId = await upsertPlace(client, { parentId: countryId, placeType: "state", name: state.name, slug: state.slug, path: statePath });
    for (const city of state.cities) {
      const cityPath = `${statePath}.${city.slug}`;
      const cityId = await upsertPlace(client, { parentId: stateId, placeType: "city", name: city.name, slug: city.slug, path: cityPath, centroid: city.centroid });
      for (const [slug, name, lat, lng] of city.localities) {
        await upsertPlace(client, { parentId: cityId, placeType: "locality", name, slug, path: `${cityPath}.${slug}`, centroid: [lat, lng] });
        localities++;
      }
    }
  }
  return { ...authorization, propertyTypes: PROPERTY_TYPES.length, amenities: AMENITIES.length, localities };
}

// Run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("reference.mjs")) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const counts = await seedReference(client);
    await client.query("COMMIT");
    console.log("reference data ready:", counts);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
