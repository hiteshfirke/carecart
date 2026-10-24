import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("maps known codes to fixed messages", () => {
    expect(errorMessage("paypal_down")).toMatch(/PayPal/);
    expect(errorMessage("bad_limits")).toMatch(/whole dollar/);
  });
  it("has fixed messages for the trusted-people codes", () => {
    expect(errorMessage("person_exists")).toBe("That name is already on the list.");
    expect(errorMessage("link_invalid")).toBe("This link has expired.");
    expect(errorMessage("link_used")).toBe("This person has already been added.");
    expect(errorMessage("bad_person")).toMatch(/name/);
  });
  it("treats names that every object inherits as unknown codes", () => {
    for (const code of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(errorMessage(code)).toBe("Something went wrong. Please try again.");
    }
  });
  it("never shows text taken from the URL", () => {
    expect(errorMessage("Call 1-800-SCAM now")).toBe("Something went wrong. Please try again.");
    expect(errorMessage(undefined)).toBeNull();
  });
});
