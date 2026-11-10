import { z } from "zod";
import { clientIpFrom } from "@/lib/api/http";
import { limit } from "@/lib/auth/rate-limit";
import { reportError } from "@/lib/monitoring/alerts";
import { isNoise } from "@/lib/monitoring/throttle";

const MAX_BYTES = 8 * 1024;

const schema = z.object({
  message: z.string().min(1).max(1000),
  stack: z.string().max(4000).optional(),
  path: z.string().max(500).optional(),
  kind: z.string().max(80).optional(),
  digest: z.string().max(100).optional(),
});

/**
 * Errors from visitors' browsers (components/monitoring/ErrorReporter.tsx), passed on to the
 * error alerts. Same-site only, small, rate-limited per address, and noise is dropped. Always
 * answers 204, so it tells a caller nothing.
 */
export async function POST(request: Request) {
  const done = new Response(null, { status: 204 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) return done;

  const body = await request.text();
  if (body.length > MAX_BYTES) return done;
  let parsed;
  try {
    parsed = schema.safeParse(JSON.parse(body));
  } catch {
    return done;
  }
  if (!parsed.success || isNoise(parsed.data.message, parsed.data.stack)) return done;

  const limited = await limit([{ key: `client-error:${clientIpFrom(request)}`, rule: { max: 20, windowSeconds: 60 * 60 } }]);
  if (limited.limited) return done;

  await reportError({
    source: "browser",
    ...parsed.data,
    kind: parsed.data.kind ?? "browser",
    browser: request.headers.get("user-agent") ?? undefined,
  });
  return done;
}
