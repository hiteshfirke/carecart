import type { Order, OrderPatch, Tracking, TransitionOutcome } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/state";

export type StoreDeps = {
  getOrder(id: string): Promise<Order | null>;
  addTracking(paypalOrderId: string, captureId: string, tracking: Tracking): Promise<void>;
  transitionOrder(id: string, to: OrderStatus, actor: string, patch?: OrderPatch): Promise<TransitionOutcome | null>;
};

// Demo-only: a stable fake USPS number derived from the order id.
export function trackingNumberFor(orderId: string): string {
  let hash = 7;
  for (const ch of orderId) hash = (hash * 31 + ch.charCodeAt(0)) % 1_000_000_007;
  return "9400" + String(hash).padStart(18, "0");
}

export async function shipOrder(deps: StoreDeps, orderId: string, seniorId: string): Promise<{ ok: true; tracking: Tracking } | { ok: false; message: string }> {
  const order = await deps.getOrder(orderId);
  if (!order || order.userId !== seniorId) return { ok: false, message: "Order not found." };
  if (order.status !== "PAID" || !order.paypalOrderId || !order.captureId) return { ok: false, message: "Only paid orders can be shipped." };
  const tracking: Tracking = { carrier: "USPS", number: trackingNumberFor(order.id) };
  try {
    await deps.addTracking(order.paypalOrderId, order.captureId, tracking);
  } catch (err) {
    console.error("PayPal tracking failed", err);
    return { ok: false, message: "PayPal didn't accept the tracking number. Please try again." };
  }
  await deps.transitionOrder(order.id, "SHIPPED", "store", { tracking });
  return { ok: true, tracking };
}
