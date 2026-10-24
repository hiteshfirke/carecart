import { describe, expect, it } from "vitest";
import { approveRequest, canActOnRequest, declineRequest, remindCaregivers, type CaregiverDeps } from "./caregiver";
import { DEMO_ADDRESS, type Household, type Order, type OrderPatch } from "./db";
import { checkTransition, type OrderStatus } from "./orders/state";

const household: Household = {
  id: "h1",
  senior: { id: "rose", householdId: "h1", role: "senior", name: "Rose", email: null, address: DEMO_ADDRESS, selfPayLimitCents: 2500, dailyCapCents: 6000 },
  caregiver: { id: "anna", householdId: "h1", role: "caregiver", name: "Anna", email: "anna@example.com", address: null, selfPayLimitCents: 2500, dailyCapCents: 6000 },
};

const owner = { household, token: null };
const TOKEN = "t".repeat(43);

describe("canActOnRequest", () => {
  const order = { userId: "rose", caregiverToken: TOKEN } as Order;
  it("allows the household that owns the order (cookie)", () => {
    expect(canActOnRequest(order, owner)).toBe(true);
  });
  it("allows the matching caregiver token from the email link", () => {
    expect(canActOnRequest(order, { household: null, token: TOKEN })).toBe(true);
  });
  it("rejects a wrong, short or missing token and other households", () => {
    expect(canActOnRequest(order, { household: null, token: "u".repeat(43) })).toBe(false);
    expect(canActOnRequest(order, { household: null, token: "short" })).toBe(false);
    expect(canActOnRequest(order, { household: null, token: null })).toBe(false);
    expect(canActOnRequest(order, { household: { ...household, senior: { ...household.senior, id: "someone-else" } }, token: null })).toBe(false);
  });
  it("rejects any token when the order has none", () => {
    expect(canActOnRequest({ userId: "rose", caregiverToken: null } as Order, { household: null, token: TOKEN })).toBe(false);
  });
});

const samPayee = { trustedPersonId: "t1", name: "Sam", relationship: "grandson", paypalEmail: "sam@example.com" };

function setup(
  status: OrderStatus,
  opts: { paypalFails?: boolean; paypalOrderId?: string | null; saveFails?: boolean; kind?: "purchase" | "gift"; payerRole?: "senior" | "caregiver" | null; trusted?: boolean; payee?: Order["payee"] } = {},
) {
  const order = {
    id: "o1", userId: "rose", kind: opts.kind ?? "purchase", status, payerRole: opts.payerRole ?? null, paypalOrderId: opts.paypalOrderId ?? null, quantity: 1, totalCents: 6500,
    payee: opts.payee !== undefined ? opts.payee : opts.kind === "gift" ? samPayee : null,
    product: { productId: "p", title: "Monitor", priceCents: 6500, merchant: "walmart.com" },
  } as Order;
  const calls: { paypal: string[]; to: OrderStatus[]; patches: (OrderPatch | undefined)[]; saved: [string, string, string][]; trusted: [string, string][] } = {
    paypal: [], to: [], patches: [], saved: [], trusted: [],
  };
  const deps: CaregiverDeps = {
    getOrder: async (id) => (id === "o1" ? order : null),
    householdForUser: async () => household,
    isTrusted: async (householdId, trustedPersonId) => {
      calls.trusted.push([householdId, trustedPersonId]);
      return opts.trusted ?? true;
    },
    transitionOrder: async (_id, to, _actor, patch) => {
      const kind = checkTransition(order.status, to).kind;
      if (kind === "apply") {
        order.status = to;
        calls.to.push(to);
        calls.patches.push(patch);
      }
      return { result: kind === "apply" ? "applied" : kind === "noop" ? "noop" : "rejected", order };
    },
    createPayPalOrder: async (input) => {
      calls.paypal.push(input.requestId);
      if (opts.paypalFails) throw new Error("down");
      return { paypalOrderId: "PP9", approveUrl: "https://paypal.test/approve/PP9" };
    },
    setPaypalOrderId: async (id, paypalOrderId, payerRole) => {
      calls.saved.push([id, paypalOrderId, payerRole]);
      return !opts.saveFails;
    },
    appUrl: "https://app.test",
  };
  return { deps, order, calls };
}

describe("approveRequest", () => {
  it("creates Anna's PayPal order and moves to AWAITING_PAYMENT", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER");
    expect(await approveRequest(deps, "o1", owner)).toEqual({ ok: true, approveUrl: "https://paypal.test/approve/PP9" });
    expect(calls.paypal).toEqual(["create-o1-caregiver"]);
    expect(calls.to).toEqual(["AWAITING_PAYMENT"]);
  });

  it("lets Anna resume an unfinished payment with the same PayPal order", async () => {
    const { deps, calls } = setup("AWAITING_PAYMENT", { payerRole: "caregiver" });
    expect((await approveRequest(deps, "o1", owner)).ok).toBe(true);
    expect(calls.paypal).toEqual(["create-o1-caregiver"]);
    expect(calls.to).toEqual([]);
  });

  it("saves a new PayPal order id when PayPal issues a fresh order on resume", async () => {
    const { deps, calls } = setup("AWAITING_PAYMENT", { payerRole: "caregiver", paypalOrderId: "PP-old" });
    expect((await approveRequest(deps, "o1", owner)).ok).toBe(true);
    expect(calls.saved).toEqual([["o1", "PP9", "caregiver"]]);
  });

  it("fails instead of sending Anna to a PayPal order the app can't find", async () => {
    const { deps } = setup("AWAITING_PAYMENT", { payerRole: "caregiver", paypalOrderId: "PP-old", saveFails: true });
    const result = await approveRequest(deps, "o1", owner);
    expect(result.ok).toBe(false);
  });

  it("does not rewrite the PayPal id when PayPal returns the same order", async () => {
    const { deps, calls } = setup("AWAITING_PAYMENT", { payerRole: "caregiver", paypalOrderId: "PP9" });
    await approveRequest(deps, "o1", owner);
    expect(calls.saved).toEqual([]);
  });

  it("refuses a declined or blocked request", async () => {
    for (const s of ["DECLINED", "BLOCKED"] as const) {
      const result = await approveRequest(setup(s).deps, "o1", owner);
      expect(result.ok).toBe(false);
    }
  });

  it("refuses someone who has neither the household cookie nor the token", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER");
    expect((await approveRequest(deps, "o1", { household: null, token: null })).ok).toBe(false);
    expect(calls.paypal).toEqual([]);
  });

  it("leaves the request waiting when PayPal is down", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER", { paypalFails: true });
    expect((await approveRequest(deps, "o1", owner)).ok).toBe(false);
    expect(calls.to).toEqual([]);
  });

  it("approving a gift hands it back to Rose", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER", { kind: "gift" });
    expect(await approveRequest(deps, "o1", owner)).toEqual({ ok: true, approveUrl: null });
    expect(calls.trusted).toEqual([["h1", "t1"]]);
    expect(calls.to).toEqual(["AWAITING_PAYMENT"]);
    expect(calls.patches).toEqual([{ payerRole: "senior" }]);
    expect(calls.paypal).toEqual([]);
    expect(calls.saved).toEqual([]);
  });

  it("approving a gift twice hands it over only once", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER", { kind: "gift" });
    await approveRequest(deps, "o1", owner);
    expect(await approveRequest(deps, "o1", owner)).toEqual({ ok: false, code: "not_waiting" });
    expect(calls.to).toEqual(["AWAITING_PAYMENT"]);
    expect(calls.paypal).toEqual([]);
  });

  it("Anna can't resume a gift that's waiting for Rose", async () => {
    const { deps, calls } = setup("AWAITING_PAYMENT", { kind: "gift", payerRole: "senior" });
    expect(await approveRequest(deps, "o1", owner)).toEqual({ ok: false, code: "not_waiting" });
    expect(calls.paypal).toEqual([]);
    expect(calls.to).toEqual([]);
  });

  it("never lets Anna pay a gift, even if one were marked as hers", async () => {
    const { deps, calls } = setup("AWAITING_PAYMENT", { kind: "gift", payerRole: "caregiver" });
    expect(await approveRequest(deps, "o1", owner)).toEqual({ ok: false, code: "not_waiting" });
    expect(calls.paypal).toEqual([]);
  });

  it("refuses a gift whose person is no longer on the trusted list", async () => {
    for (const opts of [{ trusted: false }, { payee: null }, { payee: { ...samPayee, trustedPersonId: null } }]) {
      const { deps, calls } = setup("AWAITING_CAREGIVER", { kind: "gift", ...opts });
      expect(await approveRequest(deps, "o1", owner)).toEqual({ ok: false, code: "not_trusted" });
      expect(calls.to).toEqual([]);
      expect(calls.paypal).toEqual([]);
    }
  });

  it("never asks about trust for a purchase", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER");
    await approveRequest(deps, "o1", owner);
    expect(calls.trusted).toEqual([]);
  });

  it("refuses a gift that was declined or blocked", async () => {
    for (const s of ["DECLINED", "BLOCKED"] as const) {
      expect((await approveRequest(setup(s, { kind: "gift" }).deps, "o1", owner)).ok).toBe(false);
    }
  });
});

describe("declineRequest", () => {
  it("declines with a trimmed reason", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER");
    expect(await declineRequest(deps, "o1", "  Let's buy it together  ", owner)).toBe(true);
    expect(calls.to).toEqual(["DECLINED"]);
  });
  it("refuses a decline without the cookie or token", async () => {
    const { deps, calls } = setup("AWAITING_CAREGIVER");
    expect(await declineRequest(deps, "o1", "x", { household: null, token: "nope" })).toBe(false);
    expect(calls.to).toEqual([]);
  });
  it("does nothing for a request that is no longer waiting", async () => {
    expect(await declineRequest(setup("PAID").deps, "o1", "x", owner)).toBe(false);
  });
});

describe("remindCaregivers", () => {
  it("emails once per waiting order and marks it reminded", async () => {
    const marked: string[] = [];
    const sent: string[] = [];
    const links: string[] = [];
    const count = await remindCaregivers({
      ordersNeedingReminder: async () => [{ id: "o1", userId: "rose", caregiverToken: "tok123", product: { title: "Monitor" }, totalCents: 6500, merchant: "walmart.com", flags: [], summary: null } as unknown as Order],
      householdForUser: async () => household,
      markReminded: async (id) => {
        marked.push(id);
      },
      sendEmail: async (m) => {
        sent.push(m.to);
        links.push(m.html);
        return true;
      },
      appUrl: "https://app.test",
      fallbackEmail: null,
    });
    expect(count).toBe(1);
    expect(sent).toEqual(["anna@example.com"]);
    expect(marked).toEqual(["o1"]);
    expect(links[0]).toContain("https://app.test/caregiver/requests/o1?t=tok123");
  });
});
