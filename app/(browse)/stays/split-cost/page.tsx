import type { Metadata } from "next";
import { ServicePage } from "@/components/navigation/ServicePage";
import { SplitCalculator } from "@/components/stays/SplitCalculator";
import { ToolIntro, numberParam } from "@/components/tools/ToolIntro";
import { SERVICE_SHELLS } from "@/lib/listings/services";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";

export const metadata: Metadata = {
  title: "Split the cost of a home stay — Trustbrick",
  description: "Work out what a home stay costs your group and each person in it, night by night, with weekend prices, the cleaning fee and food and travel.",
};

const shell = SERVICE_SHELLS.stay!;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY = 86_400_000;

/** The first Friday at least a week away: a weekend trip, so weekend prices show up. */
function nextFriday(today: string) {
  let t = Date.parse(`${today}T00:00:00Z`) + 7 * DAY;
  while (new Date(t).getUTCDay() !== 5) t += DAY;
  return new Date(t).toISOString().slice(0, 10);
}

export default async function SplitCostPage({ searchParams }: Props) {
  const q = await searchParams;
  const today = todayInIndia();
  const checkIn = one(q.check_in);
  const nightly = numberParam(q.price, 500, 1_00_000, 6_000);
  const weekend = one(q.weekend) ? numberParam(q.weekend, 500, 1_00_000, nightly) : null;
  const start = {
    nightly,
    weekendPrice: weekend,
    checkIn: checkIn && /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && checkIn >= today ? checkIn : nextFriday(today),
    nights: Math.round(numberParam(q.nights, 1, 30, 2)),
    cleaningFee: numberParam(q.cleaning, 0, 20_000, 1_000),
    people: Math.round(numberParam(q.people, 1, 20, 4)),
    extrasPerPersonPerDay: numberParam(q.extras, 0, 10_000, 0),
  };

  return (
    <ServicePage shell={shell} current="split" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Split the cost" title={<>What&apos;s everyone&apos;s <em>share?</em></>}>
        Put in the stay&apos;s price and your dates to see what the group pays the host, and what that comes to each, night by night, with weekend prices and the cleaning fee.
      </ToolIntro>
      <div className="mt-10">
        <SplitCalculator start={start} today={today} />
      </div>
    </ServicePage>
  );
}
