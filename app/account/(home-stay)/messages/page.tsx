import type { Metadata } from "next";
import Link from "next/link";
import { ConversationList } from "@/components/messages/ConversationList";
import { requireSession } from "@/lib/auth/session";
import { listGuestConversations } from "@/lib/services/stays/messages";
import { ServicePage } from "@/components/navigation/ServicePage";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = { title: "Messages — Trustbrick" };

export default async function MessagesPage() {
  const { user } = await requireSession("/account/messages");
  const conversations = await listGuestConversations(user.id);

  return (
    <ServicePage shell={SERVICE_SHELLS.stay!} current="messages" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <div>
        <p className="eyebrow flex items-center gap-3 text-brick">
          <span aria-hidden className="h-px w-8 bg-current" />
          Messages
        </p>
        <h1 className="display mt-6 mb-10 text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95]">
          Your <em>conversations.</em>
        </h1>
        {conversations.length === 0 ? (
          <div className="border border-dashed border-line-light px-6 py-14 text-center">
            <p className="text-[1.125rem] font-medium">No messages yet</p>
            <p className="mx-auto mt-2 max-w-[44ch] text-[0.9375rem] text-graphite">
              Have a question before you book? Open a stay and choose &ldquo;Message the host&rdquo;. Every conversation is kept here.
            </p>
            <Link href="/stays" className="btn btn-dark mt-6">
              <span>Find a home stay</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[6px] border border-line-light bg-card">
            <ConversationList conversations={conversations} hrefBase="/account/messages" />
          </div>
        )}
      </div>
    </ServicePage>
  );
}
