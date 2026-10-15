import { describe, expect, it } from "vitest";
import { evaluateRules, type RuleInput } from "./rules";

function input(overrides: Partial<RuleInput> = {}): RuleInput {
  const base: RuleInput = {
    order: { totalCents: 1000, productId: "p1", title: "Lipton Green Tea, 100 bags", category: "Tea", merchant: "walmart.com" },
    limits: { selfPayLimitCents: 2500, dailyCapCents: 6000 },
    history: { paidTodayCents: 0, recentPaidTotalsCents: [800, 1200, 900], paidMerchants: ["walmart.com"], minutesSinceSameProduct: null },
    transcript: ["I need some green tea"],
    aiRisk: { risk: "low", reasons: [] },
    duplicateAcknowledged: false,
  };
  return {
    ...base,
    ...overrides,
    order: { ...base.order, ...overrides.order },
    limits: { ...base.limits, ...overrides.limits },
    history: { ...base.history, ...overrides.history },
  };
}
const codes = (r: ReturnType<typeof evaluateRules>) => r.flags.map((f) => f.code);

describe("evaluateRules", () => {
  it("lets a small, normal order through for self-pay", () => {
    const r = evaluateRules(input());
    expect(r).toEqual({ route: "self_pay", flags: [] });
  });

  it("S1 blocks gift cards and similar products", () => {
    for (const title of ["Apple Gift Card $100", "Visa Prepaid Debit Card", "Bitcoin voucher", "Western Union money order"]) {
      const r = evaluateRules(input({ order: { title, totalCents: 1000, productId: "g", category: null, merchant: "walmart.com" } }));
      expect(r.route).toBe("blocked");
      expect(codes(r)).toContain("S1_SCAM_PRODUCT");
    }
  });

  it("S1 blocks when Rose repeats a scam script", () => {
    const r = evaluateRules(input({ transcript: ["a man from my bank called", "he said I must buy something today"] }));
    expect(r.route).toBe("blocked");
    expect(codes(r)).toContain("S1_SCAM_PHRASE");
  });

  it("S1 does not block ordinary words that look similar", () => {
    const r = evaluateRules(input({ transcript: ["I need a phone charger wire", "and a warranty card"], order: { title: "USB-C charger wire", totalCents: 900, productId: "c", category: null, merchant: "walmart.com" } }));
    expect(r.route).toBe("self_pay");
  });

  it("'urgent' alone goes to the caregiver, not blocked", () => {
    const r = evaluateRules(input({ transcript: ["I urgently need my blood pressure tablets"] }));
    expect(r.route).toBe("caregiver");
    expect(codes(r)).toContain("S1_PRESSURE_WORD");
  });

  it("S2 routes to caregiver above the self-pay limit, not at it", () => {
    expect(evaluateRules(input({ order: { totalCents: 2500 } as RuleInput["order"] })).route).toBe("self_pay");
    const r = evaluateRules(input({ order: { totalCents: 2501 } as RuleInput["order"] }));
    expect(r.route).toBe("caregiver");
    expect(codes(r)).toContain("S2_OVER_SELF_PAY_LIMIT");
  });

  it("S3 routes to caregiver when today's total would pass the daily cap", () => {
    const r = evaluateRules(input({ history: { paidTodayCents: 5500 } as RuleInput["history"] }));
    expect(codes(r)).toContain("S3_OVER_DAILY_CAP");
    expect(r.route).toBe("caregiver");
  });

  it("S4 flags an unusual amount only with at least 3 past orders", () => {
    const unusual = input({ order: { totalCents: 2400 } as RuleInput["order"], history: { recentPaidTotalsCents: [700, 800, 750] } as RuleInput["history"] });
    expect(codes(evaluateRules(unusual))).toContain("S4_UNUSUAL_AMOUNT");
    const noHistory = input({ order: { totalCents: 2400 } as RuleInput["order"], history: { recentPaidTotalsCents: [700, 800] } as RuleInput["history"] });
    expect(codes(evaluateRules(noHistory))).not.toContain("S4_UNUSUAL_AMOUNT");
  });

  it("S5 flags a new merchant only above $15", () => {
    const small = input({ order: { merchant: "newshop.com", totalCents: 1500 } as RuleInput["order"] });
    expect(codes(evaluateRules(small))).not.toContain("S5_NEW_MERCHANT");
    const big = input({ order: { merchant: "NewShop.com", totalCents: 1600 } as RuleInput["order"] });
    expect(codes(evaluateRules(big))).toContain("S5_NEW_MERCHANT");
  });

  it("S6 asks Rose to re-check a duplicate, then lets it continue once acknowledged", () => {
    const dup = input({ history: { minutesSinceSameProduct: 4 } as RuleInput["history"] });
    expect(evaluateRules(dup).route).toBe("recheck");
    expect(evaluateRules({ ...dup, duplicateAcknowledged: true }).route).toBe("self_pay");
    const old = input({ history: { minutesSinceSameProduct: 11 } as RuleInput["history"] });
    expect(evaluateRules(old).route).toBe("self_pay");
  });

  it("S7 routes to caregiver when the AI rates risk high", () => {
    const r = evaluateRules(input({ aiRisk: { risk: "high", reasons: ["someone told her to buy it"] } }));
    expect(r.route).toBe("caregiver");
    expect(codes(r)).toContain("S7_AI_HIGH_RISK");
  });

  it("AI cannot remove caution: low AI risk does not override a rule", () => {
    const r = evaluateRules(input({ order: { totalCents: 4000 } as RuleInput["order"], aiRisk: { risk: "low", reasons: [] } }));
    expect(r.route).toBe("caregiver");
  });

  it("a failed AI check (null) still lets the rules decide", () => {
    expect(evaluateRules(input({ aiRisk: null })).route).toBe("self_pay");
  });

  it("blocked wins over everything", () => {
    const r = evaluateRules(input({ order: { title: "Google Play gift card", totalCents: 50000 } as RuleInput["order"], history: { minutesSinceSameProduct: 1 } as RuleInput["history"] }));
    expect(r.route).toBe("blocked");
  });
});
