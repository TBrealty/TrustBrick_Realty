import "server-only";
import { sql } from "drizzle-orm";
import type { Actor } from "@/lib/authz/actor";
import type { Permission } from "@/lib/authz/catalog";
import { listingScope } from "@/lib/authz/scope";
import { type DbOrTx, db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { ListingStatus } from "@/lib/listings/lifecycle";
import { isReferenceId } from "@/lib/reference";

export type ListingRecord = {
  id: string;
  referenceId: string;
  propertyId: string;
  propertyReferenceId: string;
  organizationId: string;
  addressId: string;
  status: ListingStatus;
  transactionType: "sale" | "rent" | "lease" | "pg" | "stay";
  title: string;
  price: number | null;
  category: "residential" | "commercial" | "land" | "co_living";
  typeCode: string;
  typeName: string;
  isSample: boolean;
  primaryAgentUserId: string | null;
  primaryMembershipId: string | null;
  submittedAt: Date | null;
  publishedAt: Date | null;
};

type Row = Record<string, unknown>;

/**
 * The single way services load a listing by reference. The scope predicate is part of the
 * query, so a listing outside the actor's scope is indistinguishable from one that does not
 * exist: an agent who guesses another agent's LST- reference gets NOT_FOUND, not FORBIDDEN.
 */
export async function findListingInScope(
  actor: Actor,
  referenceId: string,
  permission: Permission,
  options: { tx?: DbOrTx; lock?: boolean } = {},
): Promise<ListingRecord> {
  if (!isReferenceId(referenceId, "LST")) throw notFound();
  const tx = options.tx ?? db;
  const { rows } = await tx.execute(sql`
    SELECT l.id, l.reference_id, l.property_id, p.reference_id AS property_reference_id, l.organization_id, p.address_id,
           l.status, l.transaction_type, l.title, l.price, pt.category, pt.code AS type_code, pt.name AS type_name,
           l.is_sample, l.submitted_at, l.published_at, la.agent_user_id, la.membership_id
      FROM marketplace.listings l
      JOIN real_estate.properties p ON p.id = l.property_id
      JOIN real_estate.property_types pt ON pt.id = p.property_type_id
      LEFT JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL
     WHERE l.reference_id = ${referenceId} AND l.deleted_at IS NULL AND ${listingScope(actor, permission)}
     ${options.lock ? sql`FOR UPDATE OF l` : sql``}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return {
    id: String(r.id),
    referenceId: String(r.reference_id),
    propertyId: String(r.property_id),
    propertyReferenceId: String(r.property_reference_id),
    organizationId: String(r.organization_id),
    addressId: String(r.address_id),
    status: r.status as ListingStatus,
    transactionType: r.transaction_type as ListingRecord["transactionType"],
    title: String(r.title),
    price: r.price === null ? null : Number(r.price),
    category: r.category as ListingRecord["category"],
    typeCode: String(r.type_code),
    typeName: String(r.type_name),
    isSample: Boolean(r.is_sample),
    primaryAgentUserId: (r.agent_user_id as string) ?? null,
    primaryMembershipId: (r.membership_id as string) ?? null,
    submittedAt: r.submitted_at ? new Date(r.submitted_at as string) : null,
    publishedAt: r.published_at ? new Date(r.published_at as string) : null,
  };
}

/** PRP- reference → the most recent listing of that property the actor may see. */
export async function latestListingForProperty(actor: Actor, propertyReferenceId: string, permission: Permission): Promise<string | null> {
  if (!isReferenceId(propertyReferenceId, "PRP")) return null;
  const { rows } = await db.execute(sql`
    SELECT l.reference_id FROM marketplace.listings l
      JOIN real_estate.properties p ON p.id = l.property_id
     WHERE p.reference_id = ${propertyReferenceId} AND l.deleted_at IS NULL AND ${listingScope(actor, permission)}
     ORDER BY l.created_at DESC LIMIT 1`);
  return ((rows[0] as Row | undefined)?.reference_id as string) ?? null;
}
