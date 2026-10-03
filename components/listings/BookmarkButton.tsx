"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { setBookmarkAction } from "@/app/(browse)/actions";

type Props = {
  propertyId: string;
  initialSaved: boolean;
  isLoggedIn: boolean;
  /** "overlay" sits on a photo; "button" is a full labelled button. */
  variant?: "overlay" | "button";
  onChange?: (saved: boolean) => void;
};

export function BookmarkButton({ propertyId, initialSaved, isLoggedIn, variant = "overlay", onChange }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggle = () => {
    if (!isLoggedIn) {
      const here = `${pathname}${searchParams.size ? `?${searchParams}` : ""}`;
      router.push(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    const next = !saved;
    setSaved(next); // optimistic
    setError(false);
    startTransition(async () => {
      const result = await setBookmarkAction(propertyId, next);
      if (!result.ok) {
        setSaved(!next);
        if (result.reason === "unauthenticated") router.push(`/login?next=${encodeURIComponent(pathname)}`);
        else setError(true);
        return;
      }
      onChange?.(result.saved);
    });
  };

  const label = saved ? "Remove from bookmarks" : "Save to bookmarks";
  const icon = (
    <svg viewBox="0 0 20 20" aria-hidden className="size-[1.125rem]">
      <path
        d="M5.5 3.5h9v13l-4.5-3.2-4.5 3.2z"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="transition-[fill] duration-200"
      />
    </svg>
  );

  if (variant === "button") {
    return (
      <div>
        <button type="button" onClick={toggle} aria-pressed={saved} disabled={pending} className={`btn w-full ${saved ? "btn-dark" : "btn-ghost-dark"}`}>
          {icon}
          <span>{saved ? "Saved to bookmarks" : "Save to bookmarks"}</span>
        </button>
        {error && (
          <p role="alert" className="mt-2 text-[0.8125rem] text-brick">
            Could not update your bookmarks. Please try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={label}
      title={error ? "Could not update. Try again." : label}
      disabled={pending}
      className={`grid size-10 place-items-center rounded-full border shadow-[0_4px_16px_-6px_rgb(0_0_0/0.4)] transition-colors duration-200 ${
        saved ? "border-ink bg-ink text-paper" : "border-white/60 bg-paper/90 text-ink hover:bg-paper"
      } ${error ? "ring-2 ring-brick" : ""}`}
    >
      {icon}
    </button>
  );
}
