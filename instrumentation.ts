import type { Instrumentation } from "next";

/**
 * Error alerts (lib/monitoring/alerts.ts): every error the server catches while answering a
 * request, and any promise left to fail unhandled, is logged and, when new, emailed to ALERT_EMAIL.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("@/lib/monitoring/register-node");
    registerNode();
  }
}

const KIND: Record<string, string> = {
  render: "page render",
  route: "API or route handler",
  action: "server action (a form or button)",
  proxy: "proxy",
};

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { describe, reportError } = await import("@/lib/monitoring/alerts");
  await reportError({
    source: "server",
    ...describe(error),
    path: request.path,
    method: request.method,
    kind: `${KIND[context.routeType] ?? context.routeType} · ${context.routePath}`,
  });
};
