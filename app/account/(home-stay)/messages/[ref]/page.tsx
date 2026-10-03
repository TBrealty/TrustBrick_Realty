import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestConversation } from "@/components/messages/GuestConversation";
import { requireSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { getGuestConversation } from "@/lib/services/stays/messages";
import { ServicePage } from "@/components/navigation/ServicePage";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = { title: "Conversation — Trustbrick" };

type Props = { params: Promise<{ ref: string }> };

export default async function ConversationPage({ params }: Props) {
  const { ref } = await params;
  const { user } = await requireSession(`/account/messages/${ref}`);
  const conversation = await getGuestConversation(user.id, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return (
    <ServicePage shell={SERVICE_SHELLS.stay!} current="messages" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <GuestConversation conversation={conversation} />
    </ServicePage>
  );
}
