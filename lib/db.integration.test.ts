import { describe, expect, it } from "vitest";
import type { ProductOption } from "./channel3";

const product: ProductOption = {
  productId: "p-tea",
  title: "Green Tea, 100 bags",
  priceCents: 1000,
  merchant: "walmart.com",
  url: "https://walmart.com/tea",
  imageUrl: null,
  imageAlt: "Green tea box",
  rating: 4.6,
  category: "Tea",
};

// Neon's free tier sleeps when idle and can take several seconds to wake, so these get more time than unit tests.
describe.skipIf(!process.env.DATABASE_URL)("db (integration: needs DATABASE_URL)", { timeout: 30_000 }, () => {
  it("keeps two demo households completely separate", async () => {
    const db = await import("./db");
    const a = await db.createHousehold(null);
    const b = await db.createHousehold(null);
    const session = await db.createSession(a.senior.id);
    const draft = await db.createDraftOrder({ userId: a.senior.id, sessionId: session.id, product, quantity: 2 });

    expect((await db.getOrder(draft.id))?.userId).toBe(a.senior.id);
    expect((await db.listOrders(a.senior.id, 10)).length).toBe(3); // drafts are never listed
    expect((await db.listOrders(b.senior.id, 10)).length).toBe(3);
    const historyB = await db.ruleHistory(b.senior.id, "p-tea", "none");
    expect(historyB.recentPaidTotalsCents).toEqual([900, 1200, 800]);
    expect(historyB.paidMerchants.sort()).toEqual(["target.com", "walmart.com"]);
    expect(historyB.minutesSinceSameProduct).toBeNull();
  });

  it("gives the starter orders USPS tracking, like any shipped order", async () => {
    const db = await import("./db");
    const h = await db.createHousehold(null);
    const orders = await db.listOrders(h.senior.id, 10);
    expect(orders).toHaveLength(3);
    for (const o of orders) expect(o.tracking).toMatchObject({ carrier: "USPS", number: expect.stringMatching(/^9400\d{18}$/) });
  });

  it("lists real orders even when many newer drafts exist", async () => {
    const db = await import("./db");
    const h = await db.createHousehold(null);
    const session = await db.createSession(h.senior.id);
    const waiting = await db.createDraftOrder({ userId: h.senior.id, sessionId: session.id, product, quantity: 1 });
    await db.transitionOrder(waiting.id, "CONFIRMED", "test");
    await db.transitionOrder(waiting.id, "AWAITING_CAREGIVER", "test");
    for (let i = 0; i < 5; i++) await db.createDraftOrder({ userId: h.senior.id, sessionId: session.id, product, quantity: 1 });

    const listed = await db.listOrders(h.senior.id, 4);
    expect(listed.map((o) => o.id)).toContain(waiting.id);
    expect(listed.every((o) => o.status !== "DRAFT")).toBe(true);
  });

  it("counts speech calls per day separately from agent calls", async () => {
    const db = await import("./db");
    const before = await db.bumpDailySpeechCalls();
    expect(await db.bumpDailySpeechCalls()).toBe(before + 1);
  });

  it("computes the draft total from price and quantity", async () => {
    const db = await import("./db");
    const h = await db.createHousehold(null);
    const session = await db.createSession(h.senior.id);
    const order = await db.createDraftOrder({ userId: h.senior.id, sessionId: session.id, product, quantity: 3 });
    expect(order.totalCents).toBe(3000);
    expect(order.status).toBe("DRAFT");
  });

  it("moves an order forward once and treats repeats and races as no-ops", async () => {
    const db = await import("./db");
    const h = await db.createHousehold(null);
    const session = await db.createSession(h.senior.id);
    const draft = await db.createDraftOrder({ userId: h.senior.id, sessionId: session.id, product, quantity: 1 });

    expect((await db.transitionOrder(draft.id, "CONFIRMED", "test"))?.result).toBe("applied");
    expect((await db.transitionOrder(draft.id, "CONFIRMED", "test"))?.result).toBe("noop");
    expect((await db.transitionOrder(draft.id, "DRAFT", "test"))?.result).toBe("rejected");

    const [r1, r2] = await Promise.all([
      db.transitionOrder(draft.id, "AWAITING_PAYMENT", "return-page", { paypalOrderId: `PP-${draft.id}`, payerRole: "senior" }),
      db.transitionOrder(draft.id, "AWAITING_PAYMENT", "webhook"),
    ]);
    expect([r1?.result, r2?.result].sort()).toEqual(["applied", "noop"]);
    const byPaypal = await db.getOrderByPaypalId(`PP-${draft.id}`);
    expect(byPaypal?.payerRole).toBe("senior");
  });

  it("stores the last search options and conversation per session", async () => {
    const db = await import("./db");
    const h = await db.createHousehold(null);
    const s = await db.createSession(h.senior.id);
    await db.saveOptions(s.id, [product]);
    expect((await db.getOptions(s.id))[0].productId).toBe("p-tea");
    await db.addMessage(s.id, "user", "I need tea");
    await db.addMessage(s.id, "assistant", "Option one: green tea.");
    expect(await db.recentMessages(s.id, 10)).toEqual([
      { role: "user", text: "I need tea" },
      { role: "assistant", text: "Option one: green tea." },
    ]);
    expect(await db.userUtterances(s.id)).toEqual(["I need tea"]);
    expect(await db.incrementTurns(s.id)).toBe(1);
  });
});
