import type { TourSummary } from "@/lib/tours/terms";

/**
 * Listing shapes shared by the website and the mobile app. Plain types only: no server code,
 * so the app can import this file.
 */

/** Everything a listing card needs. Plain JSON, so it can cross to client components. */
export type ListingSummary = {
  id: string;
  referenceId: string;
  propertyId: string;
  title: string;
  transactionType: "sale" | "rent" | "lease" | "pg" | "stay";
  status: string;
  price: number;
  priceNegotiable: boolean;
  /** A current offer (expired offers are never returned). */
  offer: { title: string; details: string | null; validUntil: string | null } | null;
  depositAmount: number | null;
  declaredMonthlyRent: number | null;
  availableFrom: string | null;
  isSample: boolean;
  publishedAt: string | null;
  typeCode: string;
  typeName: string;
  category: string;
  locality: string;
  city: string | null;
  carpetAreaSqft: number | null;
  plotAreaSqyd: number | null;
  lifecycleStatus: string;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string | null;
  projectName: string | null;
  projectStatus: string | null;
  possessionDate: string | null;
  genderPolicy: "men" | "women" | "any" | null;
  meals: string | null;
  foodPreference: string | null;
  occupancies: string[];
  image: string | null;
  /** What the virtual tour has, or null for none. Opening it takes Plus; knowing it's there doesn't. */
  tour: TourSummary | null;
  /** Homestays only. */
  stay: { spaceType: "entire_home" | "private_room"; maxGuests: number; beds: number; instantBook: boolean; petsAllowed: boolean; cleaningFee: number | null } | null;
};
