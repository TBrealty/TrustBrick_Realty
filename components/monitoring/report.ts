import { isNoise } from "@/lib/monitoring/throttle";

// At most a few reports from one page view, so a fault in a loop can't keep calling home.
let sent = 0;
const MAX_PER_PAGE = 5;

/** Sends a browser error to /api/client-errors (and on to the error alerts). Never throws. */
export function reportClientError(thrown: unknown, kind: string) {
  try {
    if (sent >= MAX_PER_PAGE) return;
    const error = thrown instanceof Error ? thrown : null;
    const message = (error ? error.message || error.name : typeof thrown === "string" ? thrown : "") || "";
    if (!message || isNoise(message, error?.stack)) return;
    sent += 1;
    const digest = error && "digest" in error && error.digest ? String(error.digest) : undefined;
    const body = JSON.stringify({
      message: message.slice(0, 1000),
      stack: error?.stack?.slice(0, 4000),
      path: window.location.pathname,
      kind,
      digest,
    });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/client-errors", blob)) {
      void fetch("/api/client-errors", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch {
    // Reporting must never cause a second fault.
  }
}
