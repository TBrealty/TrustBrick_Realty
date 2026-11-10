import "server-only";
import { sendEmail } from "@/lib/email/send";
import { decide, fingerprint, newThrottleState, type ErrorSource, type ThrottleState } from "./throttle";

export type ErrorReport = {
  source: ErrorSource;
  message: string;
  stack?: string;
  /** Next.js's error digest: matches the line in the server's logs. */
  digest?: string;
  /** The page or endpoint, without its query string (that can hold what people typed). */
  path?: string;
  method?: string;
  /** What was happening: "page render", "server action", "browser", … */
  kind?: string;
  browser?: string;
};

// One per server process; globalThis keeps it across hot reloads in development.
const store = globalThis as unknown as { trustbrickAlerts?: ThrottleState };

const recipients = () =>
  (process.env.ALERT_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Records an error: always one line in the server's logs, and an email to ALERT_EMAIL when it's
 * new (lib/monitoring/throttle.ts decides). Never throws, so reporting can't cause a second fault.
 */
export async function reportError(report: ErrorReport): Promise<void> {
  try {
    const path = report.path?.split("?")[0];
    console.error(
      `[error] ${JSON.stringify({ source: report.source, kind: report.kind, method: report.method, path, digest: report.digest, message: report.message.slice(0, 500) })}`,
    );
    // Without ALERT_EMAIL, logs only. In development, emails land in /dev/mailbox, not anyone's inbox.
    const to = recipients();
    if (to.length === 0) return;

    const state = (store.trustbrickAlerts ??= newThrottleState());
    const { send, heldBack } = decide(state, report.source, fingerprint(report.source, report.message, report.stack), Date.now());
    if (!send) return;

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" });
    const facts: [string, string | undefined][] = [
      ["When", `${when} IST`],
      ["Where", path ? `${report.method ? `${report.method} ` : ""}${site}${path}` : undefined],
      ["What", report.kind],
      ["Error ID", report.digest],
      ["Browser", report.browser?.slice(0, 200)],
      ["Since the last email", heldBack ? `${heldBack} more of the same` : undefined],
    ];
    const shown = facts.filter((f): f is [string, string] => Boolean(f[1]));
    const stack = (report.stack ?? "").split("\n").slice(0, 15).join("\n");
    const title = report.source === "server" ? "Server error" : "Browser error";
    const message = report.message.slice(0, 1000);

    for (const address of to) {
      await sendEmail({
        to: address,
        subject: `[Trustbrick] ${title}: ${message.slice(0, 90)}`,
        text: [
          `${title} on ${site || "the site"}`,
          "",
          message,
          "",
          ...shown.map(([k, v]) => `${k}: ${v}`),
          ...(stack ? ["", stack] : []),
          "",
          "The same error is emailed at most once an hour. Search the server's logs for the error ID: docker compose logs app | grep <ID>",
        ].join("\n"),
        html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#0d1119">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b0502c">${escape(title)}</p>
  <p style="margin:0 0 16px;font-size:16px;font-weight:600">${escape(message)}</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${shown
    .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#5f594e;vertical-align:top">${escape(k)}</td><td style="padding:3px 0">${escape(v)}</td></tr>`)
    .join("")}</table>
  ${stack ? `<pre style="margin:0 0 16px;padding:12px;background:#f2eee6;font-size:12px;white-space:pre-wrap">${escape(stack)}</pre>` : ""}
  <p style="margin:0;font-size:12px;color:#5f594e">The same error is emailed at most once an hour. Search the server's logs for the error ID: <code>docker compose logs app | grep &lt;ID&gt;</code></p>
</div>`,
      });
    }
  } catch (error) {
    console.error("[error] couldn't report an error:", error instanceof Error ? error.message : error);
  }
}

/** Message and stack from anything that was thrown. */
export function describe(thrown: unknown): { message: string; stack?: string; digest?: string } {
  if (thrown instanceof Error) {
    const digest = "digest" in thrown && thrown.digest ? String(thrown.digest) : undefined;
    return { message: thrown.message || thrown.name, stack: thrown.stack, digest };
  }
  return { message: typeof thrown === "string" ? thrown : JSON.stringify(thrown)?.slice(0, 500) ?? String(thrown) };
}
