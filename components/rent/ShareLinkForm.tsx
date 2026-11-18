"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/errors";
import { ActionForm } from "@/components/workspace/forms";

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
type LinkData = { url?: string | null; email?: string };

/**
 * A form whose result is a one-time link for someone (a landlord or tenant) that the agent shares,
 * by WhatsApp or however they like. It's emailed too. The link is shown once: only its hash is kept.
 */
export function ShareLinkForm({ action, children, className, shareText, done }: { action: Action; children: React.ReactNode; className?: string; shareText: string; done?: React.ReactNode }) {
  const [link, setLink] = useState<LinkData | null>(null);
  const [copied, setCopied] = useState(false);

  if (link) {
    if (!link.url) return <div className="rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-3 text-[0.8125rem] text-graphite">{done ?? "Sent."}</div>;
    const url = link.url;
    return (
      <div className="space-y-3 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-3 text-[0.8125rem] text-graphite">
        <p>
          {done ?? "Link created."} We emailed it to <strong className="font-medium text-ink">{link.email}</strong>. Send it to them too: it works only for that email, once, for 72 hours,
          and this is the only time it&apos;s shown.
        </p>
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="winput w-full font-mono text-[0.75rem]" aria-label="The link" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="wbtn wbtn-primary wbtn-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a className="wbtn wbtn-secondary wbtn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`} target="_blank" rel="noopener noreferrer">
            Share on WhatsApp
          </a>
        </div>
      </div>
    );
  }
  return (
    <ActionForm action={action} className={className} onSuccess={(r) => setLink(((r as { data?: LinkData }).data ?? {}) as LinkData)}>
      {children}
    </ActionForm>
  );
}
