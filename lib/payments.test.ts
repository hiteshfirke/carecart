import { describe, expect, it } from "vitest";
import { handleCancel, handleReturn, handleWebhook, type PaymentDeps } from "./payments";
import { PayPalError } from "./paypal";
import type { Order, OrderPatch } from "./db";
import type { OrderStatus } from "./orders/state";
import { checkTransition } from "./orders/state";

function setup(status: OrderStatus, over: { caregiverToken?: string | null; payerRole?: "senior" | "caregiver"; capture?: () => Promise<{ orderStatus: string; captureId: string | null; captureStatus: string | null }>; verified?: boolean } = {}) {
  const order = { id: "o1", status, payerRole: over.payerRole ?? "senior", paypalOrderId: "PP1", caregiverToken: over.caregiverToken ?? null } as Order;
  const transitions: { to: OrderStatus; patch?: OrderPatch }[] = [];
  const captures: { id: string; requestId: string }[] = [];
  const deps: PaymentDeps = {
    getOrderByPaypalId: async (id) => (id === "PP1" ? order : null),
    capture: async (id, requestId) => {
      captures.push({ id, requestId });
      return over.capture ? over.capture() : { orderStatus: "COMPLETED", captureId: "CAP1", captureStatus: "COMPLETED" };
    },
    transitionOrder: async (_id, to, _actor, patch) => {
      const check = checkTransition(order.status, to);
      if (check.kind === "apply") {
        order.status = to;
        transitions.push({ to, patch });
      }
      return { result: check.kind === "apply" ? "applied" : check.kind === "noop" ? "noop" : "rejected", order };
    },
    verifyWebhook: async () => over.verified ?? true,
  };
  return { deps, order, transitions, captures };
}

const event = (type: string, orderId = "PP1") =>
  JSON.stringify({ event_type: type, resource: { id: "CAP9", supplementary_data: { related_ids: { order_id: orderId } } } });

describe("handleReturn", () => {
  it("captures once with an idempotency key and marks the order PAID", async () => {
    const { deps, transitions, captures } = setup("AWAITING_PAYMENT");
    expect(await handleReturn(deps, "PP1")).toBe("/talk?order=o1&payment=paid");
    expect(captures).toEqual([{ id: "PP1", requestId: "capture-PP1" }]);
    expect(transitions).toEqual([{ to: "PAID", patch: { captureId: "CAP1" } }]);
  });

  it("does not capture again when the return page is opened twice", async () => {
    const { deps, captures } = setup("AWAITING_PAYMENT");
    await handleReturn(deps, "PP1");
    expect(await handleReturn(deps, "PP1")).toBe("/talk?order=o1&payment=paid");
    expect(captures).toHaveLength(1);
  });

  it("sends the caregiver back to the request page", async () => {
    const { deps } = setup("AWAITING_PAYMENT", { payerRole: "caregiver" });
    expect(await handleReturn(deps, "PP1")).toBe("/caregiver/requests/o1?payment=paid");
  });

  it("keeps the caregiver's link token so Anna can see the result without the cookie", async () => {
    const { deps } = setup("AWAITING_PAYMENT", { payerRole: "caregiver", caregiverToken: "a b" });
    expect(await handleReturn(deps, "PP1")).toBe("/caregiver/requests/o1?payment=paid&t=a%20b");
  });

  it("cancels when PayPal declines the capture", async () => {
    const { deps, transitions } = setup("AWAITING_PAYMENT", { capture: async () => ({ orderStatus: "COMPLETED", captureId: "CAP1", captureStatus: "DECLINED" }) });
    expect(await handleReturn(deps, "PP1")).toBe("/talk?order=o1&payment=failed");
    expect(transitions.map((t) => t.to)).toEqual(["CANCELLED"]);
  });

  it("cancels on a 422 business error such as INSTRUMENT_DECLINED", async () => {
    const { deps, transitions } = setup("AWAITING_PAYMENT", {
      capture: async () => {
        throw new PayPalError("x", 422, "d", { details: [{ issue: "INSTRUMENT_DECLINED" }] });
      },
    });
    expect(await handleReturn(deps, "PP1")).toBe("/talk?order=o1&payment=failed");
    expect(transitions.map((t) => t.to)).toEqual(["CANCELLED"]);
  });

  it("never cancels when the capture might have happened", async () => {
    for (const err of [
      new Error("network down"),
      new PayPalError("x", 500, null, {}),
      new PayPalError("x", 422, null, { details: [{ issue: "ORDER_ALREADY_CAPTURED" }] }),
      new PayPalError("x", 422, null, { details: [{ issue: "SOMETHING_NEW" }] }),
    ]) {
      const { deps, transitions } = setup("AWAITING_PAYMENT", {
        capture: async () => {
          throw err;
        },
      });
      expect(await handleReturn(deps, "PP1")).toBe("/talk?order=o1&payment=pending");
      expect(transitions).toHaveLength(0);
    }
  });

  it("handles unknown or missing PayPal ids", async () => {
    const { deps } = setup("AWAITING_PAYMENT");
    expect(await handleReturn(deps, "NOPE")).toBe("/?payment=unknown");
    expect(await handleReturn(deps, null)).toBe("/?payment=unknown");
  });
});

describe("handleCancel", () => {
  it("cancels an unpaid order", async () => {
    const { deps, transitions } = setup("AWAITING_PAYMENT");
    expect(await handleCancel(deps, "PP1")).toBe("/talk?order=o1&payment=cancelled");
    expect(transitions.map((t) => t.to)).toEqual(["CANCELLED"]);
  });
});

describe("handleWebhook", () => {
  it("rejects an unverified event", async () => {
    const { deps, transitions } = setup("AWAITING_PAYMENT", { verified: false });
    expect(await handleWebhook(deps, new Headers(), event("PAYMENT.CAPTURE.COMPLETED"))).toBe(400);
    expect(transitions).toHaveLength(0);
  });

  it("marks the order PAID on PAYMENT.CAPTURE.COMPLETED", async () => {
    const { deps, transitions } = setup("AWAITING_PAYMENT");
    expect(await handleWebhook(deps, new Headers(), event("PAYMENT.CAPTURE.COMPLETED"))).toBe(200);
    expect(transitions).toEqual([{ to: "PAID", patch: { captureId: "CAP9" } }]);
  });

  it("ignores a late COMPLETED event when the return page already marked it PAID", async () => {
    const { deps, transitions } = setup("PAID");
    expect(await handleWebhook(deps, new Headers(), event("PAYMENT.CAPTURE.COMPLETED"))).toBe(200);
    expect(transitions).toHaveLength(0);
  });

  it("cancels on PAYMENT.CAPTURE.DENIED", async () => {
    const { deps, transitions } = setup("AWAITING_PAYMENT");
    await handleWebhook(deps, new Headers(), event("PAYMENT.CAPTURE.DENIED"));
    expect(transitions.map((t) => t.to)).toEqual(["CANCELLED"]);
  });

  it("acknowledges events for unknown orders", async () => {
    const { deps } = setup("AWAITING_PAYMENT");
    expect(await handleWebhook(deps, new Headers(), event("PAYMENT.CAPTURE.COMPLETED", "OTHER"))).toBe(200);
  });
});
