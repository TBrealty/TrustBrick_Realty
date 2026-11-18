import { assertCan } from "@/lib/authz";
import { apiRoute } from "@/lib/api/http";
import { landlordRentTotals, landlordSettlements } from "@/lib/services/rent/payments";

/** Rent received: each rent paid and when it reached the landlord's bank, with totals. */
export const GET = apiRoute("v1.partner.landlord_settlements", { auth: "user" }, async ({ actor }) => {
  const a = await actor();
  assertCan(a, "rent.receive");
  const [rows, totals] = await Promise.all([landlordSettlements(a.userId), landlordRentTotals(a.userId)]);
  return { rows, totals };
});
