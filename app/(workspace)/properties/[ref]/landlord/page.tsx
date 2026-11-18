import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inviteExistingLandlordAction, inviteNewLandlordAction } from "@/app/(workspace)/properties/rent-actions";
import { ShareLinkForm } from "@/components/rent/ShareLinkForm";
import { ActionForm, Submit, TextInput } from "@/components/workspace/forms";
import { BackLink, Card, PageHeader, Tabs } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { getListingForActor } from "@/lib/services/listings/queries";
import { isRentable } from "@/lib/services/rent/common";
import { landlordPanel } from "@/lib/services/rent/landlords";

export const metadata: Metadata = { title: "Add landlord" };

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ mode?: string }> };

/**
 * Add the property's landlord: someone new gets a sign-up link (for their email only); someone who
 * already receives rent through Trustbrick is found by exact email, phone or LND- ID and accepts in
 * their dashboard.
 */
export default async function AddLandlordPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const mode = (await searchParams).mode === "existing" ? "existing" : "new";
  const actor = await requirePermission("landlords.invite", `/properties/${ref}/landlord`);
  const listing = await getListingForActor(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  if (!isRentable(listing.purpose)) notFound();
  const panel = await landlordPanel(listing.propertyId);
  const busy = panel.landlord ? `${panel.landlord.name} is already this property's landlord.` : panel.invitation && !panel.invitation.expired ? `An invitation to ${panel.invitation.email} is waiting.` : null;

  return (
    <>
      <PageHeader eyebrow={<BackLink href={`/properties/${ref}`}>{listing.title}</BackLink>} title="Add the landlord" />
      <Tabs
        label="How to add them"
        items={[
          { href: `/properties/${ref}/landlord?mode=new`, label: "New landlord", active: mode === "new" },
          { href: `/properties/${ref}/landlord?mode=existing`, label: "Existing landlord", active: mode === "existing" },
        ]}
      />
      <div className="mt-6 max-w-xl">
        {busy ? (
          <Card>
            <p className="text-[0.875rem]">{busy}</p>
            <Link href={`/properties/${ref}`} className="wbtn wbtn-secondary wbtn-sm mt-4">
              Back to the property
            </Link>
          </Card>
        ) : mode === "new" ? (
          <Card title="New landlord" description="For someone who hasn't received rent through Trustbrick before. They get a link to create their account; the property is then in their My properties.">
            <ShareLinkForm action={inviteNewLandlordAction} className="space-y-4" shareText={`Hi, I've added you as the landlord of ${listing.title} on Trustbrick, so your rent is paid to you online. Create your account here:`} done="Invitation created.">
              <input type="hidden" name="ref" value={ref} />
              <TextInput label="Landlord's full name" name="name" required autoComplete="off" />
              <TextInput label="Email" name="email" type="email" required autoComplete="off" hint="The link works only for this email." />
              <TextInput label="Mobile number" name="phone" type="tel" inputMode="tel" required autoComplete="off" />
              <Submit>Create the link</Submit>
            </ShareLinkForm>
            <p className="mt-5 border-t border-line-light pt-4 text-[0.8125rem] text-stone-deep">
              They&apos;ll upload proof that they own the property and add a bank account in their own name. No rent reaches them until Trustbrick has approved both.
            </p>
          </Card>
        ) : (
          <Card title="Existing landlord" description="For someone who already receives rent through Trustbrick for another property. They accept this one in their dashboard; no link to send.">
            <ActionForm action={inviteExistingLandlordAction} className="space-y-4" successMessage="Sent. They'll see it in My properties and get an email." resetOnSuccess>
              <input type="hidden" name="ref" value={ref} />
              <TextInput label="Their email, mobile number or landlord ID" name="who" required autoComplete="off" placeholder="name@example.com, 98765 43210 or LND-7K4M9Q2X" hint="An exact match only." />
              <Submit>Send request</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
