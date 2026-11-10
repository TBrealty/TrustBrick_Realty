"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/monitoring/report";

/**
 * When even the site's frame (the root layout) fails. It replaces the whole document, without the
 * site's stylesheet, so its styles are inline and follow the device's light or dark setting.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error, "browser: site error");
  }, [error]);

  return (
    <html lang="en-IN">
      <body style={{ margin: 0 }}>
        <title>Something went wrong — Trustbrick</title>
        <style>{`
          .ge{min-height:100svh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8f6f1;color:#0d1119;text-align:center}
          .ge p.k{font:500 12px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#b0502c;margin:0}
          .ge h1{font-size:28px;line-height:1.15;margin:16px 0 0;font-weight:600;letter-spacing:-.02em}
          .ge p.b{margin:12px 0 0;font-size:15px;line-height:1.6;color:#5f594e}
          .ge .a{margin-top:28px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
          .ge button,.ge a{font:inherit;font-size:15px;padding:12px 20px;border:1px solid #0d1119;cursor:pointer;text-decoration:none}
          .ge button{background:#0d1119;color:#f8f6f1}.ge a{background:transparent;color:#0d1119}
          .ge code{display:block;margin-top:28px;font:12px ui-monospace,monospace;color:#5f594e}
          @media (prefers-color-scheme:dark){.ge{background:#12151b;color:#f3f1ec}.ge p.b,.ge code{color:#a2a9b4}.ge button{background:#f3f1ec;color:#12151b;border-color:#f3f1ec}.ge a{color:#f3f1ec;border-color:#f3f1ec}}
        `}</style>
        <main className="ge">
          <div style={{ maxWidth: 440 }}>
            <p className="k">Something went wrong</p>
            <h1>Trustbrick didn&apos;t load properly</h1>
            <p className="b">The Trustbrick team has been told. Try again, or come back in a little while.</p>
            <div className="a">
              <button type="button" onClick={() => retry()}>
                Try again
              </button>
              {/* A full page load on purpose: the app's own navigation is what failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/">Go to the home page</a>
            </div>
            {error.digest && <code>Error ID {error.digest}</code>}
          </div>
        </main>
      </body>
    </html>
  );
}
