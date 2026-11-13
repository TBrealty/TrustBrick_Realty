import { receiveWebhook } from "@/lib/services/stays/payments";

/**
 * Payment provider webhooks: payments, refunds, payouts and host accounts. Each is checked against
 * the provider's signature (over the raw body), recorded once, then applied. Set this URL in the
 * provider's dashboard: https://<site>/api/webhooks/payments/cashfree
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await request.text();
  if (raw.length > 256_000) return new Response("Too large", { status: 413 });
  const result = await receiveWebhook(provider, raw, request.headers);
  return new Response(result.message, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
