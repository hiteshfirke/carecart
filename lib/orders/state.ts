export const ORDER_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "AWAITING_CAREGIVER",
  "AWAITING_PAYMENT",
  "PAID",
  "SHIPPED",
  "DECLINED",
  "CANCELLED",
  "BLOCKED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// For each target status, the statuses an order may come from. Anything else is rejected.
export const ALLOWED_FROM: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [],
  CONFIRMED: ["DRAFT"],
  AWAITING_CAREGIVER: ["CONFIRMED"],
  AWAITING_PAYMENT: ["CONFIRMED", "AWAITING_CAREGIVER"],
  PAID: ["AWAITING_PAYMENT"],
  SHIPPED: ["PAID"],
  DECLINED: ["AWAITING_CAREGIVER"],
  CANCELLED: ["DRAFT", "AWAITING_PAYMENT"],
  BLOCKED: ["CONFIRMED"],
};

export type TransitionCheck = { kind: "apply" } | { kind: "noop" } | { kind: "reject"; reason: string };

export function checkTransition(from: OrderStatus, to: OrderStatus): TransitionCheck {
  if (from === to) return { kind: "noop" };
  if (ALLOWED_FROM[to].includes(from)) return { kind: "apply" };
  return { kind: "reject", reason: `cannot move order from ${from} to ${to}` };
}

export function isPaidOrLater(status: OrderStatus): boolean {
  return status === "PAID" || status === "SHIPPED";
}
