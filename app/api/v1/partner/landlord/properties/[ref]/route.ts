import { assertCan } from "@/lib/authz";
import { apiRoute } from "@/lib/api/http";
import { notFound } from "@/lib/errors";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { landlordProperties } from "@/lib/services/rent/landlords";
import { chargesForTenancy, landlordSettlements } from "@/lib/services/rent/payments";
import { landlordTenancies } from "@/lib/services/rent/tenancies";

/** One of the landlord's properties (PRP-): proof of ownership, the tenancy, its rent and what's been paid out. */
export const GET = apiRoute<{ ref: string }>("v1.partner.landlord_property", { auth: "user" }, async ({ actor, params }) => {
  const a = await actor();
  assertCan(a, "rent.receive");
  const ref = normalizeReferenceId(params.ref);
  if (!isReferenceId(ref, "PRP")) throw notFound();
  const [[property], tenancies, settlements] = await Promise.all([landlordProperties(a.userId, ref), landlordTenancies(a.userId, ref), landlordSettlements(a.userId, ref, 24)]);
  if (!property) throw notFound();
  const tenancy = tenancies.find((t) => ["pending", "disputed", "active"].includes(t.status)) ?? null;
  return { property, tenancy, charges: tenancy ? await chargesForTenancy(tenancy.referenceId) : [], settlements };
});
