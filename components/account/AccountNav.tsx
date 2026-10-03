"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { guestUnreadAction } from "@/app/account/(home-stay)/messages/actions";
import { MESSAGES_READ_EVENT } from "@/components/messages/events";
import { BookmarkIcon, MessageIcon, TripIcon, UserIcon } from "@/components/navigation/UserMenu";
import { links } from "@/lib/site";

const items = [
  { href: links.profile, label: "Profile", Icon: UserIcon },
  { href: links.bookmarks, label: "Bookmarks", Icon: BookmarkIcon },
  { href: links.trips, label: "Trips", Icon: TripIcon },
  { href: links.messages, label: "Messages", Icon: MessageIcon },
];

export function AccountNav({ unreadMessages: initialUnread = 0 }: { unreadMessages?: number }) {
  const pathname = usePathname();
  const [unreadMessages, setUnread] = useState(initialUnread);
  const list = useRef<HTMLUListElement>(null);

  // On phones the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    const ul = list.current;
    const active = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !active || ul.scrollWidth <= ul.clientWidth) return;
    const left = active.offsetLeft - ul.offsetLeft;
    if (left < ul.scrollLeft || left + active.offsetWidth > ul.scrollLeft + ul.clientWidth) ul.scrollLeft = left - 16;
  }, [pathname]);

  // The layout isn't re-rendered on navigation, so the count refreshes itself: on every page
  // change (reading a conversation clears it) and every half minute while the tab is visible.
  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      guestUnreadAction()
        .then((n) => !stopped && setUnread(n))
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

  return (
    <nav aria-label="Account">
      <p className="eyebrow mb-5 hidden text-stone-deep lg:block">Your account</p>
      {/* A row of tabs on small screens, a vertical list alongside the content on desktop. */}
      <ul ref={list} className="-mx-(--gutter) flex gap-1 overflow-x-auto border-b border-line-light px-(--gutter) [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0 lg:border-b-0 lg:px-0 lg:sticky lg:top-28">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 border-b-2 px-3 py-3 text-[0.9375rem] whitespace-nowrap transition-colors duration-200 lg:border-b-0 lg:border-l-2 lg:px-4 ${
                  active ? "border-ink font-medium text-ink" : "border-transparent text-stone-deep hover:text-ink"
                }`}
              >
                <Icon className="size-[1.125rem]" />
                {label}
                {href === links.messages && unreadMessages > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1.5 text-[0.6875rem] font-semibold text-on-contrast tabular-nums">
                    {unreadMessages}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
