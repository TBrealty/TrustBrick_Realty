/**
 * Which errors are worth an email, and how often. Pure, so it runs (and is tested) anywhere; the
 * sender is lib/monitoring/alerts.ts.
 *
 * - Errors are grouped by a fingerprint: the message with numbers, IDs and references blanked out,
 *   plus the first line of the stack. The same fault on a thousand pages is one group.
 * - A group is emailed at most once an hour; the next email says how many more there were.
 * - Each source has its own hourly cap (server 20, browser 10), so a flood of browser reports can
 *   never crowd out the server's.
 */

export type ErrorSource = "server" | "browser";

export const HOUR_MS = 60 * 60 * 1000;
export const CAPS: Record<ErrorSource, number> = { server: 20, browser: 10 };

export type ThrottleState = {
  groups: Map<string, { lastSentAt: number; since: number }>;
  sent: Record<ErrorSource, number[]>;
};

export const newThrottleState = (): ThrottleState => ({ groups: new Map(), sent: { server: [], browser: [] } });

/** The message with the parts that change from one occurrence to the next blanked out. */
export function normaliseMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[A-Z]{2,5}-[0-9A-Z]{6,}\b/g, "<ref>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function fingerprint(source: ErrorSource, message: string, stack?: string): string {
  // The first frame, without line and column numbers (they change with every build).
  const frame = (stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("at "))
    ?.replace(/:\d+:\d+\)?$/, "")
    .replace(/\?[^\s)]*/, "");
  return `${source}|${normaliseMessage(message)}|${frame ?? ""}`;
}

/**
 * Whether to email this occurrence now, and how many of the same were held back since the last
 * email. Updates `state`.
 */
export function decide(state: ThrottleState, source: ErrorSource, key: string, now: number): { send: boolean; heldBack: number } {
  const group = state.groups.get(key);
  if (group && now - group.lastSentAt < HOUR_MS) {
    group.since += 1;
    return { send: false, heldBack: 0 };
  }
  const recent = (state.sent[source] = state.sent[source].filter((t) => now - t < HOUR_MS));
  if (recent.length >= CAPS[source]) {
    if (group) group.since += 1;
    return { send: false, heldBack: 0 };
  }
  recent.push(now);
  const heldBack = group?.since ?? 0;
  state.groups.set(key, { lastSentAt: now, since: 0 });
  // Forget groups not seen for a day, so the map can't grow without end.
  if (state.groups.size > 500) {
    for (const [k, g] of state.groups) if (now - g.lastSentAt > 24 * HOUR_MS) state.groups.delete(k);
  }
  return { send: true, heldBack };
}

/**
 * Browser errors that aren't ours or aren't real faults: browser extensions, cross-origin scripts
 * the browser hides the details of, a known harmless Chrome warning, and an old tab asking for code
 * that a newer deploy has replaced (a reload fixes it).
 */
export function isNoise(message: string, stack?: string): boolean {
  const msg = message.trim();
  const anywhere = `${msg}\n${stack ?? ""}`;
  return (
    [/^Script error\.?$/i, /^Non-Error promise rejection captured/i, /^(AbortError|The (user|operation) aborted)/i].some((re) => re.test(msg)) ||
    [
      /ResizeObserver loop/i,
      /(chrome|moz|safari(-web)?)-extension:\/\//i,
      /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module/i,
    ].some((re) => re.test(anywhere))
  );
}
