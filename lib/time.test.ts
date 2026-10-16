import { describe, expect, it } from "vitest";
import { startOfLocalDay } from "./time";

describe("startOfLocalDay", () => {
  it("uses the household's local midnight, not UTC midnight", () => {
    // 2026-10-20 23:30 UTC is 16:30 the same day in Los Angeles (PDT, UTC-7).
    const now = new Date("2026-10-20T23:30:00Z");
    expect(startOfLocalDay(now, "America/Los_Angeles").toISOString()).toBe("2026-10-20T07:00:00.000Z");
  });
  it("handles the hours after UTC midnight that are still 'yesterday' locally", () => {
    // 2026-10-21 03:00 UTC is 20:00 on Oct 20 in Los Angeles.
    const now = new Date("2026-10-21T03:00:00Z");
    expect(startOfLocalDay(now, "America/Los_Angeles").toISOString()).toBe("2026-10-20T07:00:00.000Z");
  });
});
