import type { LeadStatus } from "@/lib/crm/terms";

/** Badge colours for a lead's stage. */
export const leadTone = (s: LeadStatus) => (s === "new" ? "danger" : s === "converted" ? "success" : s === "lost" ? "neutral" : s === "negotiation" ? "warning" : "info");
