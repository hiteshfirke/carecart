import { evaluateRules, type RuleHistory } from "@/lib/safety/rules";
import { DEMO_ADDRESS, type Household, type Order, type OrderPatch, type TransitionOutcome } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/state";
import type { CreatePayPalOrderInput } from "@/lib/paypal";
import type { RiskAssessment, RiskInput } from "@/lib/risk";
import { requestEmail, scamAlertEmail, type SendEmail } from "@/lib/email";

export type ConfirmDeps = {
  getOrder(id: string): Promise<Order | null>;
  ruleHistory(userId: string, productId: string, excludingOrderId: string): Promise<RuleHistory>;
  userUtterances(sessionId: string): Promise<string[]>;
  assessRisk(input: RiskInput): Promise<RiskAssessment | null>;
  transitionOrder(id: string, to: OrderStatus, actor: string, patch?: OrderPatch): Promise<TransitionOutcome | null>;
  createPayPalOrder(input: CreatePayPalOrderInput): Promise<{ paypalOrderId: string; approveUrl: string }>;
  sendEmail: SendEmail;
  appUrl: string;
  caregiverEmail: string | null;
  newToken(): string;
};

export type ConfirmOutcome =
  | { outcome: "pay"; approveUrl: string }
  | { outcome: "caregiver"; caregiverName: string; emailed: boolean }
  | { outcome: "blocked"; reasons: string[]; caregiverName: string }
  | { outcome: "recheck"; message: string }
  | { outcome: "error"; message: string };

export async function confirmOrder(deps: ConfirmDeps, household: Household, orderId: string, duplicateAcknowledged: boolean): Promise<ConfirmOutcome> {
  const { senior, caregiver } = household;
  const order = await deps.getOrder(orderId);
  if (!order || order.userId !== senior.id) return { outcome: "error", message: "I couldn't find that order." };
  if (order.status !== "DRAFT") return { outcome: "error", message: "That order was already confirmed." };

  const transcript = order.sessionId ? await deps.userUtterances(order.sessionId) : [];
  const [history, risk] = await Promise.all([
    deps.ruleHistory(senior.id, order.product.productId, order.id),
    deps.assessRisk({
      seniorName: senior.name,
      caregiverName: caregiver.name,
      order: { title: order.product.title, quantity: order.quantity, totalCents: order.totalCents, merchant: order.merchant },
      transcript,
    }),
  ]);

  const result = evaluateRules({
    order: { totalCents: order.totalCents, productId: order.product.productId, title: order.product.title, category: order.product.category, merchant: order.merchant },
    limits: { selfPayLimitCents: senior.selfPayLimitCents, dailyCapCents: senior.dailyCapCents },
    history,
    transcript,
    aiRisk: risk?.aiRisk ?? null,
    duplicateAcknowledged,
  });

  if (result.route === "recheck") {
    return { outcome: "recheck", message: "You ordered this same item a few minutes ago. Say confirm to order it again, or say cancel." };
  }

  const confirmPatch: OrderPatch = { route: result.route, flags: result.flags, aiRisk: risk?.aiRisk, summary: risk?.caregiverSummary };

  if (result.route === "self_pay") {
    let paypal: { paypalOrderId: string; approveUrl: string };
    try {
      paypal = await deps.createPayPalOrder({
        orderId: order.id,
        title: order.product.title,
        unitCents: order.product.priceCents,
        quantity: order.quantity,
        shipTo: senior.address ?? DEMO_ADDRESS,
        returnUrl: `${deps.appUrl}/api/paypal/return`,
        cancelUrl: `${deps.appUrl}/api/paypal/cancel`,
        requestId: `create-${order.id}-senior`,
      });
    } catch (err) {
      console.error("PayPal order creation failed", err);
      return { outcome: "error", message: "PayPal isn't answering right now, so nothing was charged. Please try again in a minute." };
    }
    await deps.transitionOrder(order.id, "CONFIRMED", "senior", confirmPatch);
    await deps.transitionOrder(order.id, "AWAITING_PAYMENT", "system", { paypalOrderId: paypal.paypalOrderId, payerRole: "senior" });
    return { outcome: "pay", approveUrl: paypal.approveUrl };
  }

  await deps.transitionOrder(order.id, "CONFIRMED", "senior", confirmPatch);
  const forEmail: Order = { ...order, flags: result.flags, summary: risk?.caregiverSummary ?? null };

  if (result.route === "blocked") {
    await deps.transitionOrder(order.id, "BLOCKED", "rules");
    if (deps.caregiverEmail) await deps.sendEmail({ to: deps.caregiverEmail, ...scamAlertEmail(forEmail, senior, `${deps.appUrl}/caregiver`) });
    return {
      outcome: "blocked",
      reasons: result.flags.filter((f) => f.code === "S1_SCAM_PRODUCT" || f.code === "S1_SCAM_PHRASE").map((f) => f.message),
      caregiverName: caregiver.name,
    };
  }

  const caregiverToken = deps.newToken();
  await deps.transitionOrder(order.id, "AWAITING_CAREGIVER", "rules", { caregiverToken });
  const link = `${deps.appUrl}/caregiver/requests/${order.id}?t=${encodeURIComponent(caregiverToken)}`;
  const emailed = deps.caregiverEmail ? await deps.sendEmail({ to: deps.caregiverEmail, ...requestEmail(forEmail, senior, link) }) : false;
  return { outcome: "caregiver", caregiverName: caregiver.name, emailed };
}
