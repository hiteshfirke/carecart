import { DEMO_ADDRESS, type Household, type Order, type OrderPatch, type TransitionOutcome } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/state";
import { statusWords } from "@/lib/orders/view";
import type { CreatePayPalOrderInput } from "@/lib/paypal";
import { reminderEmail, type SendEmail } from "@/lib/email";

export type CaregiverDeps = {
  getOrder(id: string): Promise<Order | null>;
  householdForUser(userId: string): Promise<Household | null>;
  transitionOrder(id: string, to: OrderStatus, actor: string, patch?: OrderPatch): Promise<TransitionOutcome | null>;
  createPayPalOrder(input: CreatePayPalOrderInput): Promise<{ paypalOrderId: string; approveUrl: string }>;
  appUrl: string;
};

export type ApproveResult = { ok: true; approveUrl: string } | { ok: false; message: string };

export async function approveRequest(deps: CaregiverDeps, orderId: string): Promise<ApproveResult> {
  const order = await deps.getOrder(orderId);
  const household = order ? await deps.householdForUser(order.userId) : null;
  if (!order || !household) return { ok: false, message: "This request was not found." };
  const resuming = order.status === "AWAITING_PAYMENT" && order.payerRole === "caregiver";
  if (order.status !== "AWAITING_CAREGIVER" && !resuming) {
    return { ok: false, message: `This request is already ${statusWords(order.status, household.caregiver.name)}.` };
  }
  let paypal: { paypalOrderId: string; approveUrl: string };
  try {
    // Same request id on retries, so PayPal returns the same order instead of a second one.
    paypal = await deps.createPayPalOrder({
      orderId: order.id,
      title: order.product.title,
      unitCents: order.product.priceCents,
      quantity: order.quantity,
      shipTo: household.senior.address ?? DEMO_ADDRESS,
      returnUrl: `${deps.appUrl}/api/paypal/return`,
      cancelUrl: `${deps.appUrl}/api/paypal/cancel`,
      requestId: `create-${order.id}-caregiver`,
    });
  } catch (err) {
    console.error("PayPal order creation failed", err);
    return { ok: false, message: "PayPal isn't answering right now. Nothing was charged. Please try again." };
  }
  if (!resuming) {
    await deps.transitionOrder(order.id, "AWAITING_PAYMENT", "caregiver", { paypalOrderId: paypal.paypalOrderId, payerRole: "caregiver" });
  }
  return { ok: true, approveUrl: paypal.approveUrl };
}

export async function declineRequest(deps: Pick<CaregiverDeps, "getOrder" | "transitionOrder">, orderId: string, reason: string): Promise<boolean> {
  const order = await deps.getOrder(orderId);
  if (!order || order.status !== "AWAITING_CAREGIVER") return false;
  const outcome = await deps.transitionOrder(order.id, "DECLINED", "caregiver", { declineReason: reason.trim().slice(0, 200) || "No reason given" });
  return outcome?.result === "applied";
}

export type ReminderDeps = {
  ordersNeedingReminder(hours: number): Promise<Order[]>;
  householdForUser(userId: string): Promise<Household | null>;
  markReminded(id: string): Promise<void>;
  sendEmail: SendEmail;
  appUrl: string;
  fallbackEmail: string | null;
};

export async function remindCaregivers(deps: ReminderDeps): Promise<number> {
  let sent = 0;
  for (const order of await deps.ordersNeedingReminder(24)) {
    const household = await deps.householdForUser(order.userId);
    const to = household?.caregiver.email ?? deps.fallbackEmail;
    if (!household || !to) continue;
    const ok = await deps.sendEmail({ to, ...reminderEmail(order, household.senior, `${deps.appUrl}/caregiver/requests/${order.id}`) });
    if (ok) {
      await deps.markReminded(order.id);
      sent++;
    }
  }
  return sent;
}
