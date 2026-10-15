import { describe, expect, it } from "vitest";
import { approveRequest, declineRequest, remindCaregivers, type CaregiverDeps } from "./caregiver";
import { DEMO_ADDRESS, type Household, type Order } from "./db";
import { checkTransition, type OrderStatus } from "./orders/state";

const household: Household = {
  id: "h1",
  senior: { id: "rose", householdId: "h1", role: "senior", name: "Rose", email: null, address: DEMO_ADDRESS, selfPayLimitCents: 2500, dailyCapCents: 6000 },
  caregiver: { id: "anna", householdId: "h1", role: "caregiver", name: "Anna", email: "anna@example.com", address: null, selfPayLimitCents: 2500, dailyCapCents: 6000 },
};

function setup(status: OrderStatus, opts: { paypalFails?: boolean; payerRole?: "caregiver" | null; paypalOrderId?: string | null } = {}) {
  const order = {
    id: "o1", userId: "rose", status, payerRole: opts.payerRole ?? null, paypalOrderId: opts.paypalOrderId ?? null, quantity: 1, totalCents: 6500,
    product: { productId: "p", title: "Monitor", priceCents: 6500, merchant: "walmart.com" },
  } as Order;
  const calls: { paypal: string[]; to: OrderStatus[]; saved: [string, string][] } = { paypal: [], to: [], saved: [] };
  const deps: CaregiverDeps = {
    getOrder: async (id) => (id === "o1" ? order : null),
    householdForUser: async () => household,
    transitionOrder: async (_id, to) => {
      const kind = checkTransition(order.status, to).kind;
      if (kind === "apply") {
        order.status = to;
        calls.to.push(to);
      }
      return { result: kind === "apply" ? "applied" : kind === "noop" ? "noop" : "rejected", order };
    },
    createPayPalOrder: async (input) => {
      calls.paypal.push(input.requestId);
      if (opts.paypalFails) throw new Error("down");
      return { paypalOrderId: "PP9", approveUrl: "https://paypal.test/approve/PP9" };
    },
    setPaypalOrderId: async (id, paypalOrderId) => {
      calls.saved.push([id, paypalOrderId]);
    },
    appUrl: "https://app.test",
  };
  return { deps, order, calls };
}

describe("approveRequest", () => {
  it("creates Anna's PayPal order and moves to AWAITING_PAYMENT", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER");
    expect(await approveRequest(deps, "o1")).toEqual({ ok: true, approveUrl: "https://paypal.test/approve/PP9" });
    expect(calls.paypal).toEqual(["create-o1-caregiver"]);
    expect(calls.to).toEqual(["AWAITING_PAYMENT"]);
  });

  it("lets Anna resume an unfinished payment with the same PayPal order", async () => {
    const { deps, calls } = setup("AWAITING_PAYMENT", { payerRole: "caregiver" });
    expect((await approveRequest(deps, "o1")).ok).toBe(true);
    expect(calls.paypal).toEqual(["create-o1-caregiver"]);
    expect(calls.to).toEqual([]);
  });

  it("saves a new PayPal order id when PayPal issues a fresh order on resume", async () => {
    const { deps, calls } = setup("AWAITING_PAYMENT", { payerRole: "caregiver", paypalOrderId: "PP-old" });
    expect((await approveRequest(deps, "o1")).ok).toBe(true);
    expect(calls.saved).toEqual([["o1", "PP9"]]);
  });

  it("does not rewrite the PayPal id when PayPal returns the same order", async () => {
    const { deps, calls } = setup("AWAITING_PAYMENT", { payerRole: "caregiver", paypalOrderId: "PP9" });
    await approveRequest(deps, "o1");
    expect(calls.saved).toEqual([]);
  });

  it("refuses a declined or blocked request", async () => {
    for (const s of ["DECLINED", "BLOCKED"] as const) {
      const result = await approveRequest(setup(s).deps, "o1");
      expect(result.ok).toBe(false);
    }
  });

  it("leaves the request waiting when PayPal is down", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER", { paypalFails: true });
    expect((await approveRequest(deps, "o1")).ok).toBe(false);
    expect(calls.to).toEqual([]);
  });
});

describe("declineRequest", () => {
  it("declines with a trimmed reason", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER");
    expect(await declineRequest(deps, "o1", "  Let's buy it together  ")).toBe(true);
    expect(calls.to).toEqual(["DECLINED"]);
  });
  it("does nothing for a request that is no longer waiting", async () => {
    expect(await declineRequest(setup("PAID").deps, "o1", "x")).toBe(false);
  });
});

describe("remindCaregivers", () => {
  it("emails once per waiting order and marks it reminded", async () => {
    const marked: string[] = [];
    const sent: string[] = [];
    const count = await remindCaregivers({
      ordersNeedingReminder: async () => [{ id: "o1", userId: "rose", product: { title: "Monitor" }, totalCents: 6500, merchant: "walmart.com", flags: [], summary: null } as unknown as Order],
      householdForUser: async () => household,
      markReminded: async (id) => {
        marked.push(id);
      },
      sendEmail: async (m) => {
        sent.push(m.to);
        return true;
      },
      appUrl: "https://app.test",
      fallbackEmail: null,
    });
    expect(count).toBe(1);
    expect(sent).toEqual(["anna@example.com"]);
    expect(marked).toEqual(["o1"]);
  });
});
