import "server-only";
import { sql } from "drizzle-orm";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type DbOrTx, db } from "@/lib/db";
import type { CaseFlags } from "@/lib/db/schema/trust";
import { conflict, invalid, notFound } from "@/lib/errors";
import { isReferenceId } from "@/lib/reference";
import { HIDE_REASON_MIN } from "@/lib/tours/terms";
import { type RequestContext, audit } from "./audit";
import type { ListingRecord } from "./listings/access";
import { notify, notifyPermissionHolders } from "./notifications";

/**
 * Reviewing changes to a live listing's virtual tour. A change shows straight away; each one is
 * added to the listing's open tour review (one is opened, and the reviewers told, if there isn't
 * one). The reviewer approves it, or hides the tour with a remark the agent or host sees. A hidden
 * tour stays hidden while they fix it: their changes go for review, and it's shown again only when
 * a reviewer approves one.
 */

type Row = Record<string, unknown>;
type TourListing = Pick<ListingRecord, "id" | "referenceId" | "propertyId" | "organizationId" | "title">;

export async function recordTourChange(tx: DbOrTx, actor: Actor, listing: TourListing, what: string, ctx?: RequestContext) {
  const hidden = await tx.execute(sql`SELECT tour_hidden_at IS NOT NULL AS hidden FROM real_estate.properties WHERE id = ${listing.propertyId}`);
  const isHidden = Boolean((hidden.rows[0] as Row | undefined)?.hidden);
  const change = { at: new Date().toISOString(), by: actor.userId, what };
  const { rows } = await tx.execute(sql`
    UPDATE trust.review_cases
       SET flags = jsonb_set(coalesce(flags, '{}'::jsonb), '{tour,changes}',
                             coalesce(flags->'tour'->'changes', '[]'::jsonb) || ${JSON.stringify([change])}::jsonb, true),
           updated_at = now()
     WHERE listing_id = ${listing.id} AND case_type = 'tour_review' AND status IN ('open', 'in_review')
     RETURNING reference_id`);
  let caseRef = (rows[0] as Row | undefined)?.reference_id as string | undefined;
  if (!caseRef) {
    const flags: CaseFlags = { tour: { changes: [change] } };
    const created = await tx.execute(sql`
      INSERT INTO trust.review_cases (id, case_type, listing_id, status, flags, submitted_by)
      VALUES (gen_random_uuid(), 'tour_review', ${listing.id}, 'open', ${JSON.stringify(flags)}::jsonb, ${actor.userId})
      RETURNING reference_id`);
    caseRef = String((created.rows[0] as Row).reference_id);
    await notifyPermissionHolders(tx, "listings.approve", {
      type: "tour_changed",
      title: isHidden ? `The hidden virtual tour of ${listing.referenceId} was fixed` : `The virtual tour of ${listing.referenceId} changed`,
      body: isHidden ? `${listing.title}: ${what}. It stays hidden until you approve it.` : `${listing.title}: ${what}. It's live; review it.`,
      link: `/approvals/${caseRef}`,
    });
  }
  await audit(
    tx,
    actor,
    {
      event: "TOUR_CHANGED",
      target: { type: "listing", id: listing.id, referenceId: listing.referenceId },
      organizationId: listing.organizationId,
      metadata: { case: caseRef, change: what },
    },
    ctx,
  );
  return caseRef;
}

export type TourReviewDecision = "approve" | "hide";

/** Approves a tour change, or hides the tour with a remark. Only an open tour review can be decided. */
export async function decideTourReview(actor: Actor, caseReference: string, decision: TourReviewDecision, rawReason: string, ctx: RequestContext) {
  assertCan(actor, "listings.approve", "platform");
  if (!isReferenceId(caseReference, "VER")) throw notFound();
  const reason = rawReason.trim().slice(0, 1000);
  if (decision === "hide" && reason.length < HIDE_REASON_MIN) {
    throw invalid("Please check the highlighted fields.", { reason: `Say why, in at least ${HIDE_REASON_MIN} characters. The agent or host sees it.` });
  }
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT rc.id, rc.status, rc.case_type, l.id AS listing_id, l.reference_id, l.title, l.organization_id, l.property_id,
             (SELECT la.agent_user_id FROM marketplace.listing_agents la WHERE la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL) AS owner
        FROM trust.review_cases rc JOIN marketplace.listings l ON l.id = rc.listing_id
       WHERE rc.reference_id = ${caseReference} FOR UPDATE OF rc`);
    const r = rows[0] as Row | undefined;
    if (!r || r.case_type !== "tour_review") throw notFound();
    if (!["open", "in_review"].includes(String(r.status))) throw conflict("This tour review has already been decided.");

    await tx.execute(sql`
      UPDATE trust.review_cases
         SET status = ${decision === "approve" ? "approved" : "rejected"}, decided_by = ${actor.userId}, decided_at = now(),
             decision_reason = ${reason || null}, updated_at = now()
       WHERE id = ${String(r.id)}`);
    // Approving shows a hidden tour again; hiding keeps the first time it was hidden, with the latest reason.
    if (decision === "hide") {
      await tx.execute(sql`UPDATE real_estate.properties SET tour_hidden_at = coalesce(tour_hidden_at, now()), tour_hidden_reason = ${reason} WHERE id = ${String(r.property_id)}`);
    } else {
      await tx.execute(sql`UPDATE real_estate.properties SET tour_hidden_at = NULL, tour_hidden_reason = NULL WHERE id = ${String(r.property_id)}`);
    }
    const ref = String(r.reference_id);
    await audit(
      tx,
      actor,
      {
        event: decision === "approve" ? "TOUR_APPROVED" : "TOUR_HIDDEN",
        target: { type: "listing", id: String(r.listing_id), referenceId: ref },
        organizationId: String(r.organization_id),
        metadata: { case: caseReference, reason: reason || null },
      },
      ctx,
    );
    await notify(tx, [r.owner as string | null], {
      type: "tour_decision",
      title: decision === "approve" ? `The virtual tour of ${ref} was approved` : `The virtual tour of ${ref} was hidden by Trustbrick`,
      body:
        decision === "approve"
          ? reason || `${String(r.title)}: it's showing to guests and buyers.`
          : `${reason} Fix the tour and we'll check it again; it stays hidden until we approve it.`,
      link: `/properties/${ref}/tour`,
    });
  });
}

/** Closes any open tour review on a listing that a full listing review has just covered. */
export async function closeTourReviewsWithListing(tx: DbOrTx, listingId: string, propertyId: string, actorUserId: string) {
  await tx.execute(sql`
    UPDATE trust.review_cases SET status = 'approved', decided_by = ${actorUserId}, decided_at = now(),
           decision_reason = 'Reviewed with the listing.', updated_at = now()
     WHERE listing_id = ${listingId} AND case_type = 'tour_review' AND status IN ('open', 'in_review')`);
  // The reviewer has seen the tour as it is now.
  await tx.execute(sql`UPDATE real_estate.properties SET tour_hidden_at = NULL, tour_hidden_reason = NULL WHERE id = ${propertyId}`);
}

/** Whether Trustbrick has hidden a property's tour, and why. */
export async function tourHiddenFor(propertyId: string): Promise<{ at: string; reason: string | null } | null> {
  const { rows } = await db.execute(sql`SELECT tour_hidden_at, tour_hidden_reason FROM real_estate.properties WHERE id = ${propertyId}`);
  const r = rows[0] as Row | undefined;
  return r?.tour_hidden_at ? { at: new Date(r.tour_hidden_at as string).toISOString(), reason: (r.tour_hidden_reason as string) ?? null } : null;
}

/** A tour review's changes, newest first, with who made each. */
export async function tourChangesWithNames(flags: CaseFlags): Promise<{ at: string; by: string | null; what: string }[]> {
  const changes = flags.tour?.changes ?? [];
  const ids = [...new Set(changes.map((c) => c.by).filter((id): id is string => Boolean(id)))];
  const { rows } = ids.length ? await db.execute(sql`SELECT id, name FROM identity.users WHERE id = ANY(${sql.param(ids)}::uuid[])`) : { rows: [] };
  const names = new Map((rows as Row[]).map((r) => [String(r.id), String(r.name)]));
  return [...changes].reverse().map((c) => ({ at: c.at, by: c.by ? (names.get(c.by) ?? null) : null, what: c.what }));
}
