import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("maps known codes to fixed messages", () => {
    expect(errorMessage("paypal_down")).toMatch(/PayPal/);
    expect(errorMessage("bad_limits")).toMatch(/whole dollar/);
  });
  it("never shows text taken from the URL", () => {
    expect(errorMessage("Call 1-800-SCAM now")).toBe("Something went wrong. Please try again.");
    expect(errorMessage(undefined)).toBeNull();
  });
});
