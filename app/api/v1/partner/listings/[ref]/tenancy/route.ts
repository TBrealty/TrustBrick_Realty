import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { createTenancy } from "@/lib/services/rent/tenancies";

/**
 * Sets up the tenancy: `{ tenantName, tenantEmail, tenantPhone, monthlyRent, dueDay, deposit,
 * startDate, endDate? }`. Returns the tenant's one-time `url` to share (shown once).
 */
export const POST = apiRoute<{ ref: string }>("v1.partner.tenancy_create", { auth: "user" }, async ({ actor, params, request, requestContext }) =>
  created(await createTenancy(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())), requestContext)),
);
