import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { transitionAction } from "@/app/(workspace)/properties/actions";
import { ActionForm, Submit } from "@/components/workspace/forms";
import { ListingOverview } from "@/components/workspace/ListingOverview";
import { MediaManager } from "@/components/workspace/onboarding/MediaManager";
import { AmenitiesForm, DetailsForm, LocationForm, PricingForm } from "@/components/workspace/onboarding/StepForms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, PageHeader, StatusBadge } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { STATUS_LABELS, STATUS_TONES, isEditable } from "@/lib/listings/lifecycle";
import { CATEGORY_LABELS, PURPOSE_LABELS } from "@/lib/listings/onboarding-schema";
import { submissionGaps } from "@/lib/services/listings/lifecycle";
import { getOnboardingOptions } from "@/lib/services/listings/onboarding";
import { getListingForActor } from "@/lib/services/listings/queries";

export const metadata: Metadata = { title: "Edit property" };

const STEPS = [
  { key: "location", label: "Location" },
  { key: "details", label: "Details" },
  { key: "pricing", label: "Pricing" },
  { key: "amenities", label: "Amenities" },
  { key: "media", label: "Photos & media" },
  { key: "review", label: "Review & submit" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ step?: string; created?: string }> };

export default async function EditPropertyPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { step: rawStep, created } = await searchParams;
  const actor = await requirePermission("listings.edit", `/properties/${ref}/edit`);
  const listing = await getListingForActor(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  // Live and in-review listings are read-only; the detail page offers "Withdraw to edit".
  if (!isEditable(listing.status)) redirect(`/properties/${ref}`);

  const step: StepKey = STEPS.some((s) => s.key === rawStep) ? (rawStep as StepKey) : "details";
  const [options, gaps] = await Promise.all([getOnboardingOptions(), submissionGaps(db, listing.id)]);
  const gapSections = new Set(gaps.map((g) => g.section));
  const index = STEPS.findIndex((s) => s.key === step);

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href={`/properties/${ref}`}>Back to the listing</BackLink>}
        title={listing.title}
        meta={
          <>
            <StatusBadge tone={STATUS_TONES[listing.status]}>{STATUS_LABELS[listing.status]}</StatusBadge>
            <ReferenceId value={listing.referenceId} />
            <span>
              {listing.type.name} · {PURPOSE_LABELS[listing.purpose]} · {CATEGORY_LABELS[listing.type.category]}
            </span>
          </>
        }
      />

      {created && (
        <p role="status" className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-sage">
          Draft created as <span className="font-mono">{listing.referenceId}</span> (property <span className="font-mono">{listing.propertyReferenceId}</span>). It&apos;s saved: you can leave and come back any time.
        </p>
      )}
      {listing.statusReason && ["changes_requested", "rejected"].includes(listing.status) && (
        <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
          <strong className="font-medium text-ink">Reviewer&apos;s note:</strong> {listing.statusReason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Onboarding steps" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {STEPS.map((s, i) => {
              const active = s.key === step;
              const missing = gapSections.has(s.key as "location" | "details" | "pricing" | "media" | "commission");
              return (
                <li key={s.key} className="shrink-0">
                  <Link
                    href={`/properties/${ref}/edit?step=${s.key}`}
                    aria-current={active ? "step" : undefined}
                    className={`relative flex items-center gap-2.5 rounded-[3px] px-3 py-2 text-[0.8125rem] whitespace-nowrap ${active ? "bg-ink text-paper" : "text-graphite hover:bg-ink/5"}`}
                  >
                    <span className={`grid grid-cols-1 size-5 place-items-center rounded-full text-[0.6875rem] ${active ?"bg-paper text-ink" : missing ? "border border-amber text-amber" : "bg-sage/15 text-sage-deep"}`} aria-hidden>
                      {missing ? i + 1 : "✓"}
                    </span>
                    {s.key === "pricing" && listing.purpose === "stay" ? "Price & house rules" : s.label}
                    {missing && <span className="sr-only">(needs attention)</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        {step === "review" ? (
          <div className="min-w-0 space-y-5">
            <Card title={`${index + 1}. ${STEPS[index].label}`} description="Check each box below as the reviewer will see it, then submit.">
              {gaps.length > 0 ? (
                <>
                  <p className="text-[0.875rem]">A few things are still needed before you can submit:</p>
                  <ul className="mt-3 space-y-2">
                    {gaps.map((g) => (
                      <li key={g.message} className="flex items-center justify-between gap-3 rounded-[3px] border border-line-light px-3 py-2 text-[0.8125rem]">
                        <span>
                          <span className="mr-1.5 text-amber" aria-hidden>
                            !
                          </span>
                          {g.message}
                        </span>
                        <Link href={g.section === "commission" ? "/commission" : `/properties/${ref}/edit?step=${g.section}`} className="wbtn wbtn-secondary wbtn-sm">
                          {g.section === "commission" ? "Review rates" : "Fix"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="flex items-center gap-2 text-[0.875rem]">
                  <span className="grid size-5 place-items-center rounded-full bg-sage/15 text-[0.6875rem] text-sage-deep" aria-hidden>
                    ✓
                  </span>
                  Everything required is filled in. Look it over below, then submit.
                </p>
              )}
            </Card>

            <ListingOverview listing={listing} editHref={(s) => `/properties/${ref}/edit?step=${s}`} />

            <Card>
              <div className="rounded-[3px] bg-paper p-4 text-[0.8125rem] text-graphite">
                <p className="font-medium text-ink">What happens next</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Automatic checks look for duplicates and missing information. They inform the reviewer; they don&apos;t reject anything.</li>
                  <li>A Trustbrick admin approves it, or asks for changes with a remark you&apos;ll see here.</li>
                  <li>
                    Once approved, it goes live on the {listing.purpose === "pg" ? "PGs" : listing.purpose === "stay" ? "Home Stay" : listing.purpose === "sale" ? "Buy or Invest" : "Rent"} pages.
                  </li>
                </ol>
              </div>
              <ActionForm action={transitionAction} className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <input type="hidden" name="ref" value={listing.referenceId} />
                <input type="hidden" name="action" value="submit" />
                <p className="text-[0.75rem] text-stone-deep">You can&apos;t edit it while it&apos;s being reviewed. Withdraw it to make changes.</p>
                {gaps.length === 0 ? (
                  <Submit>Submit for approval</Submit>
                ) : (
                  <span className="wbtn wbtn-primary opacity-50" aria-disabled="true">
                    Submit for approval
                  </span>
                )}
              </ActionForm>
            </Card>
          </div>
        ) : (
          <Card title={`${index + 1}. ${STEPS[index].label}`} className="min-w-0">
            {step === "location" && <LocationForm listing={listing} options={options} />}
            {step === "details" && <DetailsForm listing={listing} />}
            {step === "pricing" && <PricingForm listing={listing} />}
            {step === "amenities" && <AmenitiesForm listing={listing} options={options} />}
            {step === "media" && (
              <>
                <MediaManager referenceId={listing.referenceId} items={listing.media} />
                <div className="mt-6 flex justify-end border-t border-line-light pt-5">
                  <Link href={`/properties/${ref}/edit?step=review`} className="wbtn wbtn-primary">
                    Continue to review
                  </Link>
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
