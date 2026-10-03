/**
 * What a home stay costs a group, and each person in it. Pure functions, shared by server
 * and client. Nights are priced the way Trustbrick prices bookings: Friday and Saturday
 * nights at the weekend price where the host sets one. Festival rates aren't known here;
 * the stay's own page gives the exact price for the dates.
 */

export type SplitInput = {
  nightly: number;
  /** Friday and Saturday nights, if the host charges more. Null means the nightly price. */
  weekendPrice: number | null;
  /** YYYY-MM-DD */
  checkIn: string;
  nights: number;
  cleaningFee: number;
  people: number;
  /** Food and local travel, per person per day. */
  extrasPerPersonPerDay: number;
};

export type SplitResult = {
  checkOut: string;
  weekdayNights: number;
  weekendNights: number;
  stay: number;
  cleaning: number;
  /** The stay and the cleaning fee: what the host is paid. */
  total: number;
  perPerson: number;
  perPersonPerNight: number;
  extrasPerPerson: number;
  /** The stay share plus food and travel. */
  tripPerPerson: number;
};

const DAY = 86_400_000;
const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Friday or Saturday night. */
export const isWeekendNight = (isoDate: string) => {
  const d = new Date(parse(isoDate)).getUTCDay();
  return d === 5 || d === 6;
};

export function splitStay(i: SplitInput): SplitResult {
  const nights = Math.max(1, Math.round(i.nights));
  const people = Math.max(1, Math.round(i.people));
  const start = Number.isNaN(parse(i.checkIn)) ? Date.now() : parse(i.checkIn);
  let weekendNights = 0;
  for (let n = 0; n < nights; n++) if (isWeekendNight(iso(start + n * DAY))) weekendNights++;
  const weekdayNights = nights - weekendNights;
  const weekendRate = i.weekendPrice ?? i.nightly;
  const stay = weekdayNights * i.nightly + weekendNights * weekendRate;
  const cleaning = Math.max(0, i.cleaningFee);
  const total = stay + cleaning;
  const extrasPerPerson = Math.max(0, i.extrasPerPersonPerDay) * nights;
  return {
    checkOut: iso(start + nights * DAY),
    weekdayNights,
    weekendNights,
    stay,
    cleaning,
    total,
    perPerson: total / people,
    perPersonPerNight: total / people / nights,
    extrasPerPerson,
    tripPerPerson: total / people + extrasPerPerson,
  };
}
