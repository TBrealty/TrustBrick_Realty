import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GuestConversation } from "@/components/messages/GuestConversation";
import { requireSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { guestConversationForListing } from "@/lib/services/stays/messages";
import { ServicePage } from "@/components/navigation/ServicePage";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = { title: "Message the host — Trustbrick" };

type Props = { searchParams: Promise<{ listing?: string }> };

/** "Message the host": the guest's existing conversation about this stay, or a new one. */
export default async function NewConversationPage({ searchParams }: Props) {
  const listing = normalizeReferenceId(String((await searchParams).listing ?? ""));
  if (!isReferenceId(listing, "LST")) notFound();
  const { user } = await requireSession(`/account/messages/new?listing=${listing}`);
  const found = await guestConversationForListing(user.id, listing).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  if ("existing" in found) redirect(`/account/messages/${found.existing}`);
  return (
    <ServicePage shell={SERVICE_SHELLS.stay!} current="messages" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <GuestConversation conversation={found.draft} />
    </ServicePage>
  );
}
