// Live checks against the real services in .env.local: npm run smoke [channel3|paypal|email|ai|agent|voice]
import { randomUUID } from "node:crypto";
import { searchProducts } from "@/lib/channel3";
import { createPayPalOrder } from "@/lib/paypal";
import { sendEmail } from "@/lib/email";
import { assessRisk } from "@/lib/risk";
import { DEMO_ADDRESS } from "@/lib/db";
import { aiProvider } from "@/lib/ai/provider";
import { runTurn } from "@/lib/agent/run";
import { synthesizeSpeech, transcribeAudio } from "@/lib/voice";
import type { ProductOption } from "@/lib/channel3";

const checks: Record<string, () => Promise<string>> = {
  async channel3() {
    const started = Date.now();
    const options = await searchProducts("green tea", { maxPriceCents: 3000 });
    if (options.length === 0) throw new Error("no products returned");
    const list = options.map((o) => `${o.title} ($${(o.priceCents / 100).toFixed(2)})`).join("; ");
    return `${options.length} options in ${Date.now() - started} ms: ${list}`;
  },
  async paypal() {
    const id = randomUUID();
    const { paypalOrderId, approveUrl } = await createPayPalOrder({
      orderId: id,
      title: "Smoke test green tea",
      unitCents: 899,
      quantity: 1,
      shipTo: DEMO_ADDRESS,
      returnUrl: "http://localhost:3000/api/paypal/return",
      cancelUrl: "http://localhost:3000/api/paypal/cancel",
      requestId: `smoke-${id}`,
    });
    return `order ${paypalOrderId}, approve at ${new URL(approveUrl).host}`;
  },
  async email() {
    const to = process.env.DEMO_CAREGIVER_EMAIL;
    if (!to) throw new Error("DEMO_CAREGIVER_EMAIL is not set");
    const ok = await sendEmail({ to, subject: "CareCart smoke test", html: "<p>Email from CareCart works.</p>" });
    if (!ok) throw new Error("Resend rejected the email (see log above)");
    return "sent to DEMO_CAREGIVER_EMAIL";
  },
  // The AI risk check, on whichever provider AI_PROVIDER selects.
  async ai() {
    const started = Date.now();
    const risk = await assessRisk({
      seniorName: "Rose",
      caregiverName: "Anna",
      order: { title: "Green tea, 100 bags", quantity: 1, totalCents: 899, merchant: "example.com" },
      transcript: ["I need green tea"],
    });
    if (!risk) throw new Error("risk check returned null (see log above)");
    return `${aiProvider()}: risk ${risk.aiRisk.risk} in ${Date.now() - started} ms`;
  },
  // One real agent turn with tool calling: the model must call search_products (live Channel3).
  async agent() {
    const started = Date.now();
    let saved: ProductOption[] = [];
    const result = await runTurn({
      deps: {
        searchProducts: (query, maxPriceCents) => searchProducts(query, { maxPriceCents }),
        saveOptions: async (_session, options) => void (saved = options),
        getOptions: async () => saved,
        createDraftOrder: async () => {
          throw new Error("the smoke check never drafts an order");
        },
        listOrders: async () => [],
      },
      ctx: { userId: "smoke", sessionId: "smoke", caregiverName: "Anna" },
      userName: "Rose",
      history: [],
      userText: "I need reading glasses",
    });
    if (!result.options?.length) throw new Error(`the model did not search; it said: ${result.reply}`);
    return `${aiProvider()}: ${result.options.length} options in ${Date.now() - started} ms; reply: ${result.reply}`;
  },
  // Speaks a sentence with Orpheus, then transcribes the audio back with Whisper.
  async voice() {
    const started = Date.now();
    const wav = await synthesizeSpeech("Hello Rose, I found three reading glasses for you.");
    const spokeMs = Date.now() - started;
    const heard = await transcribeAudio(new Blob([wav], { type: "audio/wav" }), "speech.wav");
    if (!/reading glasses/i.test(heard)) throw new Error(`round trip heard: "${heard}"`);
    return `spoke ${Math.round(wav.byteLength / 1024)} KB in ${spokeMs} ms; Whisper heard "${heard}" (${Date.now() - started} ms total)`;
  },
};

async function main() {
  const only = process.argv[2];
  let failed = false;
  for (const [name, check] of Object.entries(checks)) {
    if (only && only !== name) continue;
    try {
      console.log(`PASS ${name}: ${await check()}`);
    } catch (err) {
      failed = true;
      console.log(`FAIL ${name}: ${(err as Error).message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
