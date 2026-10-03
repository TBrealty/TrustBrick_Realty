import type { Metadata } from "next";
import { PartnerCommissionCard } from "@/components/workspace/PartnerCommissionCard";
import { organizationForPerson } from "@/lib/services/commission";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Checkbox, ConfirmAction } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, Status } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { getHost } from "@/lib/services/stays/hosts";
import { HOST_RELATIONSHIP_LABELS } from "@/lib/stays/labels";
import { approveHostAction, reinstateHostAction, rejectHostAction, suspendHostAction, verifyHostAction } from "../../bookings/actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

export default async function HostPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("hosts.view", `/hosts/${ref}`, "platform");
  const host = await getHost(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const partnerOrg = await organizationForPerson(host.userId);
  const canVerify = can(actor, "hosts.verify", "platform");
  const canSuspend = can(actor, "hosts.suspend", "platform");

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/hosts">Hosts</BackLink>}
        title={host.name}
        meta={
          <>
            <ReferenceId value={host.referenceId} />
            <Status value={host.status} />
            <Status value={host.verificationStatus} label={host.verificationStatus === "verified" ? "Identity checked" : undefined} />
          </>
        }
        actions={
          <>
            {canVerify && host.status === "pending" && (
              <>
                <ConfirmAction
                  label="Approve"
                  title={`Approve ${host.name} as a host?`}
                  description="They get a hosting workspace and can list homes as homestays. Each listing is still reviewed before it goes live."
                  action={approveHostAction}
                  hidden={{ ref: host.referenceId }}
                  variant="primary"
                >
                  <Checkbox name="verify" label="I've checked their government ID and phone number" hint="Shows an “Identity checked” badge on their stays." />
                </ConfirmAction>
                <ConfirmAction label="Reject" title="Reject this application?" description="They see your reason and can apply again." action={rejectHostAction} hidden={{ ref: host.referenceId }} variant="danger" reason={{ required: true }} />
              </>
            )}
            {canVerify && host.status === "active" && (
              <ConfirmAction
                label={host.verificationStatus === "verified" ? "Remove identity check" : "Mark identity checked"}
                title={host.verificationStatus === "verified" ? "Remove the identity check?" : "Mark identity as checked?"}
                action={verifyHostAction}
                hidden={{ ref: host.referenceId, verified: host.verificationStatus === "verified" ? "0" : "1" }}
              />
            )}
            {canSuspend && host.status === "active" && (
              <ConfirmAction
                label="Suspend"
                title={`Suspend ${host.name}?`}
                description="Their live stays leave the marketplace and they lose the hosting workspace. Confirmed bookings stay as they are; cancel them from Bookings if needed."
                action={suspendHostAction}
                hidden={{ ref: host.referenceId }}
                variant="danger"
                reason={{ required: true }}
              />
            )}
            {canSuspend && host.status === "suspended" && (
              <ConfirmAction label="Reinstate" title="Reinstate this host?" description="Their paused stays go live again." action={reinstateHostAction} hidden={{ ref: host.referenceId }} variant="primary" />
            )}
          </>
        }
      />
      {host.statusReason && (
        <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem]">
          <strong className="font-medium">Note:</strong> {host.statusReason}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card title="Application">
            <DescriptionList
              columns={2}
              items={[
                ["Email", host.email],
                ["Phone", host.phone],
                ["City", host.city],
                ["Relationship to the home", HOST_RELATIONSHIP_LABELS[host.relationship as keyof typeof HOST_RELATIONSHIP_LABELS] ?? host.relationship],
                ["Languages", host.languages.length ? host.languages.join(", ") : null],
                ["Applied", formatDateTime(host.createdAt)],
                ["Approved", host.approvedAt ? `${formatDateTime(host.approvedAt)}${host.approvedBy ? ` by ${host.approvedBy}` : ""}` : null],
                ["User account", <ReferenceId key="u" value={host.userReferenceId} href={can(actor, "users.view", "platform") ? `/users/${host.userReferenceId}` : undefined} copy={false} />],
              ]}
            />
            {host.about && <p className="mt-5 border-t border-line-light pt-4 text-[0.875rem] text-graphite">{host.about}</p>}
            {host.status === "pending" && (
              <p className="mt-5 text-[0.75rem] text-stone-deep">
                Before approving: call the phone number, ask for a government ID over video or in person, and check they have the right to host in the home. Don&apos;t store ID
                numbers here.
              </p>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {partnerOrg && <PartnerCommissionCard actor={actor} organization={partnerOrg} />}
          <Card title={`Stays (${host.stays})`}>
            {host.listings.length === 0 ? (
              <p className="text-[0.8125rem] text-stone-deep">No stays listed yet.</p>
            ) : (
              <ul className="divide-y divide-line-light text-[0.8125rem]">
                {host.listings.map((l) => (
                  <li key={l.referenceId} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/properties/${l.referenceId}`} className="min-w-0 truncate hover:underline">
                      {l.title}
                    </Link>
                    <Status value={l.status} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[0.75rem] text-stone-deep">{host.bookings} booking(s) in total.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
