import { getOrderByPaypalId, transitionOrder, type Order, type OrderPatch, type TransitionOutcome } from "@/lib/db";
import { isPaidOrLater, type OrderStatus } from "@/lib/orders/state";
import { capturePayPalOrder, PayPalError, verifyWebhook } from "@/lib/paypal";

export type PaymentDeps = {
  getOrderByPaypalId(id: string): Promise<Order | null>;
  capture(paypalOrderId: string, requestId: string): Promise<{ orderStatus: string; captureId: string | null; captureStatus: string | null }>;
  transitionOrder(id: string, to: OrderStatus, actor: string, patch?: OrderPatch): Promise<TransitionOutcome | null>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
};

export type PaymentResult = "paid" | "pending" | "failed" | "cancelled" | "unknown";

export const defaultPaymentDeps: PaymentDeps = {
  getOrderByPaypalId,
  capture: (id, requestId) => capturePayPalOrder(id, requestId),
  transitionOrder,
  verifyWebhook: (headers, rawBody) => verifyWebhook(headers, rawBody),
};

export function landingFor(order: Order | null, result: PaymentResult): string {
  if (!order) return `/?payment=${result}`;
  if (order.payerRole === "caregiver") {
    const token = order.caregiverToken ? `&t=${encodeURIComponent(order.caregiverToken)}` : "";
    return `/caregiver/requests/${order.id}?payment=${result}${token}`;
  }
  return `/talk?order=${order.id}&payment=${result}`;
}

// PayPal 422 issues that mean no money was taken. Anything else might have captured, so we wait for the webhook.
const NOT_CAPTURED_ISSUES = ["INSTRUMENT_DECLINED", "ORDER_NOT_APPROVED", "PAYER_CANNOT_PAY", "TRANSACTION_REFUSED", "PAYER_ACTION_REQUIRED"];

function definitelyNotCaptured(err: unknown): boolean {
  if (!(err instanceof PayPalError) || err.status !== 422) return false;
  const body = JSON.stringify(err.body ?? "");
  return NOT_CAPTURED_ISSUES.some((issue) => body.includes(`"${issue}"`));
}

export async function handleReturn(deps: PaymentDeps, paypalOrderId: string | null): Promise<string> {
  if (!paypalOrderId) return landingFor(null, "unknown");
  const order = await deps.getOrderByPaypalId(paypalOrderId);
  if (!order) return landingFor(null, "unknown");
  if (isPaidOrLater(order.status)) return landingFor(order, "paid");
  if (order.status !== "AWAITING_PAYMENT") return landingFor(order, "failed");

  let capture: Awaited<ReturnType<PaymentDeps["capture"]>>;
  try {
    // Keyed on the PayPal order: after a caregiver rebind, an earlier attempt's key must not be replayed.
    capture = await deps.capture(paypalOrderId, `capture-${paypalOrderId}`);
  } catch (err) {
    console.error("PayPal capture error", err);
    if (definitelyNotCaptured(err)) {
      await deps.transitionOrder(order.id, "CANCELLED", "paypal", { declineReason: "payment_failed" });
      return landingFor(order, "failed");
    }
    return landingFor(order, "pending");
  }

  if (capture.captureStatus === "COMPLETED") {
    await deps.transitionOrder(order.id, "PAID", "return-page", { captureId: capture.captureId ?? undefined });
    return landingFor(order, "paid");
  }
  if (capture.captureStatus === "PENDING") return landingFor(order, "pending");
  await deps.transitionOrder(order.id, "CANCELLED", "paypal", { declineReason: "payment_denied" });
  return landingFor(order, "failed");
}

export async function handleCancel(deps: PaymentDeps, paypalOrderId: string | null): Promise<string> {
  if (!paypalOrderId) return landingFor(null, "unknown");
  const order = await deps.getOrderByPaypalId(paypalOrderId);
  if (!order) return landingFor(null, "unknown");
  if (order.status === "AWAITING_PAYMENT") {
    await deps.transitionOrder(order.id, "CANCELLED", order.payerRole ?? "senior", { declineReason: "payer_cancelled" });
  }
  return landingFor(order, isPaidOrLater(order.status) ? "paid" : "cancelled");
}

type WebhookEvent = {
  event_type?: string;
  resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
};

export async function handleWebhook(deps: PaymentDeps, headers: Headers, rawBody: string): Promise<number> {
  if (!(await deps.verifyWebhook(headers, rawBody))) return 400;
  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return 400;
  }
  const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  if (!paypalOrderId) return 200;
  const order = await deps.getOrderByPaypalId(paypalOrderId);
  if (!order) return 200;

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    if (order.status === "AWAITING_PAYMENT") {
      await deps.transitionOrder(order.id, "PAID", "webhook", { captureId: event.resource?.id });
    } else if (!isPaidOrLater(order.status)) {
      console.warn(`capture completed for order ${order.id} in status ${order.status}; needs manual review`);
    }
  }
  if (event.event_type === "PAYMENT.CAPTURE.DENIED" && order.status === "AWAITING_PAYMENT") {
    await deps.transitionOrder(order.id, "CANCELLED", "webhook", { declineReason: "payment_denied" });
  }
  return 200;
}
