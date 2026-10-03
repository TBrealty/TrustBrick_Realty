import type { Metadata } from "next";
import { FormAlert } from "@/components/auth/fields";
import { requireSession } from "@/lib/auth/session";
import { INTENT_LABELS, isAccountIntent } from "@/lib/intents";
import { links } from "@/lib/site";

export const metadata: Metadata = { title: "Profile — Trustbrick" };

type Props = { searchParams: Promise<{ welcome?: string }> };

export default async function ProfilePage({ searchParams }: Props) {
  const { user } = await requireSession(links.profile);
  const { welcome } = await searchParams;

  const intent = isAccountIntent(user.intent) ? INTENT_LABELS[user.intent] : null;
  const memberSince = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(user.createdAt);
  const firstName = user.name.trim().split(/\s+/)[0];

  const rows: [string, React.ReactNode][] = [
    ["Name", user.name],
    [
      "Email",
      <span key="email" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="break-all">{user.email}</span>
        {user.emailVerified && (
          <span className="eyebrow inline-flex items-center gap-1.5 text-sage">
            <svg viewBox="0 0 12 12" aria-hidden className="size-3">
              <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Verified
          </span>
        )}
      </span>,
    ],
    ["Looking to", intent ?? <span className="text-stone-deep">Not set</span>],
    ["Member since", memberSince],
  ];

  return (
    <div className="max-w-2xl">
      {welcome === "1" && (
        <div className="mb-10">
          <FormAlert tone="success">Your email is confirmed and your account is active. Welcome to Trustbrick.</FormAlert>
        </div>
      )}

      <p className="eyebrow flex items-center gap-3 text-brick">
        <span aria-hidden className="h-px w-8 bg-current" />
        Profile
      </p>
      <h1 className="display mt-6 text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95]">
        Hello, <em>{firstName}.</em>
      </h1>

      <dl className="mt-12 border-t border-line-light">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b border-line-light py-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
            <dt className="text-[0.875rem] text-stone-deep">{label}</dt>
            <dd className="min-w-0 text-[1rem]">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 max-w-[52ch] text-[0.875rem] leading-relaxed text-stone-deep">
        Editing your profile and changing your password from here are on the way.
      </p>
    </div>
  );
}
