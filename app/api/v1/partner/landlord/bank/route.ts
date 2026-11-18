import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { saveLandlordBankAccount } from "@/lib/services/rent/landlords";

/** Where the landlord's rent goes: `{ method: "bank", holderName, accountNumber, confirmAccountNumber, ifsc }` or `{ method: "upi", holderName, vpa }`. */
export const PUT = apiRoute("v1.partner.landlord_bank", { auth: "user" }, async ({ actor, request, requestContext }) =>
  saveLandlordBankAccount(await actor(), await readJson(request, z.record(z.string(), z.unknown())), requestContext),
);
