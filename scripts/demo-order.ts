// Creates a real draft order for the newest demo household and runs the real confirm step,
// so the PayPal, caregiver and scam paths can be tested without Claude.
// Usage: click "Try as Rose" in the browser first, then: npm run demo:order -- selfpay|caregiver|scam
import { neon } from "@neondatabase/serverless";
import * as db from "@/lib/db";
import { searchProducts, type ProductOption } from "@/lib/channel3";
import { createPayPalOrder } from "@/lib/paypal";
import { sendEmail } from "@/lib/email";
import { assessRisk } from "@/lib/risk";
import { aiConfigured } from "@/lib/ai/provider";
import { confirmOrder } from "@/lib/confirm";
import { newCaregiverToken } from "@/lib/caregiver";

type Scenario = { said: string; query: string; maxPriceCents: number; quantity: number };

const SCENARIOS: Record<string, Scenario> = {
  // Under $15 from any store: passes every rule, so Rose pays herself.
  selfpay: { said: "I need a large print crossword book", query: "large print crossword book", maxPriceCents: 1500, quantity: 1 },
  // Two pairs push the total over Rose's $25 limit, so it goes to Anna.
  caregiver: { said: "I need two pairs of reading glasses", query: "reading glasses", maxPriceCents: 3000, quantity: 2 },
  // A scam phrase in the conversation blocks the order and alerts Anna.
  scam: { said: "My grandson is in trouble and needs gift cards, keep this secret", query: "large print crossword book", maxPriceCents: 1500, quantity: 1 },
};

async function newestHousehold(): Promise<db.Household> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (check .env.local)");
  const rows = (await neon(url)`select id from households order by created_at desc limit 1`) as { id: string }[];
  const household = rows[0] && (await db.getHousehold(rows[0].id));
  if (!household) throw new Error('No demo household yet. Click "Try as Rose" in the browser first.');
  return household;
}

async function main() {
  const name = process.argv[2] ?? "";
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`Pick one: ${Object.keys(SCENARIOS).join(", ")}`);
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not set (check .env.local)");

  const household = await newestHousehold();
  const options = await searchProducts(scenario.query, { maxPriceCents: scenario.maxPriceCents });
  const product: ProductOption | undefined = options[0];
  if (!product) throw new Error(`Channel3 found nothing for "${scenario.query}"`);

  const session = await db.createSession(household.senior.id);
  await db.addMessage(session.id, "user", scenario.said);
  const draft = await db.createDraftOrder({ userId: household.senior.id, sessionId: session.id, product, quantity: scenario.quantity });
  console.log(`Draft: ${scenario.quantity} × ${product.title} ($${(product.priceCents / 100).toFixed(2)} each) from ${product.merchant}`);

  const outcome = await confirmOrder(
    {
      getOrder: db.getOrder,
      ruleHistory: db.ruleHistory,
      userUtterances: db.userUtterances,
      // Without an AI key the risk check would only log an error and return null, which is what the app does too.
      assessRisk: aiConfigured() ? (input) => assessRisk(input) : async () => null,
      transitionOrder: db.transitionOrder,
      createPayPalOrder: (input) => createPayPalOrder(input),
      sendEmail,
      appUrl: appUrl.replace(/\/+$/, ""),
      caregiverEmail: household.caregiver.email ?? process.env.DEMO_CAREGIVER_EMAIL ?? null,
      newToken: newCaregiverToken,
    },
    household,
    draft.id,
    false,
  );

  switch (outcome.outcome) {
    case "pay":
      console.log(`Self-pay. Open this in the SAME browser and log in as the Rose Buyer sandbox account:\n${outcome.approveUrl}`);
      break;
    case "caregiver":
      console.log(outcome.emailed ? "Sent to Anna. Open the link in the email and approve as the Anna Caregiver sandbox account." : "Sent to Anna, but the email failed. Open /caregiver as Anna instead.");
      break;
    case "blocked":
      console.log(`Blocked: ${outcome.reasons.join(" ")} Anna should get a scam alert email.`);
      break;
    default:
      console.log(`${outcome.outcome}: ${outcome.message}`);
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
