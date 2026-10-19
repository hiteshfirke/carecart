import { describe, expect, it } from "vitest";
import { checkTransition, isPaidOrLater, seniorCanCancel } from "./state";

describe("checkTransition", () => {
  it("allows the self-pay path", () => {
    expect(checkTransition("DRAFT", "CONFIRMED").kind).toBe("apply");
    expect(checkTransition("CONFIRMED", "AWAITING_PAYMENT").kind).toBe("apply");
    expect(checkTransition("AWAITING_PAYMENT", "PAID").kind).toBe("apply");
    expect(checkTransition("PAID", "SHIPPED").kind).toBe("apply");
  });
  it("allows the caregiver path", () => {
    expect(checkTransition("CONFIRMED", "AWAITING_CAREGIVER").kind).toBe("apply");
    expect(checkTransition("AWAITING_CAREGIVER", "AWAITING_PAYMENT").kind).toBe("apply");
    expect(checkTransition("AWAITING_CAREGIVER", "DECLINED").kind).toBe("apply");
  });
  it("treats repeating the current status as a no-op", () => {
    expect(checkTransition("PAID", "PAID").kind).toBe("noop");
  });
  it("never moves backwards", () => {
    expect(checkTransition("PAID", "AWAITING_PAYMENT").kind).toBe("reject");
    expect(checkTransition("SHIPPED", "PAID").kind).toBe("reject");
    expect(checkTransition("PAID", "CANCELLED").kind).toBe("reject");
  });
  it("keeps BLOCKED and DECLINED final", () => {
    expect(checkTransition("BLOCKED", "AWAITING_PAYMENT").kind).toBe("reject");
    expect(checkTransition("DECLINED", "AWAITING_PAYMENT").kind).toBe("reject");
  });
  it("only blocks right after confirmation", () => {
    expect(checkTransition("CONFIRMED", "BLOCKED").kind).toBe("apply");
    expect(checkTransition("DRAFT", "BLOCKED").kind).toBe("reject");
  });
  it("allows cancelling a draft or an unpaid payment", () => {
    expect(checkTransition("DRAFT", "CANCELLED").kind).toBe("apply");
    expect(checkTransition("AWAITING_PAYMENT", "CANCELLED").kind).toBe("apply");
  });
});

describe("isPaidOrLater", () => {
  it("is true only for PAID and SHIPPED", () => {
    expect(isPaidOrLater("PAID")).toBe(true);
    expect(isPaidOrLater("SHIPPED")).toBe(true);
    expect(isPaidOrLater("AWAITING_PAYMENT")).toBe(false);
  });
});

describe("seniorCanCancel", () => {
  it("lets Rose cancel a draft or her own payment in progress", () => {
    expect(seniorCanCancel({ status: "DRAFT", payerRole: null })).toBe(true);
    expect(seniorCanCancel({ status: "AWAITING_PAYMENT", payerRole: "senior" })).toBe(true);
  });

  it("never lets Rose cancel a payment Anna is making, or anything already decided", () => {
    expect(seniorCanCancel({ status: "AWAITING_PAYMENT", payerRole: "caregiver" })).toBe(false);
    for (const status of ["CONFIRMED", "AWAITING_CAREGIVER", "PAID", "SHIPPED", "DECLINED", "CANCELLED", "BLOCKED"] as const) {
      expect(seniorCanCancel({ status, payerRole: null })).toBe(false);
    }
  });
});
