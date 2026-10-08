import { apiRoute } from "@/lib/api/http";
import { can } from "@/lib/authz";
import { listLeads, listVisits } from "@/lib/services/crm";
import { listingGroupCounts } from "@/lib/services/listings/queries";
import { listBookingsForActor } from "@/lib/services/stays/bookings";
import { listHostConversations } from "@/lib/services/stays/messages";

/**
 * The partner home screen: what needs doing today. Each part appears only when the person's
 * role covers it (an agent sees leads and visits; a host, bookings and guest messages).
 */
export const GET = apiRoute("v1.partner.summary", { auth: "user" }, async ({ actor }) => {
  const a = await actor();
  const professional = a.workspace === "professional";
  const [leadsNew, leadsOpen, visits, bookings, inbox, listings] = await Promise.all([
    can(a, "leads.view") ? listLeads(a, { status: "new", open: false }, 1) : null,
    can(a, "leads.view") ? listLeads(a, { open: true }, 1) : null,
    can(a, "visits.view") ? listVisits(a, { upcoming: true }, 1) : null,
    can(a, "bookings.view") ? listBookingsForActor(a, { group: "requests" }, 1) : null,
    professional && can(a, "bookings.manage") ? listHostConversations(a, { show: "unread" }, 1) : null,
    can(a, "listings.view") ? listingGroupCounts(a) : null,
  ]);
  return {
    workspace: { name: a.organization.name, type: a.organization.orgType, roles: a.roles },
    leads: leadsNew && leadsOpen ? { new: leadsNew.total, open: leadsOpen.total, latest: leadsNew.rows.slice(0, 3) } : null,
    visits: visits ? { upcoming: visits.total, next: visits.rows.slice(0, 5) } : null,
    bookings: bookings ? { counts: bookings.counts, requests: bookings.rows.slice(0, 3) } : null,
    inbox: inbox ? { unread: inbox.unread } : null,
    listings,
  };
});
