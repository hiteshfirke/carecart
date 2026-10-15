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

describe.skipIf(!process.env.DATABASE_URL)("db (integration: needs DATABASE_URL)", () => {
  it("keeps two demo households completely separate", async () => {
    const db = await import("./db");
    const a = await db.createHousehold(null);
    const b = await db.createHousehold(null);
    const session = await db.createSession(a.senior.id);
    await db.createDraftOrder({ userId: a.senior.id, sessionId: session.id, product, quantity: 2 });

    expect((await db.listOrders(a.senior.id, 10)).length).toBe(4);
    expect((await db.listOrders(b.senior.id, 10)).length).toBe(3);
    const historyB = await db.ruleHistory(b.senior.id, "p-tea", "none");
    expect(historyB.recentPaidTotalsCents).toEqual([900, 1200, 800]);
    expect(historyB.paidMerchants.sort()).toEqual(["target.com", "walmart.com"]);
    expect(historyB.minutesSinceSameProduct).toBeNull();
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
