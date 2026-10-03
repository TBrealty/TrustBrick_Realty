import type { Metadata } from "next";
import Link from "next/link";
import { ServicePage } from "@/components/navigation/ServicePage";
import { Checklist, type ChecklistGroup } from "@/components/pg/Checklist";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "PG checklist: what to check before you move in — Trustbrick",
  description: "A checklist to take on a PG visit: safety, the room, food, house rules, money and documents. Tick as you go; it's saved on your phone.",
};

const shell = SERVICE_SHELLS.pg!;

const GROUPS: ChecklistGroup[] = [
  {
    title: "Safety",
    items: [
      ["locks", "Locks on your room and your cupboard"],
      ["cctv", "CCTV at the entrance and in common areas"],
      ["fire", "A fire extinguisher and a clear way out"],
      ["staff", "A warden or manager on site", "Ask who is there at night, especially in a PG for women."],
      ["backup", "Power backup for lights and fans"],
      ["route", "A safe, well-lit walk to the bus or metro after dark"],
    ],
  },
  {
    title: "The room",
    items: [
      ["air", "Ventilation and daylight"],
      ["furniture", "The bed, mattress, cupboard and table you were promised"],
      ["water", "Water all day, and hot water"],
      ["bathroom", "How many people share a bathroom"],
      ["clean", "A clean kitchen and dining area"],
    ],
  },
  {
    title: "Food",
    items: [
      ["menu", "The weekly menu"],
      ["timings", "Meal times that fit your day"],
      ["diet", "Vegetarian or non-vegetarian, as you need"],
      ["taste", "A meal tasted before you pay"],
    ],
  },
  {
    title: "House rules",
    items: [
      ["curfew", "Entry and exit times"],
      ["visitors", "The rule on visitors and guests"],
      ["rules", "Rules on cooking, laundry and noise"],
      ["notice", "The notice needed to leave", "Often a month."],
    ],
  },
  {
    title: "Money",
    items: [
      ["includes", "What the rent covers", "Food, electricity, Wi-Fi, laundry and housekeeping: ask which cost extra."],
      ["deposit", "The deposit, and when and how it's refunded", "Often a month's rent."],
      ["lockin", "Any lock-in, or a charge for leaving early"],
      ["written", "A written agreement, or a receipt for every payment"],
      ["payment", "Payment by bank transfer or UPI, not cash"],
    ],
  },
  {
    title: "Documents",
    items: [
      ["id", "A copy of your ID for the owner's records"],
      ["police", "Police verification, where the city asks for it"],
      ["contact", "The owner's or manager's name and number, in writing"],
    ],
  },
];

export default function PgChecklistPage() {
  return (
    <ServicePage shell={shell} current="checklist" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="PG checklist" title={<>Check it <em>before you move in.</em></>}>
        Take this on your visit and tick as you go. Anything you can&apos;t tick is a question for the owner, and anything they won&apos;t answer is worth walking away from.
      </ToolIntro>
      <div className="mt-10">
        <Checklist groups={GROUPS} />
      </div>
      <p className="mt-10 text-[0.9375rem] text-graphite print:hidden">
        Weighing a PG against sharing a flat?{" "}
        <Link href="/pg/compare" className="underline">
          Compare the costs
        </Link>
        .
      </p>
    </ServicePage>
  );
}
