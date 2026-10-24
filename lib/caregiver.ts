import { randomBytes, timingSafeEqual } from "node:crypto";
import { DEMO_ADDRESS, type Household, type Order, type OrderPatch, type Role, type TransitionOutcome } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/state";
import type { CreatePayPalOrderInput } from "@/lib/paypal";
import { reminderEmail, type SendEmail } from "@/lib/email";
import type { ErrorCode } from "@/lib/errors";

export type CaregiverDeps = {
  getOrder(id: string): Promise<Order | null>;
  householdForUser(userId: string): Promise<Household | null>;
  isTrusted(householdId: string, trustedPersonId: string): Promise<boolean>;
  transitionOrder(id: string, to: OrderStatus, actor: string, patch?: OrderPatch): Promise<TransitionOutcome | null>;
  createPayPalOrder(input: CreatePayPalOrderInput): Promise<{ paypalOrderId: string; approveUrl: string }>;
  setPaypalOrderId(id: string, paypalOrderId: string, payerRole: Role): Promise<boolean>;
  appUrl: string;
};

// approveUrl is null for a gift: Anna only approves it, and Rose pays from her own PayPal.
export type ApproveResult = { ok: true; approveUrl: string | null } | { ok: false; code: ErrorCode };

// Who is asking: the household cookie (Anna on the demo dashboard) and/or the token from her email link.
export type Viewer = { household: Household | null; token: string | null };

export function newCaregiverToken(): string {
  return randomBytes(32).toString("base64url");
}

export function caregiverLink(appUrl: string, order: Pick<Order, "id" | "caregiverToken">): string {
  const base = `${appUrl}/caregiver/requests/${order.id}`;
  return order.caregiverToken ? `${base}?t=${encodeURIComponent(order.caregiverToken)}` : base;
}

export function canActOnRequest(order: Pick<Order, "userId" | "caregiverToken">, viewer: Viewer): boolean {
  if (viewer.household && viewer.household.senior.id === order.userId) return true;
  if (!viewer.token || !order.caregiverToken) return false;
  const given = Buffer.from(viewer.token);
  const expected = Buffer.from(order.caregiverToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function approveRequest(deps: CaregiverDeps, orderId: string, viewer: Viewer): Promise<ApproveResult> {
  const order = await deps.getOrder(orderId);
  if (!order || !canActOnRequest(order, viewer)) return { ok: false, code: "not_found" };
  const household = await deps.householdForUser(order.userId);
  if (!household) return { ok: false, code: "not_found" };
  const gift = order.kind === "gift";
  const resuming = !gift && order.status === "AWAITING_PAYMENT" && order.payerRole === "caregiver";
  if (order.status !== "AWAITING_CAREGIVER" && !resuming) {
    return { ok: false, code: "not_waiting" };
  }
  if (gift) {
    // Anna may have removed the person since Rose asked; an approved gift to them could never be sent.
    const personId = order.payee?.trustedPersonId;
    if (!personId || !(await deps.isTrusted(household.id, personId))) return { ok: false, code: "not_trusted" };
    // It stays Rose's money: Anna's OK hands the payment back to Rose, and no PayPal order exists yet.
    const outcome = await deps.transitionOrder(order.id, "AWAITING_PAYMENT", "caregiver", { payerRole: "senior" });
    return !outcome || outcome.result === "rejected" ? { ok: false, code: "not_waiting" } : { ok: true, approveUrl: null };
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
    return { ok: false, code: "paypal_down" };
  }
  if (!resuming) {
    await deps.transitionOrder(order.id, "AWAITING_PAYMENT", "caregiver", { paypalOrderId: paypal.paypalOrderId, payerRole: "caregiver" });
  } else if (paypal.paypalOrderId !== order.paypalOrderId) {
    // PayPal forgets idempotency keys after a while and may issue a new order; the return page must find it.
    // The superseded PayPal order was never captured by us, so no money is attached to it.
    console.info(`order ${order.id}: PayPal order ${order.paypalOrderId} superseded by ${paypal.paypalOrderId}`);
    if (!(await deps.setPaypalOrderId(order.id, paypal.paypalOrderId, "caregiver"))) {
      return { ok: false, code: "request_changed" };
    }
  }
  return { ok: true, approveUrl: paypal.approveUrl };
}

export async function declineRequest(
  deps: Pick<CaregiverDeps, "getOrder" | "transitionOrder">,
  orderId: string,
  reason: string,
  viewer: Viewer,
): Promise<boolean> {
  const order = await deps.getOrder(orderId);
  if (!order || !canActOnRequest(order, viewer) || order.status !== "AWAITING_CAREGIVER") return false;
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
    const ok = await deps.sendEmail({ to, ...reminderEmail(order, household.senior, caregiverLink(deps.appUrl, order)) });
    if (ok) {
      await deps.markReminded(order.id);
      sent++;
    }
  }
  return sent;
}
