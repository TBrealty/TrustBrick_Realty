import { apiRoute } from "@/lib/api/http";
import { assertCan } from "@/lib/authz";
import { hostPayouts } from "@/lib/services/stays/payments";

/**
 * A host's payouts for stays paid online, as on the website's Payouts page: totals, the payout
 * account (bank and last four digits only), whether this person may change it, and each payout.
 * The account itself is added on the website (bank details and PAN go to the payment provider).
 */
export const GET = apiRoute("v1.partner.payouts", { auth: "user" }, async ({ actor }) => {
  const a = await actor();
  assertCan(a, "commission.view");
  return hostPayouts(a);
});
