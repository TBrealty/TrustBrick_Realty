import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { correctTenancyAction, createTenancyAction } from "@/app/(workspace)/properties/rent-actions";
import { ShareLinkForm } from "@/components/rent/ShareLinkForm";
import { ActionForm, Select, Submit, TextInput } from "@/components/workspace/forms";
import { BackLink, Card, PageHeader } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { getListingForActor } from "@/lib/services/listings/queries";
import { isRentable } from "@/lib/services/rent/common";
import { landlordPanel } from "@/lib/services/rent/landlords";
import { currentTenancy, ordinal } from "@/lib/services/rent/tenancies";

export const metadata: Metadata = { title: "Tenancy" };

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ edit?: string }> };

const DAYS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `The ${ordinal(i + 1)}` }));

/** Set up the tenancy (the tenant gets a link; the landlord confirms), or correct its terms before it starts. */
export default async function TenancyPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { edit } = await searchParams;
  const actor = await requirePermission("tenancies.manage", `/properties/${ref}/tenancy`);
  const listing = await getListingForActor(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  if (!isRentable(listing.purpose)) notFound();
  const [panel, tenancy] = await Promise.all([landlordPanel(listing.propertyId), currentTenancy(listing.propertyId)]);
  const correcting = edit && tenancy && tenancy.referenceId === edit && ["pending", "disputed"].includes(tenancy.status) ? tenancy : null;
  const price = listing.pricing.price ?? undefined;

  const terms = (t?: typeof tenancy) => (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput label="Monthly rent (₹)" name="monthlyRent" type="number" inputMode="numeric" min={500} step={1} required defaultValue={t?.monthlyRent ?? price} />
        <Select label="Rent is due on" name="dueDay" required options={DAYS} defaultValue={String(t?.dueDay ?? 5)} hint="Up to the 28th, so every month has it." />
        <TextInput label="Security deposit (₹)" name="deposit" type="number" inputMode="numeric" min={0} step={1} defaultValue={t?.deposit ?? 0} hint="Recorded only; paid between them for now." />
        <TextInput label="Tenancy starts" name="startDate" type="date" required defaultValue={t?.startDate} />
        <TextInput label="Tenancy ends (optional)" name="endDate" type="date" defaultValue={t?.endDate ?? undefined} hint="Leave empty if it runs until someone ends it." />
      </div>
    </>
  );

  return (
    <>
      <PageHeader eyebrow={<BackLink href={`/properties/${ref}`}>{listing.title}</BackLink>} title={correcting ? "Correct the tenancy" : "Set up the tenancy"} />
      <div className="max-w-2xl">
        {!panel.landlord ? (
          <Card>
            <p className="text-[0.875rem]">Add the property&apos;s landlord first: the rent is paid to them.</p>
            <Link href={`/properties/${ref}/landlord`} className="wbtn wbtn-primary wbtn-sm mt-4">
              Add the landlord
            </Link>
          </Card>
        ) : correcting ? (
          <Card title={`${correcting.tenantName}'s tenancy`} description={correcting.disputeNote ? `The landlord said: “${correcting.disputeNote}”` : "The landlord is asked to confirm again."}>
            <ActionForm action={correctTenancyAction} className="space-y-4" successMessage="Corrected. The landlord is asked to confirm the new terms.">
              <input type="hidden" name="ref" value={ref} />
              <input type="hidden" name="tenancy" value={correcting.referenceId} />
              {terms(correcting)}
              <Submit>Save and ask the landlord again</Submit>
            </ActionForm>
          </Card>
        ) : tenancy ? (
          <Card>
            <p className="text-[0.875rem]">This property already has a tenancy ({tenancy.statusLabel.toLowerCase()}).</p>
            <Link href={`/properties/${ref}`} className="wbtn wbtn-secondary wbtn-sm mt-4">
              Back to the property
            </Link>
          </Card>
        ) : (
          <Card title="The tenant and the terms" description={`Rent is paid to ${panel.landlord.name}. They confirm these terms; the tenant accepts with a link.`}>
            <ShareLinkForm action={createTenancyAction} className="space-y-4" shareText={`Hi, I've set up your tenancy of ${listing.title} on Trustbrick so you can pay rent online. Accept it here:`} done="Tenancy set up.">
              <input type="hidden" name="ref" value={ref} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextInput label="Tenant's full name" name="tenantName" required autoComplete="off" />
                <TextInput label="Tenant's mobile number" name="tenantPhone" type="tel" inputMode="tel" required autoComplete="off" />
              </div>
              <TextInput label="Tenant's email" name="tenantEmail" type="email" required autoComplete="off" hint="Their link works only for this email." />
              {terms()}
              <Submit>Set up and create the tenant&apos;s link</Submit>
            </ShareLinkForm>
          </Card>
        )}
      </div>
    </>
  );
}
