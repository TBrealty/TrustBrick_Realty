import type { Metadata } from "next";
import { AccountNav } from "@/components/account/AccountNav";
import { AppHeader } from "@/components/navigation/AppHeader";
import { getSession } from "@/lib/auth/session";
import { guestUnreadCount } from "@/lib/services/stays/messages";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // Each page enforces login itself with its own return path; the layout only reads the session.
  const session = await getSession();
  const unreadMessages = session ? await guestUnreadCount(session.user.id) : 0;

  return (
    <div className="min-h-svh bg-ivory text-ink">
      <AppHeader />

      <div className="shell grid grid-cols-1 gap-8 py-10 sm:py-14 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16 lg:py-20">
        {session && <AccountNav unreadMessages={unreadMessages} />}
        <main className="page-in min-w-0">{children}</main>
      </div>
    </div>
  );
}
