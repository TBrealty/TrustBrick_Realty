import { apiRoute } from "@/lib/api/http";
import { unseal } from "@/lib/crypto/sealed";
import { rentReceipt } from "@/lib/services/rent/payments";

/** A rent receipt (RPY-) for the tenant who paid, with the landlord's PAN for HRA. */
export const GET = apiRoute<{ ref: string }>("v1.rent.receipt", { auth: "user" }, async ({ params, person }) => rentReceipt(person!.userId, params.ref, unseal));
