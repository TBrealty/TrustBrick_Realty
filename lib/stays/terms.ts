import "server-only";
import { sql } from "drizzle-orm";

type Row = Record<string, unknown>;

/** A stay's terms as the app reads them, from the columns in STAY_TERM_COLUMNS (`stays.stay_terms st`). */
export type StayTermsView = {
  spaceType: "entire_home" | "private_room";
  maxGuests: number;
  beds: number;
  weekendPrice: number | null;
  cleaningFee: number | null;
  minNights: number;
  maxNights: number;
  checkInTime: string;
  checkOutTime: string;
  instantBook: boolean;
  cancellationPolicy: "flexible" | "moderate" | "strict";
  petsAllowed: boolean;
  smokingAllowed: boolean;
  eventsAllowed: boolean;
  houseRules: string | null;
};

export function stayTermsOf(r: Row): StayTermsView | null {
  if (r.st_space_type === null || r.st_space_type === undefined) return null;
  return {
    spaceType: r.st_space_type as StayTermsView["spaceType"],
    maxGuests: Number(r.st_max_guests),
    beds: Number(r.st_beds),
    weekendPrice: r.st_weekend_price === null ? null : Number(r.st_weekend_price),
    cleaningFee: r.st_cleaning_fee === null ? null : Number(r.st_cleaning_fee),
    minNights: Number(r.st_min_nights),
    maxNights: Number(r.st_max_nights),
    checkInTime: String(r.st_check_in_time),
    checkOutTime: String(r.st_check_out_time),
    instantBook: Boolean(r.st_instant_book),
    cancellationPolicy: r.st_cancellation_policy as StayTermsView["cancellationPolicy"],
    petsAllowed: Boolean(r.st_pets_allowed),
    smokingAllowed: Boolean(r.st_smoking_allowed),
    eventsAllowed: Boolean(r.st_events_allowed),
    houseRules: (r.st_house_rules as string) ?? null,
  };
}

/** Columns for stayTermsOf, from `stays.stay_terms st`. */
export const STAY_TERM_COLUMNS = sql`st.space_type AS st_space_type, st.max_guests AS st_max_guests, st.beds AS st_beds,
  st.weekend_price AS st_weekend_price, st.cleaning_fee AS st_cleaning_fee, st.min_nights AS st_min_nights, st.max_nights AS st_max_nights,
  to_char(st.check_in_time, 'HH24:MI') AS st_check_in_time, to_char(st.check_out_time, 'HH24:MI') AS st_check_out_time,
  st.instant_book AS st_instant_book, st.cancellation_policy AS st_cancellation_policy, st.pets_allowed AS st_pets_allowed,
  st.smoking_allowed AS st_smoking_allowed, st.events_allowed AS st_events_allowed, st.house_rules AS st_house_rules`;

