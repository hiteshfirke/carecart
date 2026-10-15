import { describe, expect, it } from "vitest";
import { merchantName, readBack, statusWords } from "./view";

const product = { productId: "p", title: "Green Tea, 100 bags", priceCents: 1000, merchant: "walmart.com", url: "u", imageUrl: null, imageAlt: "tea", rating: null, category: null };

describe("view helpers", () => {
  it("turns a domain into a store name", () => {
    expect(merchantName("www.walmart.com")).toBe("Walmart");
    expect(merchantName("target.com")).toBe("Target");
  });
  it("reads back one item with the total in words", () => {
    expect(readBack({ product, quantity: 1, totalCents: 1000, merchant: "walmart.com" })).toBe(
      'You\'re buying Green Tea, 100 bags, for ten dollars in total, from Walmart. Say "confirm" or press Confirm to continue, or say "cancel".',
    );
  });
  it("reads back a quantity", () => {
    expect(readBack({ product, quantity: 2, totalCents: 2000, merchant: "walmart.com" })).toContain("2 of Green Tea, 100 bags, for twenty dollars");
  });
  it("describes statuses in plain words", () => {
    expect(statusWords("AWAITING_CAREGIVER", "Anna")).toBe("waiting for Anna to approve");
    expect(statusWords("BLOCKED", "Anna")).toBe("stopped because it looked like a scam");
  });
});
