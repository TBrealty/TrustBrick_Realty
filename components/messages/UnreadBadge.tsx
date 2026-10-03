"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { guestUnreadAction } from "@/app/account/(home-stay)/messages/actions";
import { MESSAGES_READ_EVENT } from "./events";

/**
 * The number of conversations with something unread, beside a Messages link. It refreshes
 * itself on navigation, when a conversation is read on this page, and every half minute
 * while the tab is visible.
 */
export function UnreadBadge({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      guestUnreadAction()
        .then((n) => !stopped && setCount(n))
        .catch(() => {});
    };
    const first = setTimeout(refresh, 400);
    const timer = setInterval(refresh, 30_000);
    window.addEventListener(MESSAGES_READ_EVENT, refresh);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener(MESSAGES_READ_EVENT, refresh);
    };
  }, [pathname]);

  if (count <= 0) return null;
  return (
    <span className="ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1.5 text-[0.6875rem] font-semibold text-on-contrast tabular-nums">
      {count}
      <span className="sr-only"> unread</span>
    </span>
  );
}
