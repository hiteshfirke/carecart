import { defaultPaymentDeps, handleWebhook } from "@/lib/payments";

export async function POST(req: Request) {
  const status = await handleWebhook(defaultPaymentDeps, req.headers, await req.text());
  return new Response(null, { status });
}
