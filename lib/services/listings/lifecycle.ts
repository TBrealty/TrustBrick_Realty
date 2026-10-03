import "server-only";
import { type SQL, eq, sql } from "drizzle-orm";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import type { Permission } from "@/lib/authz/catalog";
import { type Tx, db } from "@/lib/db";
import { listingStatusHistory } from "@/lib/db/schema/marketplace";
import { properties } from "@/lib/db/schema/real-estate";
import type { CaseFlags } from "@/lib/db/schema/trust";
import { AppError, conflict, invalid } from "@/lib/errors";
import { CLOSE_OUTCOME_LABELS } from "@/lib/commission/terms";
import { LISTING_ACTIONS, type ListingAction, type ListingStatus, STATUS_LABELS, canTransition } from "@/lib/listings/lifecycle";
import { CLOSE_OUTCOMES, type CloseOutcome } from "@/lib/vocab";
import { type AuditEvent, type RequestContext, audit } from "../audit";
import { chargeClosedDeal, termsGap } from "../commission";
import { notify, notifyPermissionHolders } from "../notifications";
import { type ListingRecord, findListingInScope } from "./access";

type Row = Record<string, unknown>;
const LISTING_LIFETIME_DAYS = 90;

const AUDIT_FOR: Partial<Record<ListingAction, AuditEvent>> = {
  submit: "LISTING_SUBMITTED",
  start_review: "LISTING_REVIEW_STARTED",
  approve: "LISTING_APPROVED",
  reject: "LISTING_REJECTED",
  request_changes: "LISTING_CHANGES_REQUESTED",
  unpublish: "LISTING_UNPUBLISHED",
  republish: "LISTING_REPUBLISHED",
  remove: "LISTING_REMOVED",
  withdraw: "LISTING_WITHDRAWN",
  archive: "LISTING_ARCHIVED",
  mark_closed: "LISTING_CLOSED",
  reopen: "LISTING_REOPENED",
};

/** How a sale or rental was closed, given when it's marked sold or rented out. */
export type CloseInput = { outcome?: string; dealValue?: unknown; brokerage?: unknown };
export type TransitionOptions = { reason?: string; markPropertyVerified?: boolean; close?: CloseInput };

/** Sales, rentals and leases say how they closed: a deal closed by the agent carries Trustbrick's commission. */
const DEAL_PURPOSES = ["sale", "rent", "lease"];
export type TransitionResult = { status: ListingStatus; caseReferenceId?: string };

/**
 * The only way a listing changes status. The action name is looked up in the lifecycle
 * table; permission, scope, current status and reason are all checked here, inside one
 * transaction that also writes history, the review case, notifications and the audit row.
 */
export async function transitionListing(
  actor: Actor,
  referenceId: string,
  action: ListingAction,
  options: TransitionOptions,
  ctx: RequestContext,
): Promise<TransitionResult> {
  const def: (typeof LISTING_ACTIONS)[ListingAction] & { adminPermission?: Permission } = LISTING_ACTIONS[action];
  if (def.side === "system") throw new AppError("FORBIDDEN");
  if (def.side === "moderator") assertCan(actor, def.permission, "platform");
  // Some owner actions (availability) are also open to admins on any listing.
  const asAdmin = def.side === "owner" && def.adminPermission !== undefined && can(actor, def.adminPermission, "platform");

  const reason = options.reason?.trim() || undefined;
  if ("reasonRequired" in def && def.reasonRequired && (!reason || reason.length < 10)) {
    throw invalid("Add a remark of at least 10 characters. The agent will see it.", { reason: "Add a remark of at least 10 characters" });
  }
  if (reason && reason.length > 2000) throw invalid("Keep the reason under 2,000 characters.", { reason: "Keep it under 2,000 characters" });
  if (options.markPropertyVerified) assertCan(actor, "properties.verify", "platform");

  const result = await db.transaction(async (tx) => {
    // Owners act within their own scope; moderators see everything (platform scope checked above).
    const listing = await findListingInScope(actor, referenceId, def.side === "owner" && !asAdmin ? def.permission : "listings.view", { tx, lock: true });
    if (!canTransition(action, listing.status)) {
      throw conflict(`This listing is ${STATUS_LABELS[listing.status].toLowerCase()}, so "${def.label}" isn't available. Refresh to see its current state.`);
    }

    let outcome: CloseOutcome | null = null;
    if (action === "mark_closed" && DEAL_PURPOSES.includes(listing.transactionType)) {
      outcome = (CLOSE_OUTCOMES as readonly string[]).includes(options.close?.outcome ?? "") ? (options.close!.outcome as CloseOutcome) : null;
      if (!outcome) throw invalid("Say how it was closed.", { outcome: "Choose how it was closed" });
    }

    switch (action) {
      case "submit":
        return submit(tx, actor, listing, ctx);
      case "approve":
        return approve(tx, actor, listing, { reason, markPropertyVerified: options.markPropertyVerified }, ctx);
      default: {
        const from = listing.status;
        // The way it closed goes on the history, ahead of any note, so the team can see it at a glance.
        const historyReason = outcome ? [CLOSE_OUTCOME_LABELS[outcome].label, reason].filter(Boolean).join(": ") : reason;
        await setStatus(tx, listing, def.to, action, actor.userId, historyReason);
        if (outcome === "closed_deal") await chargeClosedDeal(tx, actor, listing, options.close, ctx);
        const caseRef = await closeOpenCase(tx, listing.id, action, actor.userId, reason);
        if (["withdraw", "unpublish", "remove", "archive", "mark_closed"].includes(action)) await closePriceHistory(tx, listing.id);
        if (action === "republish" || action === "reopen") {
          await tx.execute(sql`UPDATE marketplace.listings SET published_at = now(), expires_at = now() + ${`${LISTING_LIFETIME_DAYS} days`}::interval
                                WHERE id = ${listing.id}`);
          await openPriceHistory(tx, listing, actor.userId);
        }
        await notifyOwner(tx, listing, action, reason);
        if (asAdmin && listing.primaryAgentUserId && listing.primaryAgentUserId !== actor.userId) {
          await notify(tx, [listing.primaryAgentUserId], {
            type: "listing_updated",
            title: action === "reopen" ? `${listing.referenceId} was marked available again by Trustbrick` : `${listing.referenceId} was marked no longer available by Trustbrick`,
            body: listing.title,
            link: `/properties/${listing.referenceId}`,
          });
        }
        const event = AUDIT_FOR[action];
        if (event) {
          await audit(
            tx,
            actor,
            {
              event,
              target: { type: "listing", id: listing.id, referenceId: listing.referenceId },
              organizationId: listing.organizationId,
              before: { status: from },
              after: { status: def.to },
              metadata: { ...(reason ? { reason } : {}), ...(caseRef ? { case: caseRef } : {}), ...(outcome ? { outcome } : {}) },
            },
            ctx,
          );
        }
        return { status: def.to as ListingStatus, caseReferenceId: caseRef ?? undefined };
      }
    }
  });
  return result;
}

async function setStatus(tx: Tx, listing: ListingRecord, to: ListingStatus, action: string, actorUserId: string | null, reason?: string) {
  const extra: SQL[] = [];
  if (to === "submitted") extra.push(sql`submitted_at = now()`);
  if (to === "published") extra.push(sql`published_at = now()`, sql`expires_at = now() + ${`${LISTING_LIFETIME_DAYS} days`}::interval`);
  const set = sql.join([sql`status = ${to}`, sql`status_reason = ${reason ?? null}`, sql`updated_at = now()`, ...extra], sql`, `);
  const updated = await tx.execute(sql`UPDATE marketplace.listings SET ${set} WHERE id = ${listing.id} AND status = ${listing.status} RETURNING id`);
  if (updated.rows.length !== 1) throw conflict("This listing changed while you were working on it. Refresh and try again.");
  await tx.insert(listingStatusHistory).values({ listingId: listing.id, fromStatus: listing.status, toStatus: to, action, reason: reason ?? null, actorUserId });
  listing.status = to;
}

// ── Submit ────────────────────────────────────────────────────────────────────

export type SubmissionGap = { section: "location" | "details" | "pricing" | "media" | "commission"; message: string };

/** What still has to be filled in before a listing can be submitted. Empty means ready. */
export async function submissionGaps(tx: Tx | typeof db, listingId: string): Promise<SubmissionGap[]> {
  const { rows } = await tx.execute(sql`
    SELECT l.title, l.price, l.transaction_type, l.lease_duration_months, l.organization_id, pt.category,
           EXISTS (SELECT 1 FROM real_estate.residential_attributes x WHERE x.property_id = p.id) AS has_residential,
           EXISTS (SELECT 1 FROM real_estate.commercial_attributes x WHERE x.property_id = p.id) AS has_commercial,
           EXISTS (SELECT 1 FROM real_estate.land_attributes x WHERE x.property_id = p.id) AS has_land,
           EXISTS (SELECT 1 FROM real_estate.pg_attributes x WHERE x.property_id = p.id)
             AND EXISTS (SELECT 1 FROM marketplace.pg_listing_terms t WHERE t.listing_id = l.id) AS has_pg,
           (SELECT count(*) FROM marketplace.pg_room_offers o WHERE o.listing_id = l.id)::int AS rooms,
           EXISTS (SELECT 1 FROM stays.stay_terms st WHERE st.listing_id = l.id) AS has_stay_terms,
           (SELECT count(*) FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
             WHERE ml.property_id = p.id AND m.media_type = 'image' AND NOT m.is_private)::int AS photos,
           a.line1, p.year_built, p.floor_number, p.total_floors, p.ownership_type,
           (SELECT x.facing FROM real_estate.residential_attributes x WHERE x.property_id = p.id) AS facing
      FROM marketplace.listings l
      JOIN real_estate.properties p ON p.id = l.property_id
      JOIN real_estate.property_types pt ON pt.id = p.property_type_id
      JOIN geography.addresses a ON a.id = p.address_id
     WHERE l.id = ${listingId}`);
  const r = rows[0] as Row;
  const gaps: SubmissionGap[] = [];
  if (!r.line1) gaps.push({ section: "location", message: "Add the address" });
  const category = String(r.category);
  const hasDetails =
    (category === "residential" && r.has_residential) ||
    (category === "commercial" && r.has_commercial) ||
    (category === "land" && r.has_land) ||
    (category === "co_living" && r.has_pg);
  if (!hasDetails) gaps.push({ section: "details", message: "Fill in the property details" });
  else {
    // Required since the form asked for them; older drafts may not have them yet.
    const building = category === "residential" || category === "commercial";
    const missing = [
      category !== "land" && r.year_built === null ? "the year built" : null,
      building && (r.floor_number === null || r.total_floors === null) ? "the floor and total floors" : null,
      category === "residential" && r.facing === null ? "the facing" : null,
      r.ownership_type === null ? "the ownership" : null,
    ].filter(Boolean);
    if (missing.length > 0) gaps.push({ section: "details", message: `Add ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}` });
  }
  if (r.transaction_type === "pg") {
    if (Number(r.rooms) === 0) gaps.push({ section: "pricing", message: "Add at least one room type with its rent" });
  } else if (r.transaction_type === "stay") {
    if (r.price === null || !r.has_stay_terms) gaps.push({ section: "pricing", message: "Add the nightly price and house rules" });
  } else if (r.price === null) {
    gaps.push({ section: "pricing", message: "Add the price" });
  }
  if (r.transaction_type === "lease" && !r.lease_duration_months) gaps.push({ section: "pricing", message: "Add the lease term" });
  if (Number(r.photos) === 0) gaps.push({ section: "media", message: "Add at least one photo" });
  const terms = await termsGap(tx, String(r.organization_id));
  if (terms) gaps.push({ section: "commission", message: terms });
  return gaps;
}

async function submit(tx: Tx, actor: Actor, listing: ListingRecord, ctx: RequestContext): Promise<TransitionResult> {
  const gaps = await submissionGaps(tx, listing.id);
  if (gaps.length > 0) {
    throw invalid(`Before submitting: ${gaps.map((g) => g.message.charAt(0).toLowerCase() + g.message.slice(1)).join(", ")}.`);
  }

  const flags: CaseFlags = { duplicates: await findDuplicates(tx, listing), quality: await qualityChecks(tx, listing) };
  const from = listing.status;
  await setStatus(tx, listing, "submitted", "submit", actor.userId);

  const created = await tx.execute(sql`
    INSERT INTO trust.review_cases (id, case_type, listing_id, status, flags, submitted_by)
    VALUES (gen_random_uuid(), 'listing_review', ${listing.id}, 'open', ${JSON.stringify(flags)}::jsonb, ${actor.userId})
    RETURNING id, reference_id`);
  const caseRow = created.rows[0] as Row;
  const caseRef = String(caseRow.reference_id);

  await audit(
    tx,
    actor,
    {
      event: "LISTING_SUBMITTED",
      target: { type: "listing", id: listing.id, referenceId: listing.referenceId },
      organizationId: listing.organizationId,
      before: { status: from },
      after: { status: "submitted" },
      metadata: { case: caseRef, duplicates: flags.duplicates?.length ?? 0, quality: flags.quality?.length ?? 0 },
    },
    ctx,
  );

  // Every listing waits for an admin's decision: there is no automatic approval.
  await notifyPermissionHolders(tx, "listings.approve", {
    type: "listing_submitted",
    title: `${listing.referenceId} is waiting for approval`,
    body: listing.title,
    link: `/approvals/${caseRef}`,
  });
  return { status: "submitted", caseReferenceId: caseRef };
}

// ── Approve and publish ────────────────────────────────────────────────────────

async function publish(tx: Tx, actorUserId: string | null, listing: ListingRecord, action: string, reason?: string) {
  await setStatus(tx, listing, "approved", action, actorUserId, reason);
  await setStatus(tx, listing, "published", "publish", actorUserId);
  await openPriceHistory(tx, listing, actorUserId);
}

async function approve(
  tx: Tx,
  actor: Actor,
  listing: ListingRecord,
  options: { reason?: string; markPropertyVerified?: boolean },
  ctx: RequestContext,
): Promise<TransitionResult> {
  const from = listing.status;
  await publish(tx, actor.userId, listing, "approve", options.reason);
  const caseRef = await closeOpenCase(tx, listing.id, "approve", actor.userId, options.reason);

  const target = { type: "listing", id: listing.id, referenceId: listing.referenceId };
  await audit(tx, actor, { event: "LISTING_APPROVED", target, organizationId: listing.organizationId, before: { status: from }, after: { status: "approved" }, metadata: { case: caseRef, reason: options.reason } }, ctx);
  await audit(tx, actor, { event: "LISTING_PUBLISHED", target, organizationId: listing.organizationId, after: { status: "published" } }, ctx);

  if (options.markPropertyVerified && can(actor, "properties.verify", "platform")) {
    await tx.update(properties).set({ verificationStatus: "verified", updatedAt: new Date() }).where(eq(properties.id, listing.propertyId));
    await audit(tx, actor, { event: "PROPERTY_VERIFIED", target: { type: "property", id: listing.propertyId, referenceId: listing.propertyReferenceId } }, ctx);
  }
  await notifyOwner(tx, listing, "approve", options.reason);
  return { status: "published", caseReferenceId: caseRef ?? undefined };
}

// ── Review cases, price history, notifications ─────────────────────────────────

const CASE_OUTCOME: Partial<Record<ListingAction, string>> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
  withdraw: "withdrawn",
  remove: "rejected",
};

async function closeOpenCase(tx: Tx, listingId: string, action: ListingAction, actorUserId: string, reason?: string): Promise<string | null> {
  if (action === "start_review") {
    const { rows } = await tx.execute(sql`
      UPDATE trust.review_cases SET status = 'in_review', assigned_to = ${actorUserId}, updated_at = now()
       WHERE listing_id = ${listingId} AND status = 'open' RETURNING reference_id`);
    return ((rows[0] as Row | undefined)?.reference_id as string) ?? null;
  }
  const outcome = CASE_OUTCOME[action];
  if (!outcome) return null;
  const { rows } = await tx.execute(sql`
    UPDATE trust.review_cases
       SET status = ${outcome}, decided_by = ${actorUserId}, decided_at = now(), decision_reason = ${reason ?? null}, updated_at = now()
     WHERE listing_id = ${listingId} AND status IN ('open', 'in_review') RETURNING reference_id`);
  return ((rows[0] as Row | undefined)?.reference_id as string) ?? null;
}

/** Opens a price period at the current price, closing the previous one if the price changed. */
export async function openPriceHistory(tx: Tx, listing: ListingRecord, actorUserId: string | null) {
  await tx.execute(sql`
    UPDATE marketplace.listing_prices p SET effective = tstzrange(lower(p.effective), now())
      FROM marketplace.listings l
     WHERE p.listing_id = ${listing.id} AND l.id = p.listing_id AND upper_inf(p.effective) AND p.price <> l.price`);
  await tx.execute(sql`
    INSERT INTO marketplace.listing_prices (id, listing_id, price, effective, changed_by)
    SELECT gen_random_uuid(), l.id, l.price, tstzrange(now(), NULL), ${actorUserId}
      FROM marketplace.listings l
     WHERE l.id = ${listing.id} AND l.price IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM marketplace.listing_prices p WHERE p.listing_id = l.id AND upper_inf(p.effective))`);
}

async function closePriceHistory(tx: Tx, listingId: string) {
  await tx.execute(sql`
    UPDATE marketplace.listing_prices SET effective = tstzrange(lower(effective), greatest(now(), lower(effective)))
     WHERE listing_id = ${listingId} AND upper_inf(effective)`);
}

async function notifyOwner(tx: Tx, listing: ListingRecord, action: ListingAction, reason?: string) {
  const link = `/properties/${listing.referenceId}`;
  const owner = listing.primaryAgentUserId;
  switch (action) {
    case "approve":
      return notify(tx, [owner], { type: "listing_approved", title: `${listing.referenceId} was approved and is live`, body: reason ?? listing.title, link });
    case "reject":
      return notify(tx, [owner], { type: "listing_rejected", title: `${listing.referenceId} was rejected`, body: reason, link });
    case "request_changes":
      return notify(tx, [owner], { type: "listing_changes_requested", title: `Changes requested on ${listing.referenceId}`, body: reason, link });
    case "unpublish":
    case "remove":
      return notify(tx, [owner], {
        type: "listing_paused",
        title: `${listing.referenceId} was ${action === "remove" ? "removed" : "unpublished"} by Trustbrick`,
        body: reason,
        link,
      });
  }
}

// ── Automated checks: informational flags for the moderator ────────────────────

/**
 * Candidate duplicates from several independent signals, so one weak match does not decide
 * anything: same type within 30 m, the same unit in the same building, near-identical address
 * text in the same locality, or an identical photo. Built to be replaced by a scored matcher.
 */
export async function findDuplicates(tx: Tx | typeof db, listing: ListingRecord): Promise<NonNullable<CaseFlags["duplicates"]>> {
  const { rows } = await tx.execute(sql`
    WITH me AS (
      SELECT p.id, p.property_type_id, p.building_id, p.unit_number, p.floor_number, p.carpet_area_sqft, a.location, a.line1, a.place_id
        FROM real_estate.properties p JOIN geography.addresses a ON a.id = p.address_id WHERE p.id = ${listing.propertyId}
    ),
    candidates AS (
      SELECT p2.id AS property_id,
             array_remove(ARRAY[
               CASE WHEN p2.property_type_id = me.property_type_id AND ST_DWithin(a2.location, me.location, 30)
                     AND (me.unit_number IS NULL OR p2.unit_number IS NULL OR lower(p2.unit_number) = lower(me.unit_number))
                     AND (me.carpet_area_sqft IS NULL OR p2.carpet_area_sqft IS NULL
                          OR abs(p2.carpet_area_sqft - me.carpet_area_sqft) <= 0.05 * me.carpet_area_sqft)
                    THEN 'Same type within 30 m' END,
               CASE WHEN me.building_id IS NOT NULL AND p2.building_id = me.building_id AND lower(p2.unit_number) = lower(me.unit_number)
                    THEN 'Same unit in the same building' END,
               CASE WHEN a2.place_id = me.place_id AND similarity(coalesce(a2.line1, ''), coalesce(me.line1, '')) > 0.6
                     AND p2.property_type_id = me.property_type_id
                    THEN 'Very similar address in the same locality' END,
               CASE WHEN EXISTS (
                      SELECT 1 FROM real_estate.media_links ml1 JOIN real_estate.media m1 ON m1.id = ml1.media_id
                        JOIN real_estate.media m2 ON m2.checksum = m1.checksum
                        JOIN real_estate.media_links ml2 ON ml2.media_id = m2.id
                       WHERE ml1.property_id = me.id AND ml2.property_id = p2.id AND m1.checksum IS NOT NULL)
                    THEN 'Uses an identical photo' END
             ], NULL) AS reasons
        FROM me
        JOIN real_estate.properties p2 ON p2.id <> me.id AND p2.deleted_at IS NULL
        JOIN geography.addresses a2 ON a2.id = p2.address_id
       WHERE ST_DWithin(a2.location, me.location, 2000) OR p2.building_id = me.building_id
    )
    SELECT l2.reference_id, l2.title, c.reasons
      FROM candidates c
      JOIN LATERAL (SELECT reference_id, title FROM marketplace.listings x
                     WHERE x.property_id = c.property_id AND x.deleted_at IS NULL AND x.status NOT IN ('archived', 'removed')
                     ORDER BY x.created_at DESC LIMIT 1) l2 ON true
     WHERE cardinality(c.reasons) > 0
     ORDER BY cardinality(c.reasons) DESC
     LIMIT 5`);
  return (rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), title: String(r.title), reasons: r.reasons as string[] }));
}

export async function qualityChecks(tx: Tx | typeof db, listing: ListingRecord): Promise<NonNullable<CaseFlags["quality"]>> {
  const { rows } = await tx.execute(sql`
    SELECT l.description, l.price, l.transaction_type, l.rera_id, p.carpet_area_sqft, p.lifecycle_status, pt.category,
           (SELECT count(*) FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
             WHERE ml.property_id = p.id AND m.media_type = 'image' AND NOT m.is_private)::int AS photos,
           ST_Distance(a.location, loc.centroid) AS metres_from_centre
      FROM marketplace.listings l
      JOIN real_estate.properties p ON p.id = l.property_id
      JOIN real_estate.property_types pt ON pt.id = p.property_type_id
      JOIN geography.addresses a ON a.id = p.address_id
      JOIN geography.places loc ON loc.id = a.place_id
     WHERE l.id = ${listing.id}`);
  const r = rows[0] as Row;
  const flags: NonNullable<CaseFlags["quality"]> = [];
  const description = (r.description as string | null) ?? "";
  if (description.length < 80) flags.push({ code: "short_description", message: "The description is under 80 characters." });
  if (Number(r.photos) < 3) flags.push({ code: "few_photos", message: `Only ${r.photos} photo${Number(r.photos) === 1 ? "" : "s"}.` });
  const metres = r.metres_from_centre === null ? null : Number(r.metres_from_centre);
  if (metres !== null && metres < 1) flags.push({ code: "approximate_location", message: "No map pin: the location is the locality centre." });
  else if (metres !== null && metres > 25_000) flags.push({ code: "far_location", message: `The pin is ${Math.round(metres / 1000)} km from the locality centre.` });

  const price = r.price === null ? null : Number(r.price);
  const area = r.carpet_area_sqft === null ? null : Number(r.carpet_area_sqft);
  if (price !== null) {
    if (r.transaction_type === "sale" && r.category === "residential" && area) {
      const perSqft = price / area;
      if (perSqft < 1500 || perSqft > 150_000) flags.push({ code: "price_outlier", message: `₹${Math.round(perSqft).toLocaleString("en-IN")} per sq ft is unusual.` });
    }
    if ((r.transaction_type === "rent" || r.transaction_type === "pg") && price < 2000) {
      flags.push({ code: "price_outlier", message: "The rent is unusually low." });
    }
  }
  if (r.transaction_type === "sale" && ["planned", "under_construction"].includes(String(r.lifecycle_status)) && !r.rera_id) {
    flags.push({ code: "missing_rera", message: "Under construction, but no RERA number given." });
  }
  return flags;
}

// ── System holds: suspensions pause live listings, reinstatement resumes them ──

export const HOLD_REASONS = {
  user: "Account suspended",
  agent: "Agent suspended",
  organization: "Organization suspended",
  host: "Host suspended",
} as const;

/** Pauses published listings matching `where` (aliases: l, la). Returns how many were paused. */
export async function pauseListings(tx: Tx, where: SQL, reason: string, actorUserId: string | null): Promise<number> {
  const { rows } = await tx.execute(sql`
    UPDATE marketplace.listings l SET status = 'paused', status_reason = ${reason}, updated_at = now()
      FROM marketplace.listing_agents la
     WHERE la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL
       AND l.status = 'published' AND ${where}
    RETURNING l.id`);
  const ids = (rows as Row[]).map((r) => String(r.id));
  if (ids.length > 0) {
    await tx.execute(sql`
      INSERT INTO marketplace.listing_status_history (id, listing_id, from_status, to_status, action, reason, actor_user_id)
      SELECT gen_random_uuid(), id, 'published', 'paused', 'pause', ${reason}, ${actorUserId}
        FROM unnest(${sql.param(ids)}::uuid[]) AS id`);
  }
  return ids.length;
}

/**
 * Resumes listings paused by any suspension hold, but only where nothing still holds them:
 * the agent, their account and the organization must all be active again. Checking every hold
 * (not just the one being lifted) means the order in which suspensions are lifted never matters.
 */
export async function resumeListings(tx: Tx, where: SQL, actorUserId: string | null): Promise<number> {
  const reasons = Object.values(HOLD_REASONS);
  const { rows } = await tx.execute(sql`
    UPDATE marketplace.listings l SET status = 'published', status_reason = NULL, updated_at = now()
      FROM marketplace.listing_agents la, identity.users u, orgs.organizations o
     WHERE la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL
       AND u.id = la.agent_user_id AND u.status = 'active'
       AND o.id = l.organization_id AND o.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM orgs.agent_profiles ap WHERE ap.user_id = la.agent_user_id AND ap.status <> 'active')
       AND NOT (l.transaction_type = 'stay' AND EXISTS (SELECT 1 FROM stays.host_profiles hp WHERE hp.user_id = la.agent_user_id AND hp.status <> 'active'))
       AND l.status = 'paused' AND l.status_reason = ANY(${sql.param(reasons)}::text[]) AND ${where}
    RETURNING l.id`);
  const ids = (rows as Row[]).map((r) => String(r.id));
  if (ids.length > 0) {
    await tx.execute(sql`
      INSERT INTO marketplace.listing_status_history (id, listing_id, from_status, to_status, action, reason, actor_user_id)
      SELECT gen_random_uuid(), id, 'paused', 'published', 'resume', 'Hold lifted', ${actorUserId}
        FROM unnest(${sql.param(ids)}::uuid[]) AS id`);
  }
  return ids.length;
}
