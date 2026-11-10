"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/components/monitoring/report";

/**
 * When a page fails. A failure on the server is already reported there (instrumentation.ts) and
 * arrives here with only an error ID (its digest); a failure in the browser is reported from here.
 */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error, "browser: page error");
  }, [error]);

  return (
    <main className="grid min-h-svh place-items-center bg-paper px-6 py-24 text-center text-ink">
      <div className="max-w-md">
        <p className="font-mono text-[0.75rem] tracking-widest text-brick uppercase">Something went wrong</p>
        <h1 className="display mt-4 text-[clamp(2rem,5vw,2.75rem)] leading-[1.02]">
          This page didn&apos;t load <em>properly.</em>
        </h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-stone-deep">
          The Trustbrick team has been told. Try again, or come back in a little while.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className="btn btn-dark">
            <span>Try again</span>
          </button>
          <Link href="/" className="btn btn-ghost-dark">
            <span>Go to the home page</span>
          </Link>
        </div>
        {error.digest && <p className="mt-8 font-mono text-[0.75rem] text-stone-deep">Error ID {error.digest}</p>}
      </div>
    </main>
  );
}
