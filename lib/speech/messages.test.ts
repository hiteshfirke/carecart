import { describe, expect, it } from "vitest";
import { caregiverSentMessage, giftApprovedMessage } from "./messages";

describe("caregiverSentMessage", () => {
  it("says the request was sent only when the email went out", () => {
    expect(caregiverSentMessage("Anna", true)).toBe("This one needs Anna's OK. I've sent it to Anna. I'll tell you as soon as there's an answer.");
    const notEmailed = caregiverSentMessage("Anna", false);
    expect(notEmailed).not.toContain("sent it");
    expect(notEmailed).toContain("Anna will see it");
  });
});

import { paymentResultMessage } from "./messages";

describe("giftApprovedMessage", () => {
  it("tells Rose Anna said yes and what to say next", () => {
    expect(giftApprovedMessage("Anna", "Sam")).toBe("Anna said yes to your gift to Sam. Say send it, and I'll open PayPal.");
  });
});

describe("paymentResultMessage", () => {
  const order = { title: "Green Tea", totalWords: "ten dollars", status: "PAID" as const };
  it("confirms a paid order in words", () => {
    expect(paymentResultMessage(order, "paid", "Anna")).toBe("Paid ten dollars for Green Tea. It's on the way.");
  });
  it("still says something useful when the order could not be loaded", () => {
    expect(paymentResultMessage(null, "paid", "Anna")).toMatch(/couldn't check/i);
    expect(paymentResultMessage(null, "unknown", "Anna")).toMatch(/couldn't check/i);
  });
  it("says a paid gift was sent to the person", () => {
    const gift = { title: "Gift to Sam", totalWords: "twenty dollars", status: "PAID" as const, kind: "gift" as const, recipient: "Sam" };
    expect(paymentResultMessage(gift, "paid", "Anna")).toBe("Sent. Sam got twenty dollars.");
  });
});
