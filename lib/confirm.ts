import { evaluateRules, type RuleHistory } from "@/lib/safety/rules";
import { DEMO_ADDRESS, type Household, type Order, type OrderPatch, type TransitionOutcome } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/state";
import type { CreatePayPalOrderInput } from "@/lib/paypal";
import type { RiskAssessment, RiskInput } from "@/lib/risk";
import { requestEmail, scamAlertEmail, type SendEmail } from "@/lib/email";
import { caregiverLink } from "@/lib/caregiver";
import { giftPayPalInput, payablePayee } from "@/lib/gifts";

export type ConfirmDeps = {
  getOrder(id: string): Promise<Order | null>;
  ruleHistory(userId: string, productId: string, excludingOrderId: string): Promise<RuleHistory>;
  userUtterances(sessionId: string): Promise<string[]>;
  isTrusted(householdId: string, trustedPersonId: string): Promise<boolean>;
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

const ALREADY_CONFIRMED: ConfirmOutcome = { outcome: "error", message: "That order was already confirmed." };

// Only the request that actually moves DRAFT → CONFIRMED may email Anna or hand out a PayPal link.
async function claimConfirm(deps: ConfirmDeps, orderId: string, patch: OrderPatch): Promise<boolean> {
  return (await deps.transitionOrder(orderId, "CONFIRMED", "senior", patch))?.result === "applied";
}

export async function confirmOrder(deps: ConfirmDeps, household: Household, orderId: string, duplicateAcknowledged: boolean): Promise<ConfirmOutcome> {
  const { senior, caregiver } = household;
  const order = await deps.getOrder(orderId);
  if (!order || order.userId !== senior.id) return { outcome: "error", message: "I couldn't find that order." };
  if (order.status !== "DRAFT") return { outcome: "error", message: "That order was already confirmed." };

  // Money only goes to someone still on the trusted list. Anna may have removed them since the draft.
  const payee = payablePayee(order); // null for purchases
  if (order.kind === "gift") {
    if (!payee) return { outcome: "error", message: "I couldn't find that order." };
    if (!(await deps.isTrusted(household.id, payee.trustedPersonId))) {
      return { outcome: "error", message: `${payee.name} is no longer on your list of people you can send money to.` };
    }
  }
  const merchant = payee ? `${payee.name}${payee.relationship ? ` (${payee.relationship})` : ""}` : order.merchant;

  const transcript = order.sessionId ? await deps.userUtterances(order.sessionId) : [];
  const [history, risk] = await Promise.all([
    deps.ruleHistory(senior.id, order.product.productId, order.id),
    deps.assessRisk({
      seniorName: senior.name,
      caregiverName: caregiver.name,
      order: { title: order.product.title, quantity: order.quantity, totalCents: order.totalCents, merchant },
      transcript,
    }),
  ]);

  const result = evaluateRules({
    order: { totalCents: order.totalCents, productId: order.product.productId, title: order.product.title, category: order.product.category, merchant: order.merchant, kind: order.kind },
    limits: { selfPayLimitCents: senior.selfPayLimitCents, dailyCapCents: senior.dailyCapCents },
    history,
    transcript,
    aiRisk: risk?.aiRisk ?? null,
    duplicateAcknowledged,
  });

  if (result.route === "recheck") {
    const message = payee
      ? `You sent ${payee.name} money a few minutes ago. Say confirm to send again, or say cancel.`
      : "You ordered this same item a few minutes ago. Say confirm to order it again, or say cancel.";
    return { outcome: "recheck", message };
  }

  const confirmPatch: OrderPatch = { route: result.route, flags: result.flags, aiRisk: risk?.aiRisk, summary: risk?.caregiverSummary };

  if (result.route === "self_pay") {
    let paypal: { paypalOrderId: string; approveUrl: string };
    try {
      const requestId = `create-${order.id}-senior`;
      paypal = await deps.createPayPalOrder(
        payee
          ? giftPayPalInput(order, payee, senior.name, deps.appUrl, requestId)
          : {
              orderId: order.id,
              title: order.product.title,
              unitCents: order.product.priceCents,
              quantity: order.quantity,
              shipTo: senior.address ?? DEMO_ADDRESS,
              returnUrl: `${deps.appUrl}/api/paypal/return`,
              cancelUrl: `${deps.appUrl}/api/paypal/cancel`,
              requestId,
            },
      );
    } catch (err) {
      console.error("PayPal order creation failed", err);
      return { outcome: "error", message: "PayPal isn't answering right now, so nothing was charged. Please try again in a minute." };
    }
    if (!(await claimConfirm(deps, order.id, confirmPatch))) return ALREADY_CONFIRMED;
    await deps.transitionOrder(order.id, "AWAITING_PAYMENT", "system", { paypalOrderId: paypal.paypalOrderId, payerRole: "senior" });
    return { outcome: "pay", approveUrl: paypal.approveUrl };
  }

  if (!(await claimConfirm(deps, order.id, confirmPatch))) return ALREADY_CONFIRMED;
  const forEmail: Order = { ...order, flags: result.flags, summary: risk?.caregiverSummary ?? null };
  // Anna may open the email on her own phone, without Rose's cookie, so every link carries this request's token.
  const caregiverToken = deps.newToken();
  const link = caregiverLink(deps.appUrl, { id: order.id, caregiverToken });

  if (result.route === "blocked") {
    await deps.transitionOrder(order.id, "BLOCKED", "rules", { caregiverToken });
    if (deps.caregiverEmail) await deps.sendEmail({ to: deps.caregiverEmail, ...scamAlertEmail(forEmail, senior, link) });
    return {
      outcome: "blocked",
      reasons: result.flags.filter((f) => f.code === "S1_SCAM_PRODUCT" || f.code === "S1_SCAM_PHRASE").map((f) => f.message),
      caregiverName: caregiver.name,
    };
  }

  await deps.transitionOrder(order.id, "AWAITING_CAREGIVER", "rules", { caregiverToken });
  const emailed = deps.caregiverEmail ? await deps.sendEmail({ to: deps.caregiverEmail, ...requestEmail(forEmail, senior, link) }) : false;
  return { outcome: "caregiver", caregiverName: caregiver.name, emailed };
}
