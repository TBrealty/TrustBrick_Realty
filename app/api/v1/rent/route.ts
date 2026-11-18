import { apiRoute } from "@/lib/api/http";
import { rentOnline } from "@/lib/services/rent/common";
import { chargesForTenancy } from "@/lib/services/rent/payments";
import { tenantTenancies } from "@/lib/services/rent/tenancies";

/**
 * The tenant's rent: each tenancy with what's due and what's been paid. `online` says whether rent
 * can be paid here now; when it's false, a due charge is shown without a Pay button.
 */
export const GET = apiRoute("v1.rent", { auth: "user" }, async ({ person }) => {
  const [tenancies, online] = await Promise.all([tenantTenancies(person!.userId), rentOnline()]);
  return { online, tenancies: await Promise.all(tenancies.map(async (t) => ({ ...t, charges: await chargesForTenancy(t.referenceId) }))) };
});
