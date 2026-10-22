import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import { isListingAction } from "@/lib/listings/lifecycle";
import { transitionListing } from "@/lib/services/listings/lifecycle";

/**
 * Moves a listing along: `{ action, reason?, close? }`. The actions are those `workspace` lists
 * (submit, withdraw, archive, mark sold or rented, mark available again). Marking a sale or
 * rental closed takes `close: { outcome, dealValue?, brokerage? }`.
 */
export const POST = apiRoute<{ ref: string }>("v1.partner.listing_transition", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const input = await readJson(
    request,
    z.object({
      action: z.string(),
      reason: z.string().max(2000).optional(),
      close: z.object({ outcome: z.string().optional(), dealValue: z.unknown().optional(), brokerage: z.unknown().optional() }).optional(),
    }),
  );
  if (!isListingAction(input.action)) throw new AppError("VALIDATION_ERROR", "Unknown action.");
  return transitionListing(await actor(), params.ref, input.action, { reason: input.reason, close: input.close }, requestContext);
});
