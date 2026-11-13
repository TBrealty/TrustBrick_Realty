import { apiRoute } from "@/lib/api/http";
import { receiptFor } from "@/lib/services/stays/payments";

/** The receipt for a booking paid online: lines, refunds and the payment's references. 404 until money was taken. */
export const GET = apiRoute<{ ref: string }>("v1.trips.receipt", { auth: "user" }, async ({ params, person }) => receiptFor(person!.userId, params.ref));
