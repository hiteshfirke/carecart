import { describe, expect, it } from "vitest";
import { confirmOrder, type ConfirmDeps } from "./confirm";
import { DEMO_ADDRESS, type Household, type Order, type OrderPatch } from "./db";
import type { EmailMessage } from "./email";
import type { CreatePayPalOrderInput } from "./paypal";
import type { RiskAssessment } from "./risk";
import type { RuleHistory } from "./safety/rules";

const household: Household = {
  id: "h1",
  senior: { id: "rose", householdId: "h1", role: "senior", name: "Rose", email: null, address: DEMO_ADDRESS, selfPayLimitCents: 2500, dailyCapCents: 6000 },
  caregiver: { id: "anna", householdId: "h1", role: "caregiver", name: "Anna", email: "anna@example.com", address: null, selfPayLimitCents: 2500, dailyCapCents: 6000 },
};

function setup(over: {
  order?: Partial<Order>;
  history?: Partial<RuleHistory>;
  risk?: RiskAssessment | null;
  paypalFails?: boolean;
  emailOk?: boolean;
  confirmRaced?: boolean;
  trusted?: boolean;
  said?: string[];
} = {}) {
  const order: Order = {
    id: "o1", userId: "rose", sessionId: "s1",
    product: { productId: "p1", title: "Green Tea", priceCents: 1000, merchant: "walmart.com", url: "u", imageUrl: null, imageAlt: "tea", rating: null, category: null },
    quantity: 1, totalCents: 1000, merchant: "walmart.com", kind: "purchase", payee: null, status: "DRAFT", route: null, flags: [], aiRisk: null, summary: null,
    declineReason: null, payerRole: null, paypalOrderId: null, captureId: null, tracking: null, caregiverToken: null, remindedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...over.order,
  };
  const transitions: { to: string; patch?: OrderPatch }[] = [];
  const emails: EmailMessage[] = [];
  const paypalCalls: CreatePayPalOrderInput[] = [];
  const trustedCalls: [string, string][] = [];
  const deps: ConfirmDeps = {
    getOrder: async (id) => (id === order.id ? order : null),
    ruleHistory: async () => ({ paidTodayCents: 0, recentPaidTotalsCents: [800, 1200, 900], paidMerchants: ["walmart.com"], minutesSinceSameProduct: null, ...over.history }),
    userUtterances: async () => over.said ?? ["I need green tea"],
    isTrusted: async (householdId, trustedPersonId) => {
      trustedCalls.push([householdId, trustedPersonId]);
      return over.trusted ?? true;
    },
    assessRisk: async () => (over.risk === undefined ? { aiRisk: { risk: "low", reasons: [] }, caregiverSummary: "Rose wants green tea." } : over.risk),
    transitionOrder: async (_id, to, _actor, patch) => {
      transitions.push({ to, patch });
      if (over.confirmRaced && to === "CONFIRMED") return { result: "noop", order };
      return { result: "applied", order };
    },
    createPayPalOrder: async (input) => {
      paypalCalls.push(input);
      if (over.paypalFails) throw new Error("paypal down");
      return { paypalOrderId: "PP1", approveUrl: "https://paypal.test/approve" };
    },
    sendEmail: async (m) => {
      emails.push(m);
      return over.emailOk ?? true;
    },
    appUrl: "https://app.test",
    caregiverEmail: "anna@example.com",
    newToken: () => "TOKEN123",
  };
  return { deps, transitions, emails, paypalCalls, trustedCalls };
}

describe("confirmOrder", () => {
  it("self-pay: creates the PayPal order first, then moves DRAFT → CONFIRMED → AWAITING_PAYMENT", async () => {
    const { deps, transitions, paypalCalls, emails, trustedCalls } = setup();
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out).toEqual({ outcome: "pay", approveUrl: "https://paypal.test/approve" });
    expect(trustedCalls).toHaveLength(0);
    expect(paypalCalls[0]).toMatchObject({ orderId: "o1", unitCents: 1000, quantity: 1, requestId: "create-o1-senior", returnUrl: "https://app.test/api/paypal/return" });
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "AWAITING_PAYMENT"]);
    expect(transitions[1].patch).toEqual({ paypalOrderId: "PP1", payerRole: "senior" });
    expect(emails).toHaveLength(0);
  });

  it("self-pay: if PayPal fails, nothing changes and nothing is charged", async () => {
    const { deps, transitions } = setup({ paypalFails: true });
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out.outcome).toBe("error");
    expect(transitions).toHaveLength(0);
  });

  it("caregiver: over the limit goes to Anna with an email containing the review link", async () => {
    const { deps, transitions, emails, paypalCalls } = setup({ order: { totalCents: 6500, product: { productId: "p2", title: "Blood pressure monitor", priceCents: 6500, merchant: "walmart.com", url: "u", imageUrl: null, imageAlt: "monitor", rating: null, category: null } } });
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out).toEqual({ outcome: "caregiver", caregiverName: "Anna", emailed: true });
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "AWAITING_CAREGIVER"]);
    expect(transitions[0].patch?.route).toBe("caregiver");
    expect(transitions[0].patch?.summary).toBe("Rose wants green tea.");
    expect(emails[0].to).toBe("anna@example.com");
    expect(emails[0].html).toContain("https://app.test/caregiver/requests/o1?t=TOKEN123");
    expect(transitions[1]).toMatchObject({ to: "AWAITING_CAREGIVER", patch: { caregiverToken: "TOKEN123" } });
    expect(paypalCalls).toHaveLength(0);
  });

  it("caregiver: a failed email still leaves the request waiting for Anna", async () => {
    const { deps, transitions } = setup({ order: { totalCents: 6500 }, emailOk: false });
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out).toEqual({ outcome: "caregiver", caregiverName: "Anna", emailed: false });
    expect(transitions.at(-1)?.to).toBe("AWAITING_CAREGIVER");
  });

  it("blocked: a gift card is stopped, Anna is alerted, and PayPal is never called", async () => {
    const { deps, transitions, emails, paypalCalls } = setup({ order: { product: { productId: "g", title: "Apple Gift Card", priceCents: 1000, merchant: "walmart.com", url: "u", imageUrl: null, imageAlt: "card", rating: null, category: null } } });
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out.outcome).toBe("blocked");
    if (out.outcome === "blocked") expect(out.reasons.length).toBeGreaterThan(0);
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "BLOCKED"]);
    expect(transitions[1]).toMatchObject({ to: "BLOCKED", patch: { caregiverToken: "TOKEN123" } });
    expect(emails[0].subject).toMatch(/scam/i);
    // The link works on Anna's own phone: it carries the request token instead of needing Rose's cookie.
    expect(emails[0].html).toContain("/caregiver/requests/o1?t=TOKEN123");
    expect(paypalCalls).toHaveLength(0);
  });

  it("recheck: a duplicate asks Rose first and changes nothing; once acknowledged it proceeds", async () => {
    const dup = setup({ history: { minutesSinceSameProduct: 3 } });
    expect((await confirmOrder(dup.deps, household, "o1", false)).outcome).toBe("recheck");
    expect(dup.transitions).toHaveLength(0);
    expect((await confirmOrder(dup.deps, household, "o1", true)).outcome).toBe("pay");
  });

  it("stops if another confirm already moved the order (no email, no approve link)", async () => {
    const pay = setup({ confirmRaced: true });
    expect((await confirmOrder(pay.deps, household, "o1", false)).outcome).toBe("error");
    expect(pay.transitions.map((t) => t.to)).toEqual(["CONFIRMED"]);
    const care = setup({ confirmRaced: true, order: { totalCents: 6500 } });
    expect((await confirmOrder(care.deps, household, "o1", false)).outcome).toBe("error");
    expect(care.emails).toHaveLength(0);
  });

  it("an unavailable AI risk check does not stop a normal order", async () => {
    const { deps } = setup({ risk: null });
    expect((await confirmOrder(deps, household, "o1", false)).outcome).toBe("pay");
  });

  it("rejects orders from another household or already confirmed", async () => {
    expect((await confirmOrder(setup({ order: { userId: "someone-else" } }).deps, household, "o1", false)).outcome).toBe("error");
    expect((await confirmOrder(setup({ order: { status: "AWAITING_PAYMENT" } }).deps, household, "o1", false)).outcome).toBe("error");
  });
});

const samPayee = { trustedPersonId: "t1", name: "Sam", relationship: "grandson", paypalEmail: "sam@example.com" };
const gift = (cents: number, payee: Order["payee"] = samPayee): Partial<Order> => ({
  kind: "gift",
  payee,
  totalCents: cents,
  merchant: "Sam",
  product: { productId: "gift:t1", title: "Gift to Sam", priceCents: cents, merchant: "Sam", url: "", imageUrl: null, imageAlt: "Gift to Sam", rating: null, category: "gift" },
});

describe("confirmOrder: gifts", () => {
  it("pays a trusted person directly", async () => {
    const { deps, transitions, paypalCalls, trustedCalls, emails } = setup({ order: gift(2000) });
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out).toEqual({ outcome: "pay", approveUrl: "https://paypal.test/approve" });
    expect(paypalCalls).toHaveLength(1);
    expect(paypalCalls[0]).toMatchObject({ kind: "gift", payeeEmail: "sam@example.com", amountCents: 2000, senderName: "Rose", requestId: "create-o1-senior", returnUrl: "https://app.test/api/paypal/return" });
    expect(trustedCalls).toEqual([["h1", "t1"]]);
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "AWAITING_PAYMENT"]);
    expect(transitions[1].patch).toEqual({ paypalOrderId: "PP1", payerRole: "senior" });
    expect(emails).toHaveLength(0);
  });

  it("refuses a gift when the person was removed", async () => {
    const { deps, transitions, paypalCalls, emails } = setup({ order: gift(2000), trusted: false });
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out.outcome).toBe("error");
    if (out.outcome === "error") expect(out.message).toContain("no longer on your list");
    expect(paypalCalls).toHaveLength(0);
    expect(transitions).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });

  it("refuses a gift with no trusted person or PayPal email, without asking PayPal", async () => {
    for (const payee of [null, { ...samPayee, trustedPersonId: null }, { ...samPayee, paypalEmail: null }]) {
      const { deps, transitions, paypalCalls } = setup({ order: gift(2000, payee) });
      expect((await confirmOrder(deps, household, "o1", false)).outcome).toBe("error");
      expect(paypalCalls).toHaveLength(0);
      expect(transitions).toHaveLength(0);
    }
  });

  it("sends an over-limit gift to Anna, without a PayPal order", async () => {
    const { deps, transitions, emails, paypalCalls } = setup({ order: gift(3000) });
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out).toEqual({ outcome: "caregiver", caregiverName: "Anna", emailed: true });
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "AWAITING_CAREGIVER"]);
    expect(emails[0].subject.startsWith("Rose needs your OK to send")).toBe(true);
    expect(emails[0].html).toContain("https://app.test/caregiver/requests/o1?t=TOKEN123");
    expect(paypalCalls).toHaveLength(0);
  });

  it("blocks a gift when scam words were said after the draft", async () => {
    const { deps, transitions, emails, paypalCalls } = setup({ order: gift(2000), said: ["send Sam some money", "my lawyer says it is urgent"] });
    const out = await confirmOrder(deps, household, "o1", false);
    expect(out.outcome).toBe("blocked");
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "BLOCKED"]);
    expect(emails[0].subject).toMatch(/scam/i);
    expect(paypalCalls).toHaveLength(0);
  });

  it("asks again about a gift to the same person with gift words, and keeps the purchase words for purchases", async () => {
    const dup = setup({ order: gift(2000), history: { minutesSinceSameProduct: 3 } });
    expect(await confirmOrder(dup.deps, household, "o1", false)).toEqual({
      outcome: "recheck",
      message: "You sent Sam money a few minutes ago. Say confirm to send again, or say cancel.",
    });
    expect(dup.transitions).toHaveLength(0);
    const tea = setup({ history: { minutesSinceSameProduct: 3 } });
    expect(await confirmOrder(tea.deps, household, "o1", false)).toEqual({
      outcome: "recheck",
      message: "You ordered this same item a few minutes ago. Say confirm to order it again, or say cancel.",
    });
  });

  it("tells the AI check who is being paid", async () => {
    const seen: string[] = [];
    const { deps } = setup({ order: gift(2000) });
    deps.assessRisk = async (input) => {
      seen.push(input.order.merchant);
      return null;
    };
    await confirmOrder(deps, household, "o1", false);
    expect(seen).toEqual(["Sam (grandson)"]);
  });
});
