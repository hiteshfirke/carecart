import { describe, expect, it } from "vitest";
import { caregiverSentMessage } from "./messages";

describe("caregiverSentMessage", () => {
  it("says the request was sent only when the email went out", () => {
    expect(caregiverSentMessage("Anna", true)).toBe("This one needs Anna's OK. I've sent it to Anna. I'll tell you as soon as there's an answer.");
    const notEmailed = caregiverSentMessage("Anna", false);
    expect(notEmailed).not.toContain("sent it");
    expect(notEmailed).toContain("Anna will see it");
  });
});
