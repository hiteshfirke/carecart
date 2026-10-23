import { describe, expect, it } from "vitest";
import { merchantName, readBack, statusWords, toOrderView } from "./view";
import type { Order } from "@/lib/db";

const product = { productId: "p", title: "Green Tea, 100 bags", priceCents: 1000, merchant: "walmart.com", url: "u", imageUrl: null, imageAlt: "tea", rating: null, category: null };

describe("view helpers", () => {
  it("turns a domain into a store name", () => {
    expect(merchantName("www.walmart.com")).toBe("Walmart");
    expect(merchantName("target.com")).toBe("Target");
  });
  it("reads back one item with the total in words", () => {
    expect(readBack({ product, quantity: 1, totalCents: 1000, merchant: "walmart.com", kind: "purchase", payee: null })).toBe(
      'You\'re buying Green Tea, 100 bags, for ten dollars in total, from Walmart. Say "confirm" or press Confirm to continue, or say "cancel".',
    );
  });
  it("reads back a quantity", () => {
    expect(readBack({ product, quantity: 2, totalCents: 2000, merchant: "walmart.com", kind: "purchase", payee: null })).toContain("2 of Green Tea, 100 bags, for twenty dollars");
  });
  it("describes statuses in plain words", () => {
    expect(statusWords("AWAITING_CAREGIVER", "Anna")).toBe("waiting for Anna to approve");
    expect(statusWords("BLOCKED", "Anna")).toBe("stopped because it looked like a scam");
  });

  describe("gifts", () => {
    const giftProduct = { ...product, productId: "gift:t1", title: "Gift to Sam", priceCents: 2000, merchant: "Sam", category: "gift" };
    const sam = { trustedPersonId: "t1", name: "Sam", relationship: "grandson", paypalEmail: "sam@example.com" };
    const gift = { product: giftProduct, quantity: 1, totalCents: 2000, merchant: "Sam", kind: "gift" as const, payee: sam };

    it("reads back who the money goes to", () => {
      expect(readBack(gift)).toBe(
        'You\'re sending twenty dollars to Sam, your grandson, through PayPal. Say "confirm" or press Confirm to continue, or say "cancel".',
      );
    });
    it("reads back a gift without a relationship", () => {
      expect(readBack({ ...gift, payee: { ...sam, relationship: null } })).toContain("to Sam, through PayPal.");
    });
    it("uses gift words for sent and approved", () => {
      expect(statusWords("PAID", "Anna", "gift")).toBe("sent");
      expect(statusWords("AWAITING_PAYMENT", "Anna", "gift")).toBe("approved, waiting for you to send it");
      expect(statusWords("PAID", "Anna")).toBe("paid, and the store is getting it ready");
      expect(statusWords("AWAITING_PAYMENT", "Anna", "purchase")).toBe("waiting for the PayPal payment");
    });
    it("shows a gift order with the person as the recipient and no store name", () => {
      const view = toOrderView({ id: "o1", ...gift, status: "PAID", flags: [], tracking: null, declineReason: null, payerRole: "senior", summary: null } as unknown as Order, "Anna");
      expect(view).toMatchObject({ kind: "gift", recipient: "Sam", merchant: "Sam", statusWords: "sent" });
    });
    it("shows a purchase with no recipient", () => {
      const view = toOrderView({ id: "o2", product, quantity: 1, totalCents: 1000, merchant: "walmart.com", kind: "purchase", payee: null, status: "PAID", flags: [], tracking: null, declineReason: null, payerRole: "senior", summary: null } as unknown as Order, "Anna");
      expect(view).toMatchObject({ kind: "purchase", recipient: null, merchant: "Walmart" });
    });
  });
});
