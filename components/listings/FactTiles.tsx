import type { Icon } from "@phosphor-icons/react";
import {
  Armchair,
  Baby,
  Barbell,
  Bathtub,
  Bed,
  Bell,
  BowlFood,
  Broom,
  Buildings,
  CalendarBlank,
  CalendarCheck,
  Car,
  Certificate,
  CheckCircle,
  Clock,
  Cigarette,
  Compass,
  Confetti,
  CookingPot,
  CornersOut,
  Desk,
  Door,
  Dresser,
  Drop,
  Elevator,
  FireExtinguisher,
  FirstAidKit,
  ForkKnife,
  FrameCorners,
  GenderIntersex,
  Info,
  Key,
  Laptop,
  Lightning,
  Lock,
  MapTrifold,
  Medal,
  Moon,
  Oven,
  PaintRoller,
  PawPrint,
  Plant,
  Polygon,
  RoadHorizon,
  Ruler,
  Scroll,
  SealCheck,
  SecurityCamera,
  SelectionAll,
  ShieldCheck,
  SignIn,
  SignOut,
  Snowflake,
  Stairs,
  Sun,
  SwimmingPool,
  TShirt,
  Television,
  UserPlus,
  Users,
  Vault,
  Wallet,
  WashingMachine,
  WifiHigh,
} from "@phosphor-icons/react/ssr";

/**
 * A listing's facts as tiles: an icon, a label and a value, four across (two on a phone), in
 * small labelled groups. And its amenities, each with an icon. Phosphor icons, light weight.
 */

export type FactItem = [label: string, value: string];

const FACT_ICONS: Record<string, Icon> = {
  Bedrooms: Bed,
  Bathrooms: Bathtub,
  Balconies: Plant,
  "Carpet area": Ruler,
  "Built-up area": FrameCorners,
  "Super built-up area": SelectionAll,
  "Plot area": MapTrifold,
  Furnishing: Armchair,
  Floor: Stairs,
  Facing: Compass,
  "Covered parking": Car,
  Grade: Medal,
  "Fit-out": PaintRoller,
  Workstations: Desk,
  Zoning: Polygon,
  "Road width": RoadHorizon,
  "Corner plot": CornersOut,
  "Year built": CalendarBlank,
  "Security deposit": Vault,
  Maintenance: Wallet,
  "Available from": CalendarCheck,
  Project: Buildings,
  Status: SealCheck,
  Possession: Key,
  "RERA registration": Certificate,
  // Stays
  "Guests get": Door,
  Sleeps: Bed,
  "Check-in": SignIn,
  "Check-out": SignOut,
  "Stay length": Moon,
  Booking: Lightning,
  Pets: PawPrint,
  Smoking: Cigarette,
  "Parties and events": Confetti,
  "Weekend nights": Sun,
  // PGs
  For: GenderIntersex,
  Meals: ForkKnife,
  Food: BowlFood,
  "Rooms / beds": Users,
  "Notice period": Bell,
  "Lock-in": Lock,
  Ownership: Scroll,
  "Entry by": Clock,
  Visitors: UserPlus,
};

const AMENITY_ICONS: Record<string, Icon> = {
  children_play_area: Baby,
  clubhouse: Confetti,
  covered_parking: Car,
  gym: Barbell,
  lift: Elevator,
  power_backup: Lightning,
  swimming_pool: SwimmingPool,
  hot_water: Drop,
  housekeeping: Broom,
  laundry: TShirt,
  study_table: Desk,
  wifi: WifiHigh,
  cctv: SecurityCamera,
  fire_safety: FireExtinguisher,
  first_aid: FirstAidKit,
  gated_security: ShieldCheck,
  workspace: Laptop,
  kitchen: CookingPot,
  self_check_in: Key,
  tv: Television,
  washing_machine: WashingMachine,
  air_conditioning: Snowflake,
  modular_kitchen: Oven,
  wardrobes: Dresser,
};

/** Facts as tiles, four across (two on a phone); empty cells keep the grid's lines even. */
export function FactTiles({ facts }: { facts: FactItem[] }) {
  const fillers = (4 - (facts.length % 4)) % 4;
  const fillersOnPhone = facts.length % 2;
  return (
    <dl className="grid grid-cols-2 gap-px border border-line-light bg-line-light sm:grid-cols-4">
      {facts.map(([label, value]) => {
        const I = FACT_ICONS[label] ?? Info;
        return (
          <div key={label} className="flex flex-col gap-2 bg-paper px-3.5 pt-3.5 pb-3">
            <I size={24} weight="light" aria-hidden className="text-brick" />
            <div>
              <dt className="text-[0.8125rem] text-stone-deep">{label}</dt>
              <dd className="text-[0.9375rem] font-medium">{value}</dd>
            </div>
          </div>
        );
      })}
      {Array.from({ length: fillers }, (_, i) => (
        <div key={`f${i}`} aria-hidden className={`bg-paper ${i < fillersOnPhone ? "" : "hidden sm:block"}`} />
      ))}
    </dl>
  );
}

/**
 * Tiles in small labelled groups (Size, Building, …). Empty groups are left out. When a group would
 * hold a single fact, or there are only a few facts, headings don't help: it's one grid instead.
 */
export function FactGroups({ groups }: { groups: { title: string; facts: FactItem[] }[] }) {
  const shown = groups.filter((g) => g.facts.length > 0);
  const all = shown.flatMap((g) => g.facts);
  if (shown.length <= 1 || all.length <= 6 || shown.some((g) => g.facts.length === 1)) {
    return <FactTiles facts={all} />;
  }
  return (
    <div className="mt-2 space-y-6">
      {shown.map((g) => (
          <div key={g.title}>
            <p className="eyebrow mb-2.5 text-stone-deep">{g.title}</p>
            <FactTiles facts={g.facts} />
          </div>
        ))}
    </div>
  );
}

/** Amenities, four across (two on a phone), each with its icon. */
export function AmenityList({ amenities }: { amenities: { code: string; name: string }[] }) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4">
      {amenities.map((a) => {
        const I = AMENITY_ICONS[a.code] ?? CheckCircle;
        return (
          <li key={a.code} className="flex items-center gap-2.5 text-[0.9375rem]">
            <I size={22} weight="light" aria-hidden className="shrink-0 text-brick" />
            {a.name}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Sorts a listing's facts into groups, leaving out what the strip under the title already shows.
 * Anything not named in a group goes under "More".
 */
export function groupFacts(facts: FactItem[], shownAbove: string[], project: FactItem[] = []): { title: string; facts: FactItem[] }[] {
  const skip = new Set(shownAbove);
  const left = facts.filter(([l]) => !skip.has(l));
  const take = (labels: string[]) => {
    const out = left.filter(([l]) => labels.includes(l));
    for (const f of out) left.splice(left.indexOf(f), 1);
    return out;
  };
  const size = take(["Bedrooms", "Bathrooms", "Balconies", "Carpet area", "Built-up area", "Super built-up area", "Plot area", "Furnishing"]);
  const building = take(["Floor", "Facing", "Covered parking", "Year built", "Grade", "Fit-out", "Workstations", "Zoning", "Road width", "Corner plot"]);
  const costs = take(["Security deposit", "Maintenance", "Available from"]);
  return [
    { title: "Size", facts: size },
    { title: "Building", facts: building },
    { title: "Costs and availability", facts: costs },
    { title: "Project", facts: project.filter(([l]) => !skip.has(l)) },
    { title: "More", facts: left },
  ];
}
