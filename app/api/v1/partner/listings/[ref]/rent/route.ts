import { apiRoute } from "@/lib/api/http";
import { can } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { rentListing } from "@/lib/services/rent/common";
import { landlordPanel } from "@/lib/services/rent/landlords";
import { currentTenancy } from "@/lib/services/rent/tenancies";

/** A rented property's landlord and tenancy, for the agent: who the landlord is, how far they've got, and the tenancy. */
export const GET = apiRoute<{ ref: string }>("v1.partner.listing_rent", { auth: "user" }, async ({ actor, params }) => {
  const a = await actor();
  const permission = can(a, "landlords.invite") ? "landlords.invite" : can(a, "tenancies.manage") ? "tenancies.manage" : null;
  if (!permission) throw new AppError("FORBIDDEN");
  const listing = await rentListing(a, params.ref, permission);
  const [panel, tenancy] = await Promise.all([landlordPanel(listing.propertyId), currentTenancy(listing.propertyId)]);
  return { listing: { referenceId: listing.referenceId, title: listing.title, price: listing.price }, ...panel, tenancy, can: { invite: can(a, "landlords.invite"), tenancy: can(a, "tenancies.manage") } };
});
