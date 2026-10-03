import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createEnquiry, getLead, updateLeadStatus, updateVisit } from "@/lib/services/crm";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { resolveMediaForServing, uploadListingMedia } from "@/lib/services/media";
import { ctx, makeAdmin, makeAgent, makeOrg, makeUser, one } from "./support/factory";
import { readyRentListing } from "./support/listings";

process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "tb-storage-"));
const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const stream = (b: Buffer) => new Blob([new Uint8Array(b)]).stream();

let agent: Actor;
let otherAgent: Actor;
let ref: string;

beforeAll(async () => {
  const org = await makeOrg("Media Realty");
  agent = await (await makeAgent(org.id, "Media Agent")).actor();
  otherAgent = await (await makeAgent(org.id, "Other Media Agent")).actor();
  ref = await readyRentListing(agent);
});

describe("media uploads", () => {
  it("re-encodes photos, strips metadata, and makes variants", async () => {
    const png = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#b0502c" } })
      .withMetadata({ exif: { IFD0: { Copyright: "secret-gps-would-be-here" } } })
      .png()
      .toBuffer();
    const item = await uploadListingMedia(agent, ref, "photo", stream(png), "sunset.png");
    expect(item.mimeType).toBe("image/jpeg");
    expect(item.width).toBe(1600);
    const row = await one<{ variants: { width: number }[]; storage_key: string; checksum: string }>(
      sql`SELECT variants, storage_key, checksum FROM real_estate.media WHERE id = ${item.id}`,
    );
    expect(row.variants.map((v) => v.width)).toEqual([640, 1280]);
    expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
    const served = await resolveMediaForServing(row.storage_key, null);
    expect(served?.mimeType).toBe("image/jpeg");
    const stored = await sharp(path.join(process.env.STORAGE_LOCAL_DIR!, row.storage_key)).metadata();
    expect(stored.exif).toBeUndefined();
  });

  it("refuses files whose bytes don't match an allowed type, and tiny photos", async () => {
    expect(await code(uploadListingMedia(agent, ref, "photo", stream(Buffer.from("<script>alert(1)</script>")), "x.jpg"))).toBe("VALIDATION_ERROR");
    const pdf = Buffer.from("%PDF-1.4\n%fake\n");
    expect(await code(uploadListingMedia(agent, ref, "photo", stream(pdf), "x.jpg"))).toBe("VALIDATION_ERROR");
    const tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#000" } }).jpeg().toBuffer();
    expect(await code(uploadListingMedia(agent, ref, "photo", stream(tiny), "tiny.jpg"))).toBe("VALIDATION_ERROR");
  });

  it("keeps documents private, and only people who can see the listing can open them", async () => {
    const doc = await uploadListingMedia(agent, ref, "document", stream(Buffer.from("%PDF-1.4\n1 0 obj\n")), "sale-deed.pdf");
    expect(doc.referenceId).toMatch(/^DOC-/);
    const row = await one<{ storage_key: string; is_private: boolean }>(sql`SELECT storage_key, is_private FROM real_estate.media WHERE id = ${doc.id}`);
    expect(row.is_private).toBe(true);
    expect(await resolveMediaForServing(row.storage_key, null)).toBeNull();
    expect(await resolveMediaForServing(row.storage_key, otherAgent)).toBeNull();
    expect((await resolveMediaForServing(row.storage_key, agent))?.isPrivate).toBe(true);
  });

  it("another agent can't upload to the listing", async () => {
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(await code(uploadListingMedia(otherAgent, ref, "photo", stream(jpg), "x.jpg"))).toBe("NOT_FOUND");
  });

  it("rejects keys that try to escape the storage folder", async () => {
    expect(await resolveMediaForServing("../../etc/passwd", agent)).toBeNull();
    expect(await resolveMediaForServing("properties/../../x", agent)).toBeNull();
  });
});

describe("leads and visits", () => {
  it("moves through the pipeline, refusing jumps the pipeline doesn't allow", async () => {
    const moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
    const listingRef = await readyRentListing(agent, { localitySlug: "gachibowli" });
    await transitionListing(agent, listingRef, "submit", {}, ctx);
    await transitionListing(moderator, listingRef, "approve", { reason: "Checked the details and photos." }, ctx);

    const customer = await makeUser("Pipeline Customer");
    const day = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const { leadReferenceId, visitReferenceId } = await createEnquiry({ userId: customer.id, email: customer.email }, listingRef, {
      name: "Pipeline Customer",
      phone: "9876501234",
      wantsVisit: "on",
      visitDate: day,
      visitTime: "evening",
    });
    expect(visitReferenceId).toMatch(/^VIS-/);

    expect(await code(updateLeadStatus(agent, leadReferenceId, { status: "converted" }))).toBe("CONFLICT");
    expect(await code(updateLeadStatus(agent, leadReferenceId, { status: "lost" }))).toBe("VALIDATION_ERROR");
    await updateLeadStatus(agent, leadReferenceId, { status: "contacted", note: "Called, will visit" });

    await updateVisit(agent, visitReferenceId!, { action: "schedule", scheduledAt: `${day}T17:30:00+05:30` });
    let lead = await getLead(agent, leadReferenceId);
    expect(lead.status).toBe("visit_scheduled");
    expect(lead.visits[0].status).toBe("scheduled");

    await updateVisit(agent, visitReferenceId!, { action: "complete" });
    await updateLeadStatus(agent, leadReferenceId, { status: "negotiation" });
    await updateLeadStatus(agent, leadReferenceId, { status: "converted" });
    lead = await getLead(agent, leadReferenceId);
    expect(lead.status).toBe("converted");
    expect(lead.activities.map((a) => a.type)).toEqual(expect.arrayContaining(["created", "visit_requested", "status_changed", "visit_updated"]));

    // A converted lead is closed, so a new enquiry opens a new lead; the person stays one contact.
    const again = await createEnquiry({ userId: customer.id, email: customer.email }, listingRef, { name: "Pipeline Customer", phone: "9876501234" });
    expect(again.leadReferenceId).not.toBe(leadReferenceId);
    const count = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM crm.contacts WHERE user_id = ${customer.id}`);
    expect(count.n).toBe(1);
  });

  it("the timeline can't be rewritten", async () => {
    await expect(db.execute(sql`UPDATE crm.lead_activities SET body = 'rewritten'`)).rejects.toThrow();
  });
});
