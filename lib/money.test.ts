import { describe, expect, it } from "vitest";
import { formatUsd, speakUsd, toCents } from "./money";

describe("toCents", () => {
  it("rounds floating dollars to whole cents", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(8)).toBe(800);
  });
});

describe("formatUsd", () => {
  it("formats cents as a PayPal amount string", () => {
    expect(formatUsd(1999)).toBe("19.99");
    expect(formatUsd(5)).toBe("0.05");
    expect(formatUsd(1000)).toBe("10.00");
  });
});

describe("speakUsd", () => {
  it("speaks whole dollars", () => {
    expect(speakUsd(1000)).toBe("ten dollars");
    expect(speakUsd(100)).toBe("one dollar");
  });
  it("speaks dollars and cents", () => {
    expect(speakUsd(1050)).toBe("ten dollars and fifty cents");
    expect(speakUsd(6599)).toBe("sixty-five dollars and ninety-nine cents");
  });
  it("speaks cents only", () => {
    expect(speakUsd(1)).toBe("one cent");
    expect(speakUsd(45)).toBe("forty-five cents");
  });
  it("speaks hundreds and thousands", () => {
    expect(speakUsd(125000)).toBe("one thousand two hundred fifty dollars");
  });
});
