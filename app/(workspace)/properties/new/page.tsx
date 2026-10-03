import type { Metadata } from "next";
import { StartWizard } from "@/components/workspace/onboarding/StartWizard";
import { BackLink, PageHeader } from "@/components/workspace/ui";
import { purposesForRoles } from "@/lib/authz/catalog";
import { requirePermission } from "@/lib/authz/session";
import { PURPOSES } from "@/lib/vocab";
import { getOnboardingOptions } from "@/lib/services/listings/onboarding";

export const metadata: Metadata = { title: "Onboard property" };

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  const actor = await requirePermission("listings.create", "/properties/new");
  const [options, { purpose }] = await Promise.all([getOnboardingOptions(), searchParams]);
  const purposes = purposesForRoles(actor.roles);
  const hostOnly = purposes.length === 1 && purposes[0] === "stay";
  const initial = PURPOSES.find((p) => p === purpose);
  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/properties">Properties</BackLink>}
        title={hostOnly ? "List your home" : "Onboard a property"}
        description={
          hostOnly
            ? "Choose the type of home and where it is. You'll add details, nightly price, house rules and photos next, and can save and come back at any point."
            : `Four quick choices create a draft for ${actor.organization.name}. You'll add details, pricing and photos next, and can save and come back at any point.`
        }
      />
      <StartWizard options={options} purposes={purposes} initialPurpose={initial} />
    </>
  );
}
