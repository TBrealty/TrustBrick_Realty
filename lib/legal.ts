import { site } from "@/lib/site";

/**
 * The facts the Privacy Policy and Terms of Use (app/privacy, app/terms) depend on. Fill in the
 * placeholders before launch; until then the pages show them in [brackets] and say they are drafts.
 * Both documents should be reviewed by a lawyer before Trustbrick goes live.
 */
export const LEGAL = {
  company: site.legalName,
  /** The registered office, as on the certificate of incorporation. */
  registeredOffice: "[Registered office address]",
  /** Corporate Identification Number, from the certificate of incorporation. */
  cin: "[CIN]",
  /** Where people write about privacy, their data and complaints. */
  contactEmail: "[privacy@your-domain]",
  /**
   * Required by the Information Technology Rules, 2011 and 2021, and the Digital Personal Data
   * Protection Act, 2023: someone who answers complaints, named on the site.
   */
  grievanceOfficer: { name: "[Grievance Officer's name]", email: "[grievance@your-domain]" },
  /** The city whose courts hear disputes under the Terms. */
  courts: "[City], India",
  /** When either document last changed: shown at the top of each. */
  updated: "3 November 2026",
  /** Shown as a note on both pages until a lawyer has reviewed them. */
  draft: true,
} as const;

/** True while any placeholder above is still unfilled. */
export const legalPlaceholders = () => JSON.stringify(LEGAL).includes("[");
