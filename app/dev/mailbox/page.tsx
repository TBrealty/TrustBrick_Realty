import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { capturedEmails } from "@/lib/email/send";

export const metadata: Metadata = { title: "Dev mailbox — Trustbrick", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Renders plain text with any URLs turned into links, so flows can be clicked through locally. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} className="break-all text-brick underline underline-offset-2">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * Development only. Shows the emails the app would have sent, because no email
 * provider is configured yet. Returns 404 in every other environment.
 */
export default function DevMailboxPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const emails = capturedEmails();

  return (
    <main className="shell min-h-svh bg-ivory py-12 text-ink">
      <p className="eyebrow text-brick">Development only</p>
      <h1 className="display mt-4 text-[3rem]">Dev mailbox</h1>
      <p className="mt-3 max-w-[60ch] text-graphite">
        Emails captured in memory instead of being sent, newest first. They are cleared when the dev server restarts.
      </p>

      {emails.length === 0 ? (
        <p className="mt-10 text-stone-deep">No emails yet. Sign up or request a password reset to see one here.</p>
      ) : (
        <ol className="mt-10 space-y-6">
          {emails.map((email) => (
            <li key={email.id} className="border border-line-light bg-paper p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[1.0625rem] font-semibold">{email.subject}</h2>
                <time className="text-[0.8125rem] text-stone-deep" dateTime={email.sentAt.toISOString()}>
                  {email.sentAt.toLocaleTimeString("en-IN")}
                </time>
              </div>
              <p className="mt-1 text-[0.875rem] text-stone-deep">To: {email.to}</p>
              <pre className="mt-4 font-sans text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-graphite">
                <Linked text={email.text} />
              </pre>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
