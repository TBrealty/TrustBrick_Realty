import { apiRoute } from "@/lib/api/http";
import { landlordHome } from "@/lib/services/rent/landlords";
import { landlordRentTotals } from "@/lib/services/rent/payments";
import { landlordTenancies } from "@/lib/services/rent/tenancies";

/** The landlord's home: their properties, requests to answer, bank account and PAN, tenancies and rent totals. */
export const GET = apiRoute("v1.partner.landlord", { auth: "user" }, async ({ actor }) => {
  const a = await actor();
  const [home, tenancies, totals] = await Promise.all([landlordHome(a), landlordTenancies(a.userId), landlordRentTotals(a.userId)]);
  return { ...home, tenancies: tenancies.filter((t) => ["pending", "disputed", "active"].includes(t.status)), totals };
});
