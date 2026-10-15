import { describe, expect, it, vi } from "vitest";
import { assessRisk, riskPrompt, type RiskInput } from "./risk";

const input: RiskInput = {
  seniorName: "Rose",
  caregiverName: "Anna",
  order: { title: "Blood pressure monitor", quantity: 1, totalCents: 6500, merchant: "walmart.com" },
  transcript: Array.from({ length: 15 }, (_, i) => `line ${i + 1}`),
};

describe("riskPrompt", () => {
  it("sends the order with the total in words and only the last 12 things said", () => {
    const { system, user } = riskPrompt(input);
    expect(system).toContain("Anna");
    const data = JSON.parse(user);
    expect(data.order.total).toBe("sixty-five dollars");
    expect(data.what_they_said).toHaveLength(12);
    expect(data.what_they_said[0]).toBe("line 4");
  });
});

describe("assessRisk", () => {
  it("maps the structured output", async () => {
    const parse = vi.fn(async () => ({ risk: "medium" as const, reasons: ["new store"], caregiver_summary: "Rose wants a monitor for $65." }));
    expect(await assessRisk(input, parse)).toEqual({
      aiRisk: { risk: "medium", reasons: ["new store"] },
      caregiverSummary: "Rose wants a monitor for $65.",
    });
  });

  it("caps the summary length", async () => {
    const parse = vi.fn(async () => ({ risk: "low" as const, reasons: [], caregiver_summary: "x".repeat(2000) }));
    expect((await assessRisk(input, parse))?.caregiverSummary.length).toBe(600);
  });

  it("returns null when the model call fails, so the rules alone decide", async () => {
    const parse = vi.fn(async () => {
      throw new Error("overloaded");
    });
    expect(await assessRisk(input, parse)).toBeNull();
  });

  it("returns null when the output could not be parsed", async () => {
    expect(await assessRisk(input, vi.fn(async () => null))).toBeNull();
  });
});
