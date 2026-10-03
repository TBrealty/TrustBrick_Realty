import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { leadScope, listingScope, visitScope } from "@/lib/authz/scope";
import { db } from "@/lib/db";
import { type Bucket, type DateRange, istDate } from "@/lib/range";

/**
 * Dashboards are computed in the database: COUNT with FILTER, GROUP BY and indexed date
 * ranges. Nothing loads rows into memory to count them. When these queries get slow at scale,
 * the same shapes move onto a daily metrics table without changing callers.
 */

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

export type Series = { bucket: string; count: number }[];
export type Comparison = { current: number; previous: number };

const BUCKET_INTERVAL: Record<Bucket, string> = { hour: "1 hour", day: "1 day", week: "1 week", month: "1 month" };

/** New rows per bucket, IST-aligned, with empty buckets filled as zero. */
async function series(table: SQL, extra: SQL, range: DateRange): Promise<Series> {
  const bucket = sql.raw(`'${range.bucket}'`);
  const step = BUCKET_INTERVAL[range.bucket];
  const { rows } = await db.execute(sql`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${bucket}, ${range.from}::timestamptz AT TIME ZONE 'Asia/Kolkata'),
        date_trunc(${bucket}, (${range.to}::timestamptz - interval '1 microsecond') AT TIME ZONE 'Asia/Kolkata'),
        ${step}::interval) AS b
    ), counts AS (
      SELECT date_trunc(${bucket}, t.created_at AT TIME ZONE 'Asia/Kolkata') AS b, count(*)::int AS c
        FROM ${table} t
       WHERE t.created_at >= ${range.from} AND t.created_at < ${range.to} AND ${extra}
       GROUP BY 1
    )
    SELECT to_char(buckets.b, 'YYYY-MM-DD"T"HH24:MI') AS bucket, coalesce(counts.c, 0) AS count
      FROM buckets LEFT JOIN counts ON counts.b = buckets.b ORDER BY buckets.b`);
  return (rows as Row[]).map((r) => ({ bucket: String(r.bucket), count: n(r.count) }));
}

const between = (column: SQL, from: Date, to: Date) => sql`${column} >= ${from} AND ${column} < ${to}`;

// ── Platform ─────────────────────────────────────────────────────────────────

export type PlatformDashboard = {
  totals: {
    users: number;
    activeUsers: number;
    suspendedUsers: number;
    agents: number;
    activeAgents: number;
    pendingAgents: number;
    suspendedAgents: number;
    organizations: number;
    activeOrganizations: number;
    pendingOrganizations: number;
    suspendedOrganizations: number;
    properties: number;
    verifiedProperties: number;
    unverifiedProperties: number;
    listings: number;
    liveListings: number;
    pendingListings: number;
    liveOnVerifiedProperties: number;
    liveOnUnverifiedProperties: number;
    reportedListings: number;
    openReports: number;
    leads: number;
    openLeads: number;
    visits: number;
    upcomingVisits: number;
    openCases: { listing: number; agent: number; organization: number };
  };
  period: Record<"users" | "agents" | "organizations" | "properties" | "listings" | "published" | "leads" | "visits", Comparison>;
  fixedPeriods: { propertiesToday: number; propertiesThisWeek: number; propertiesThisMonth: number; usersToday: number; usersThisWeek: number; usersThisMonth: number };
  series: Record<"users" | "agents" | "organizations" | "properties" | "listings", Series>;
  breakdown: {
    purpose: { key: string; count: number }[];
    category: { key: string; count: number }[];
    development: { newDevelopment: number; resale: number };
    states: { name: string; count: number }[];
    cities: { name: string; count: number }[];
    localities: { name: string; city: string | null; count: number }[];
  };
  agentActivity: {
    leadsInPeriod: number;
    convertedInPeriod: number;
    visitsScheduledInPeriod: number;
    mostActive: { referenceId: string; name: string; listingsCreated: number; leads: number; visits: number }[];
  };
  sample: { listings: number; organizations: number; properties: number };
  staff: { admins: number; suspendedAdmins: number; pendingInvitations: number } | null;
};

export async function platformDashboard(actor: Actor, range: DateRange, options: { excludeSample: boolean }): Promise<PlatformDashboard> {
  assertCan(actor, "dashboard.view", "platform");
  const ex = options.excludeSample;
  const lSample = ex ? sql`NOT l.is_sample` : sql`TRUE`;
  const pSample = ex ? sql`p.source <> 'sample'` : sql`TRUE`;
  const oSample = ex ? sql`NOT o.is_sample` : sql`TRUE`;
  const { from, to, previous } = range;

  // Fixed windows the brief asks for ("added today / this week / this month"), independent of the selected range.
  const todayIst = istDate(new Date());
  const todayStart = new Date(`${todayIst}T00:00:00+05:30`);
  // Weeks start on Monday. The weekday comes from the IST calendar date, not the UTC instant.
  const weekday = new Date(`${todayIst}T00:00:00Z`).getUTCDay();
  const weekStart = new Date(todayStart.getTime() - ((weekday + 6) % 7) * 86_400_000);
  const monthStart = new Date(`${todayIst.slice(0, 7)}-01T00:00:00+05:30`);

  const [users, agents, orgs, props, listings, crm, cases, fixed] = await Promise.all([
    db.execute(sql`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE status = 'active' AND EXISTS (SELECT 1 FROM identity.sessions s WHERE s.user_id = u.id AND s.updated_at > now() - interval '30 days')) AS active,
             count(*) FILTER (WHERE status = 'suspended') AS suspended,
             count(*) FILTER (WHERE ${between(sql`u.created_at`, from, to)}) AS cur,
             count(*) FILTER (WHERE ${between(sql`u.created_at`, previous.from, previous.to)}) AS prev
        FROM identity.users u`),
    db.execute(sql`
      SELECT count(*) AS total, count(*) FILTER (WHERE status = 'active') AS active, count(*) FILTER (WHERE status = 'pending') AS pending,
             count(*) FILTER (WHERE status = 'suspended') AS suspended,
             count(*) FILTER (WHERE ${between(sql`created_at`, from, to)}) AS cur,
             count(*) FILTER (WHERE ${between(sql`created_at`, previous.from, previous.to)}) AS prev
        FROM orgs.agent_profiles`),
    db.execute(sql`
      SELECT count(*) AS total, count(*) FILTER (WHERE o.status = 'active') AS active, count(*) FILTER (WHERE o.status = 'pending') AS pending,
             count(*) FILTER (WHERE o.status = 'suspended') AS suspended, count(*) FILTER (WHERE o.is_sample) AS sample,
             count(*) FILTER (WHERE ${between(sql`o.created_at`, from, to)}) AS cur,
             count(*) FILTER (WHERE ${between(sql`o.created_at`, previous.from, previous.to)}) AS prev
        FROM orgs.organizations o WHERE o.org_type NOT IN ('internal', 'personal') AND o.deleted_at IS NULL AND ${oSample}`),
    db.execute(sql`
      SELECT count(*) AS total, count(*) FILTER (WHERE p.verification_status = 'verified') AS verified,
             count(*) FILTER (WHERE p.verification_status <> 'verified') AS unverified, count(*) FILTER (WHERE p.source = 'sample') AS sample,
             count(*) FILTER (WHERE ${between(sql`p.created_at`, from, to)}) AS cur,
             count(*) FILTER (WHERE ${between(sql`p.created_at`, previous.from, previous.to)}) AS prev
        FROM real_estate.properties p WHERE p.deleted_at IS NULL AND ${pSample}`),
    db.execute(sql`
      SELECT count(*) AS total, count(*) FILTER (WHERE l.status = 'published') AS live,
             count(*) FILTER (WHERE l.status IN ('submitted', 'under_review')) AS pending,
             count(*) FILTER (WHERE l.status = 'published' AND p.verification_status = 'verified') AS live_verified,
             count(*) FILTER (WHERE l.status = 'published' AND p.verification_status <> 'verified') AS live_unverified,
             count(*) FILTER (WHERE l.is_sample) AS sample,
             count(DISTINCT l.id) FILTER (WHERE EXISTS (SELECT 1 FROM trust.reports r WHERE r.listing_id = l.id AND r.status = 'open')) AS reported,
             count(*) FILTER (WHERE ${between(sql`l.created_at`, from, to)}) AS cur,
             count(*) FILTER (WHERE ${between(sql`l.created_at`, previous.from, previous.to)}) AS prev,
             count(*) FILTER (WHERE ${between(sql`l.published_at`, from, to)} AND l.status = 'published') AS pub_cur,
             count(*) FILTER (WHERE ${between(sql`l.published_at`, previous.from, previous.to)} AND l.status = 'published') AS pub_prev
        FROM marketplace.listings l JOIN real_estate.properties p ON p.id = l.property_id
       WHERE l.deleted_at IS NULL AND ${lSample}`),
    db.execute(sql`
      SELECT (SELECT count(*) FROM crm.leads WHERE deleted_at IS NULL) AS leads,
             (SELECT count(*) FROM crm.leads WHERE deleted_at IS NULL AND status NOT IN ('converted', 'lost')) AS open_leads,
             (SELECT count(*) FROM crm.leads WHERE ${between(sql`created_at`, from, to)}) AS leads_cur,
             (SELECT count(*) FROM crm.leads WHERE ${between(sql`created_at`, previous.from, previous.to)}) AS leads_prev,
             (SELECT count(*) FROM crm.leads WHERE ${between(sql`created_at`, from, to)} AND status = 'converted') AS converted_cur,
             (SELECT count(*) FROM crm.visits) AS visits,
             (SELECT count(*) FROM crm.visits WHERE status IN ('requested', 'scheduled') AND coalesce(scheduled_at, requested_for) >= now()) AS upcoming,
             (SELECT count(*) FROM crm.visits WHERE ${between(sql`created_at`, from, to)}) AS visits_cur,
             (SELECT count(*) FROM crm.visits WHERE ${between(sql`created_at`, previous.from, previous.to)}) AS visits_prev,
             (SELECT count(*) FROM crm.visits WHERE status IN ('scheduled', 'completed', 'no_show') AND ${between(sql`scheduled_at`, from, to)}) AS scheduled_cur,
             (SELECT count(*) FROM trust.reports WHERE status = 'open') AS open_reports`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE case_type = 'listing_review') AS listing,
             count(*) FILTER (WHERE case_type = 'agent_application') AS agent,
             count(*) FILTER (WHERE case_type = 'organization_verification') AS organization
        FROM trust.review_cases WHERE status IN ('open', 'in_review')`),
    db.execute(sql`
      SELECT (SELECT count(*) FROM real_estate.properties p WHERE p.deleted_at IS NULL AND ${pSample} AND p.created_at >= ${todayStart}) AS p_today,
             (SELECT count(*) FROM real_estate.properties p WHERE p.deleted_at IS NULL AND ${pSample} AND p.created_at >= ${weekStart}) AS p_week,
             (SELECT count(*) FROM real_estate.properties p WHERE p.deleted_at IS NULL AND ${pSample} AND p.created_at >= ${monthStart}) AS p_month,
             (SELECT count(*) FROM identity.users WHERE created_at >= ${todayStart}) AS u_today,
             (SELECT count(*) FROM identity.users WHERE created_at >= ${weekStart}) AS u_week,
             (SELECT count(*) FROM identity.users WHERE created_at >= ${monthStart}) AS u_month`),
  ]);

  const u = users.rows[0] as Row;
  const a = agents.rows[0] as Row;
  const o = orgs.rows[0] as Row;
  const p = props.rows[0] as Row;
  const l = listings.rows[0] as Row;
  const c = crm.rows[0] as Row;
  const k = cases.rows[0] as Row;
  const f = fixed.rows[0] as Row;

  const liveScope = sql`l.status = 'published' AND l.deleted_at IS NULL AND ${lSample}`;
  const [seriesUsers, seriesAgents, seriesOrgs, seriesProps, seriesListings, purpose, category, development, places, activity, staff] = await Promise.all([
    series(sql`identity.users`, sql`TRUE`, range),
    series(sql`orgs.agent_profiles`, sql`TRUE`, range),
    series(sql`orgs.organizations`, ex ? sql`t.org_type NOT IN ('internal', 'personal') AND NOT t.is_sample` : sql`t.org_type NOT IN ('internal', 'personal')`, range),
    series(sql`real_estate.properties`, ex ? sql`t.source <> 'sample'` : sql`TRUE`, range),
    series(sql`marketplace.listings`, ex ? sql`NOT t.is_sample` : sql`TRUE`, range),
    db.execute(sql`SELECT l.transaction_type AS key, count(*)::int AS count FROM marketplace.listings l WHERE ${liveScope} GROUP BY 1 ORDER BY 2 DESC`),
    db.execute(sql`
      SELECT pt.category AS key, count(*)::int AS count FROM marketplace.listings l
        JOIN real_estate.properties p ON p.id = l.property_id JOIN real_estate.property_types pt ON pt.id = p.property_type_id
       WHERE ${liveScope} GROUP BY 1 ORDER BY 2 DESC`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE p.lifecycle_status IN ('planned', 'under_construction'))::int AS new_development,
             count(*) FILTER (WHERE p.lifecycle_status NOT IN ('planned', 'under_construction'))::int AS resale
        FROM marketplace.listings l JOIN real_estate.properties p ON p.id = l.property_id
       WHERE ${liveScope} AND l.transaction_type = 'sale'`),
    db.execute(sql`
      SELECT state.name AS state, city.name AS city, loc.name AS locality, count(*)::int AS count
        FROM marketplace.listings l
        JOIN real_estate.properties p ON p.id = l.property_id
        JOIN geography.addresses a ON a.id = p.address_id
        JOIN geography.places loc ON loc.id = a.place_id
        LEFT JOIN geography.places city ON city.id = loc.parent_id
        LEFT JOIN geography.places state ON state.id = city.parent_id
       WHERE ${liveScope}
       GROUP BY GROUPING SETS ((state.name), (state.name, city.name), (state.name, city.name, loc.name))`),
    db.execute(sql`
      SELECT * FROM (
        SELECT ap.reference_id, u.name,
               (SELECT count(*) FROM marketplace.listing_agents la JOIN marketplace.listings l ON l.id = la.listing_id
                 WHERE la.agent_user_id = u.id AND ${between(sql`l.created_at`, from, to)})::int AS listings_created,
               (SELECT count(*) FROM crm.leads ld WHERE ld.agent_user_id = u.id AND ${between(sql`ld.created_at`, from, to)})::int AS leads,
               (SELECT count(*) FROM crm.visits v WHERE v.agent_user_id = u.id AND ${between(sql`v.created_at`, from, to)})::int AS visits
          FROM orgs.agent_profiles ap JOIN identity.users u ON u.id = ap.user_id
         WHERE ap.status = 'active'
      ) activity
      ORDER BY listings_created + leads + visits DESC, name LIMIT 8`),
    can(actor, "admins.view", "platform")
      ? db.execute(sql`
          SELECT (SELECT count(*) FROM orgs.admin_profiles) AS admins,
                 (SELECT count(*) FROM orgs.admin_profiles ad JOIN orgs.memberships m ON m.id = ad.membership_id WHERE m.status = 'suspended') AS suspended,
                 (SELECT count(*) FROM orgs.admin_invitations WHERE status = 'pending' AND expires_at > now()) AS pending`)
      : Promise.resolve(null),
  ]);

  const placeRows = places.rows as Row[];
  const top = <T,>(items: T[], count = 10) => items.slice(0, count);
  const dev = development.rows[0] as Row;
  const s = staff?.rows[0] as Row | undefined;

  return {
    totals: {
      users: n(u.total),
      activeUsers: n(u.active),
      suspendedUsers: n(u.suspended),
      agents: n(a.total),
      activeAgents: n(a.active),
      pendingAgents: n(a.pending),
      suspendedAgents: n(a.suspended),
      organizations: n(o.total),
      activeOrganizations: n(o.active),
      pendingOrganizations: n(o.pending),
      suspendedOrganizations: n(o.suspended),
      properties: n(p.total),
      verifiedProperties: n(p.verified),
      unverifiedProperties: n(p.unverified),
      listings: n(l.total),
      liveListings: n(l.live),
      pendingListings: n(l.pending),
      liveOnVerifiedProperties: n(l.live_verified),
      liveOnUnverifiedProperties: n(l.live_unverified),
      reportedListings: n(l.reported),
      openReports: n(c.open_reports),
      leads: n(c.leads),
      openLeads: n(c.open_leads),
      visits: n(c.visits),
      upcomingVisits: n(c.upcoming),
      openCases: { listing: n(k.listing), agent: n(k.agent), organization: n(k.organization) },
    },
    period: {
      users: { current: n(u.cur), previous: n(u.prev) },
      agents: { current: n(a.cur), previous: n(a.prev) },
      organizations: { current: n(o.cur), previous: n(o.prev) },
      properties: { current: n(p.cur), previous: n(p.prev) },
      listings: { current: n(l.cur), previous: n(l.prev) },
      published: { current: n(l.pub_cur), previous: n(l.pub_prev) },
      leads: { current: n(c.leads_cur), previous: n(c.leads_prev) },
      visits: { current: n(c.visits_cur), previous: n(c.visits_prev) },
    },
    fixedPeriods: {
      propertiesToday: n(f.p_today),
      propertiesThisWeek: n(f.p_week),
      propertiesThisMonth: n(f.p_month),
      usersToday: n(f.u_today),
      usersThisWeek: n(f.u_week),
      usersThisMonth: n(f.u_month),
    },
    series: { users: seriesUsers, agents: seriesAgents, organizations: seriesOrgs, properties: seriesProps, listings: seriesListings },
    breakdown: {
      purpose: (purpose.rows as Row[]).map((r) => ({ key: String(r.key), count: n(r.count) })),
      category: (category.rows as Row[]).map((r) => ({ key: String(r.key), count: n(r.count) })),
      development: { newDevelopment: n(dev.new_development), resale: n(dev.resale) },
      states: top(placeRows.filter((r) => r.state && r.city === null).map((r) => ({ name: String(r.state), count: n(r.count) })).sort((x, y) => y.count - x.count)),
      cities: top(placeRows.filter((r) => r.city && r.locality === null).map((r) => ({ name: String(r.city), count: n(r.count) })).sort((x, y) => y.count - x.count)),
      localities: top(
        placeRows.filter((r) => r.locality).map((r) => ({ name: String(r.locality), city: (r.city as string) ?? null, count: n(r.count) })).sort((x, y) => y.count - x.count),
      ),
    },
    agentActivity: {
      leadsInPeriod: n(c.leads_cur),
      convertedInPeriod: n(c.converted_cur),
      visitsScheduledInPeriod: n(c.scheduled_cur),
      mostActive: (activity.rows as Row[])
        .map((r) => ({ referenceId: String(r.reference_id), name: String(r.name), listingsCreated: n(r.listings_created), leads: n(r.leads), visits: n(r.visits) }))
        .filter((r) => r.listingsCreated + r.leads + r.visits > 0),
    },
    sample: { listings: n(l.sample), organizations: n(o.sample), properties: n(p.sample) },
    staff: s ? { admins: n(s.admins), suspendedAdmins: n(s.suspended), pendingInvitations: n(s.pending) } : null,
  };
}

// ── Professional (agent, team lead, broker admin) ────────────────────────────

export type ProfessionalDashboard = {
  listings: { total: number; live: number; pending: number; drafts: number; changesRequested: number; rejected: number; archived: number; addedThisMonth: number };
  leads: { newInPeriod: Comparison; open: number; byStatus: { status: string; count: number }[]; convertedInPeriod: number };
  visits: { upcoming: number; requested: number; completedInPeriod: number };
  engagement: { views: Comparison; uniqueViewers: number; saves: number };
  series: { views: Series; leads: Series };
  needsAttention: { referenceId: string; title: string; status: string; reason: string | null }[];
  topListings: { referenceId: string; title: string; views: number; leads: number }[];
};

export async function professionalDashboard(actor: Actor, range: DateRange): Promise<ProfessionalDashboard> {
  assertCan(actor, "dashboard.view");
  const { from, to, previous } = range;
  const scoped = listingScope(actor, "listings.view");
  const leadsScoped = leadScope(actor, "leads.view");
  const visitsScoped = visitScope(actor, "visits.view");
  const monthStart = new Date(`${istDate(new Date()).slice(0, 7)}-01T00:00:00+05:30`);
  const fromDay = istDate(from);
  const toDay = istDate(to);
  const prevFromDay = istDate(previous.from);

  const [listings, leads, byStatus, visits, engagement, attention, topListings, viewSeries, leadSeries] = await Promise.all([
    db.execute(sql`
      SELECT count(*) AS total, count(*) FILTER (WHERE l.status = 'published') AS live,
             count(*) FILTER (WHERE l.status IN ('submitted', 'under_review', 'approved')) AS pending,
             count(*) FILTER (WHERE l.status IN ('draft', 'withdrawn')) AS drafts,
             count(*) FILTER (WHERE l.status = 'changes_requested') AS changes,
             count(*) FILTER (WHERE l.status = 'rejected') AS rejected,
             count(*) FILTER (WHERE l.status IN ('archived', 'removed', 'unpublished', 'expired')) AS archived,
             count(*) FILTER (WHERE l.created_at >= ${monthStart}) AS this_month
        FROM marketplace.listings l WHERE l.deleted_at IS NULL AND ${scoped}`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE ${between(sql`ld.created_at`, from, to)}) AS cur,
             count(*) FILTER (WHERE ${between(sql`ld.created_at`, previous.from, previous.to)}) AS prev,
             count(*) FILTER (WHERE ld.status NOT IN ('converted', 'lost')) AS open,
             count(*) FILTER (WHERE ld.status = 'converted' AND ${between(sql`ld.updated_at`, from, to)}) AS converted
        FROM crm.leads ld WHERE ld.deleted_at IS NULL AND ${leadsScoped}`),
    db.execute(sql`SELECT ld.status, count(*)::int AS count FROM crm.leads ld WHERE ld.deleted_at IS NULL AND ${leadsScoped} GROUP BY 1`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE v.status = 'scheduled' AND v.scheduled_at >= now()) AS upcoming,
             count(*) FILTER (WHERE v.status = 'requested') AS requested,
             count(*) FILTER (WHERE v.status = 'completed' AND ${between(sql`v.scheduled_at`, from, to)}) AS completed
        FROM crm.visits v WHERE ${visitsScoped}`),
    db.execute(sql`
      SELECT coalesce(sum(vw.view_count) FILTER (WHERE vw.viewed_on >= ${fromDay}::date AND vw.viewed_on < ${toDay}::date), 0) AS cur,
             coalesce(sum(vw.view_count) FILTER (WHERE vw.viewed_on >= ${prevFromDay}::date AND vw.viewed_on < ${fromDay}::date), 0) AS prev,
             count(DISTINCT vw.viewer_key) FILTER (WHERE vw.viewed_on >= ${fromDay}::date AND vw.viewed_on < ${toDay}::date) AS unique_viewers,
             (SELECT count(*) FROM marketplace.saved_properties sp JOIN marketplace.listings l ON l.property_id = sp.property_id
               WHERE l.deleted_at IS NULL AND ${scoped}) AS saves
        FROM marketplace.listing_views vw JOIN marketplace.listings l ON l.id = vw.listing_id WHERE ${scoped}`),
    db.execute(sql`
      SELECT l.reference_id, l.title, l.status, l.status_reason FROM marketplace.listings l
       WHERE l.deleted_at IS NULL AND ${scoped} AND l.status IN ('changes_requested', 'rejected', 'paused', 'unpublished', 'draft')
       ORDER BY (l.status IN ('changes_requested', 'rejected')) DESC, l.updated_at DESC LIMIT 6`),
    db.execute(sql`
      SELECT l.reference_id, l.title,
             (SELECT coalesce(sum(view_count), 0) FROM marketplace.listing_views vw WHERE vw.listing_id = l.id
               AND vw.viewed_on >= ${fromDay}::date AND vw.viewed_on < ${toDay}::date)::int AS views,
             (SELECT count(*) FROM crm.leads ld WHERE ld.listing_id = l.id AND ${between(sql`ld.created_at`, from, to)})::int AS leads
        FROM marketplace.listings l WHERE l.deleted_at IS NULL AND l.status = 'published' AND ${scoped}
       ORDER BY views DESC, leads DESC LIMIT 5`),
    db.execute(sql`
      WITH days AS (SELECT generate_series(${fromDay}::date, ${toDay}::date - 1, interval '1 day')::date AS d)
      SELECT to_char(days.d, 'YYYY-MM-DD"T"00:00') AS bucket,
             coalesce((SELECT sum(vw.view_count) FROM marketplace.listing_views vw JOIN marketplace.listings l ON l.id = vw.listing_id
                        WHERE vw.viewed_on = days.d AND ${scoped}), 0)::int AS count
        FROM days ORDER BY days.d`),
    series(sql`crm.leads`, sql`t.deleted_at IS NULL AND t.id IN (SELECT ld.id FROM crm.leads ld WHERE ${leadsScoped})`, range),
  ]);

  const L = listings.rows[0] as Row;
  const D = leads.rows[0] as Row;
  const V = visits.rows[0] as Row;
  const E = engagement.rows[0] as Row;
  return {
    listings: {
      total: n(L.total),
      live: n(L.live),
      pending: n(L.pending),
      drafts: n(L.drafts),
      changesRequested: n(L.changes),
      rejected: n(L.rejected),
      archived: n(L.archived),
      addedThisMonth: n(L.this_month),
    },
    leads: {
      newInPeriod: { current: n(D.cur), previous: n(D.prev) },
      open: n(D.open),
      byStatus: (byStatus.rows as Row[]).map((r) => ({ status: String(r.status), count: n(r.count) })),
      convertedInPeriod: n(D.converted),
    },
    visits: { upcoming: n(V.upcoming), requested: n(V.requested), completedInPeriod: n(V.completed) },
    engagement: { views: { current: n(E.cur), previous: n(E.prev) }, uniqueViewers: n(E.unique_viewers), saves: n(E.saves) },
    series: {
      views: range.bucket === "hour" ? [] : (viewSeries.rows as Row[]).map((r) => ({ bucket: String(r.bucket), count: n(r.count) })),
      leads: leadSeries,
    },
    needsAttention: (attention.rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), title: String(r.title), status: String(r.status), reason: (r.status_reason as string) ?? null })),
    topListings: (topListings.rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), title: String(r.title), views: n(r.views), leads: n(r.leads) })),
  };
}

// ── Per-listing performance (the agent's Performance page) ────────────────────

export type ListingPerformance = {
  referenceId: string;
  title: string;
  status: string;
  views: number;
  uniqueViewers: number;
  leads: number;
  visits: number;
  saves: number;
};

/** Engagement per listing in the actor's scope, for the range. Bounded to 200 rows, busiest first. */
export async function listingPerformance(actor: Actor, range: DateRange): Promise<ListingPerformance[]> {
  assertCan(actor, "analytics.view");
  const fromDay = istDate(range.from);
  const toDay = istDate(range.to);
  const { rows } = await db.execute(sql`
    SELECT l.reference_id, l.title, l.status,
           coalesce(v.views, 0)::int AS views, coalesce(v.uniq, 0)::int AS unique_viewers,
           (SELECT count(*) FROM crm.leads ld WHERE ld.listing_id = l.id AND ${between(sql`ld.created_at`, range.from, range.to)})::int AS leads,
           (SELECT count(*) FROM crm.visits vs WHERE vs.listing_id = l.id AND ${between(sql`vs.created_at`, range.from, range.to)})::int AS visits,
           (SELECT count(*) FROM marketplace.saved_properties sp WHERE sp.property_id = l.property_id)::int AS saves
      FROM marketplace.listings l
      LEFT JOIN (
        SELECT listing_id, sum(view_count) AS views, count(DISTINCT viewer_key) AS uniq
          FROM marketplace.listing_views WHERE viewed_on >= ${fromDay}::date AND viewed_on < ${toDay}::date GROUP BY listing_id
      ) v ON v.listing_id = l.id
     WHERE l.deleted_at IS NULL AND l.status IN ('published', 'paused', 'unpublished', 'withdrawn') AND ${listingScope(actor, "listings.view")}
     ORDER BY views DESC, leads DESC LIMIT 200`);
  return (rows as Row[]).map((r) => ({
    referenceId: String(r.reference_id),
    title: String(r.title),
    status: String(r.status),
    views: n(r.views),
    uniqueViewers: n(r.unique_viewers),
    leads: n(r.leads),
    visits: n(r.visits),
    saves: n(r.saves),
  }));
}
