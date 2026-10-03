"use client";

import Link from "next/link";
import { useState } from "react";
import { REFERENCE_ENTITIES, type ReferencePrefix } from "@/lib/reference";
import { Icon } from "./icons";

/**
 * A reference ID, shown the same way everywhere: monospace, copyable, optionally a link.
 * The accessible name says what kind of record it is ("Listing reference LST-…").
 */
export function ReferenceId({ value, href, copy = true, className = "" }: { value: string; href?: string; copy?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const prefix = value.split("-")[0] as ReferencePrefix;
  const kind = REFERENCE_ENTITIES[prefix]?.label ?? "Record";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the ID is still selectable text.
    }
  };

  const text = <span className="font-mono text-[0.75rem] tracking-wide">{value}</span>;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
      {href ? (
        <Link href={href} className="text-ink underline decoration-ink/20 underline-offset-2 hover:decoration-ink" aria-label={`${kind} reference ${value}`}>
          {text}
        </Link>
      ) : (
        <span aria-label={`${kind} reference ${value}`}>{text}</span>
      )}
      {copy && (
        <button
          type="button"
          onClick={onCopy}
          className="grid grid-cols-1 size-6 place-items-center rounded-[3px] text-stone-deep hover:bg-ink/6 hover:text-ink"
          aria-label={copied ? `Copied ${value}` : `Copy ${value}`}
          title={copied ? "Copied" : "Copy"}
        >
          <Icon name={copied ? "check" : "copy"} className="size-3.5" />
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </span>
  );
}
