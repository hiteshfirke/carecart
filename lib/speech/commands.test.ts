import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands";

describe("parseCommand", () => {
  it("confirms only exact confirm phrases in confirm mode", () => {
    for (const t of ["Yes", "yes.", "Yes please", "Confirm", "pay now", "Yes, pay it"]) {
      expect(parseCommand(t, "confirm")).toEqual({ type: "confirm" });
    }
  });

  it("never confirms ambiguous speech", () => {
    for (const t of ["yes but wait", "yes I think so", "yeah maybe", "yes how much is it", "I guess"]) {
      expect(parseCommand(t, "confirm").type).toBe("say");
    }
  });

  it("does not confirm outside confirm mode", () => {
    expect(parseCommand("yes", "options").type).toBe("say");
    expect(parseCommand("confirm", "idle").type).toBe("say");
  });

  it("selects options by number or ordinal in options mode", () => {
    expect(parseCommand("the second one", "options")).toEqual({ type: "select", index: 1 });
    expect(parseCommand("Option 3", "options")).toEqual({ type: "select", index: 2 });
    expect(parseCommand("I'll take the first one", "options")).toEqual({ type: "select", index: 0 });
    expect(parseCommand("number two please", "options")).toEqual({ type: "select", index: 1 });
  });

  it("passes richer requests to the helper", () => {
    expect(parseCommand("two boxes of the second one", "options")).toEqual({ type: "say", text: "two boxes of the second one" });
  });

  it("understands always-available commands in every mode", () => {
    expect(parseCommand("Cancel", "confirm")).toEqual({ type: "cancel" });
    expect(parseCommand("no", "options")).toEqual({ type: "cancel" });
    expect(parseCommand("say that again", "idle")).toEqual({ type: "repeat" });
    expect(parseCommand("slow down", "idle")).toEqual({ type: "slower" });
    expect(parseCommand("help", "options")).toEqual({ type: "help" });
    expect(parseCommand("go back", "confirm")).toEqual({ type: "back" });
  });
});
