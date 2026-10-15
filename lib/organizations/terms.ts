/** The kinds of organization someone can register while applying as an agent. Shared by the forms and the service. */
export const APPLICANT_ORG_TYPES = ["brokerage", "developer", "property_manager", "pg_operator"] as const;
export type ApplicantOrgType = (typeof APPLICANT_ORG_TYPES)[number];

export const APPLICANT_ORG_TYPE_LABELS: Record<ApplicantOrgType, string> = {
  brokerage: "Brokerage or real estate agency",
  developer: "Developer or builder",
  property_manager: "Property management company",
  pg_operator: "PG or co-living operator",
};
