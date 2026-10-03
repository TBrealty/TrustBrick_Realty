import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { CONTACT_TOPICS } from "@/lib/db/schema/platform";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { type RequestContext, audit } from "./audit";
import { notifyPermissionHolders } from "./notifications";
import { type Page, pageParams } from "./pagination";

/**
 * Contact us. Anyone may write in, signed in or not; messages wait in the admin Inbox
 * (support.view / support.manage). No acknowledgement email is sent: an open form that emails
 * any address it's given would let anyone use Trustbrick to send mail to strangers.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export const CONTACT_TOPIC_LABELS: Record<(typeof CONTACT_TOPICS)[number], string> = {
  general: "A general question",
  buying_renting: "Buying, renting or a stay",
  listing_hosting: "Listing a property or hosting",
  account: "My account",
  partnership: "Partnerships",
  press: "Press and media",
  problem: "Reporting a problem",
};

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.replace(/[\s()-]/g, "") : undefined),
    z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter a phone number with 10 to 15 digits, or leave it blank").optional(),
  ),
  topic: z.enum(CONTACT_TOPICS, { message: "Choose what it's about" }),
  message: z.string().trim().min(20, "Tell us a little more (at least 20 characters)").max(4000, "Keep it under 4,000 characters"),
  // A field people never see. Bots fill it in.
  website: z.string().max(0).optional().catch("filled"),
});

export async function sendContactMessage(raw: unknown, sender: { userId: string | null; ipKey: string }): Promise<{ referenceId: string }> {
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const limited = await limit([
    { key: `contact:ip:${sender.ipKey}`, rule: RULES.contactByIp },
    { key: `contact:email:${input.email}`, rule: RULES.contactByEmail },
  ]);
  if (limited.limited) throw new AppError("RATE_LIMITED");
  // Pretend success to bots, store nothing.
  if (input.website) return { referenceId: "TKT-00000000" };

  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      INSERT INTO platform.contact_messages (id, name, email, phone, topic, message, user_id)
      VALUES (gen_random_uuid(), ${input.name}, ${input.email}, ${input.phone ?? null}, ${input.topic}, ${input.message}, ${sender.userId})
      RETURNING reference_id`);
    const referenceId = String((rows[0] as Row).reference_id);
    await notifyPermissionHolders(tx, "support.view", {
      type: "contact_message",
      title: `${CONTACT_TOPIC_LABELS[input.topic]}: message from ${input.name}`,
      link: `/inbox?q=${referenceId}`,
    });
    return { referenceId };
  });
}

// ── Admin inbox ──────────────────────────────────────────────────────────────

export const inboxFilters = z.object({
  status: z.enum(["open", "resolved", "all"]).catch("open"),
  topic: z.enum(CONTACT_TOPICS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type InboxFilters = z.infer<typeof inboxFilters>;

export type ContactMessageRow = {
  referenceId: string;
  name: string;
  email: string;
  phone: string | null;
  topic: string;
  topicLabel: string;
  message: string;
  status: string;
  userReferenceId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
};

export async function listContactMessages(actor: Actor, filters: InboxFilters, page: number): Promise<Page<ContactMessageRow> & { open: number }> {
  assertCan(actor, "support.view", "platform");
  const where = [sql`TRUE`];
  if (filters.status !== "all") where.push(sql`c.status = ${filters.status}`);
  if (filters.topic) where.push(sql`c.topic = ${filters.topic}`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(c.reference_id = ${ref} OR c.name ILIKE ${like} OR c.email ILIKE ${like} OR c.message ILIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const { limit: take, offset } = pageParams(page);
  const [rows, count, open] = await Promise.all([
    db.execute(sql`
      SELECT c.*, u.reference_id AS user_reference_id, r.name AS resolved_by_name
        FROM platform.contact_messages c
        LEFT JOIN identity.users u ON u.id = c.user_id
        LEFT JOIN identity.users r ON r.id = c.resolved_by
       WHERE ${whereSql} ORDER BY (c.status = 'open') DESC, c.created_at DESC LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n FROM platform.contact_messages c WHERE ${whereSql}`),
    db.execute(sql`SELECT count(*)::int AS n FROM platform.contact_messages WHERE status = 'open'`),
  ]);
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      name: String(r.name),
      email: String(r.email),
      phone: (r.phone as string) ?? null,
      topic: String(r.topic),
      topicLabel: CONTACT_TOPIC_LABELS[r.topic as keyof typeof CONTACT_TOPIC_LABELS] ?? String(r.topic),
      message: String(r.message),
      status: String(r.status),
      userReferenceId: (r.user_reference_id as string) ?? null,
      createdAt: iso(r.created_at)!,
      resolvedAt: iso(r.resolved_at),
      resolvedBy: (r.resolved_by_name as string) ?? null,
      resolutionNote: (r.resolution_note as string) ?? null,
    })),
    total: Number((count.rows[0] as Row).n),
    page,
    pageSize: take,
    open: Number((open.rows[0] as Row).n),
  };
}

export async function resolveContactMessage(actor: Actor, referenceId: string, rawNote: unknown, ctx: RequestContext) {
  assertCan(actor, "support.manage", "platform");
  if (!isReferenceId(referenceId, "TKT")) throw notFound();
  const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, 1000) : null;
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      UPDATE platform.contact_messages SET status = 'resolved', resolved_by = ${actor.userId}, resolved_at = now(), resolution_note = ${note}
       WHERE reference_id = ${referenceId} AND status = 'open' RETURNING id`);
    const r = rows[0] as Row | undefined;
    if (!r) {
      const exists = await tx.execute(sql`SELECT 1 FROM platform.contact_messages WHERE reference_id = ${referenceId}`);
      if (!exists.rows[0]) throw notFound();
      throw conflict("This message is already resolved.");
    }
    await audit(tx, actor, { event: "CONTACT_MESSAGE_RESOLVED", target: { type: "contact_message", id: String(r.id), referenceId }, metadata: note ? { note } : undefined }, ctx);
  });
}
