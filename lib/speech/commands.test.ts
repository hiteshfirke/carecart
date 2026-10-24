import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands";

describe("parseCommand", () => {
  it("confirms only exact confirm phrases in confirm mode", () => {
    for (const t of ["Yes", "yes.", "Yes please", "Confirm", "pay now", "Yes, pay it"]) {
      expect(parseCommand(t, "confirm")).toEqual({ type: "confirm" });
    }
  });

  it("never confirms with the send phrases: sending is its own command", () => {
    for (const t of ["send it", "yes send it", "send the money"]) expect(parseCommand(t, "confirm")).toEqual({ type: "send" });
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

describe("send command", () => {
  it.each(["send it", "yes send it", "send the money", "Send it.", "Yes, send it", "SEND THE MONEY!"])("%s sends in every mode", (t) => {
    for (const mode of ["idle", "options", "confirm"] as const) expect(parseCommand(t, mode)).toEqual({ type: "send" });
  });

  it("leaves longer sentences to the helper", () => {
    for (const t of ["send it later", "send it to Tom", "send the money to Tom", "please send it"]) {
      for (const mode of ["idle", "options", "confirm"] as const) expect(parseCommand(t, mode)).toEqual({ type: "say", text: t });
    }
  });

  it("does not make a bare yes or confirm mean send", () => {
    for (const t of ["yes", "yes please", "confirm", "pay now"]) expect(parseCommand(t, "idle")).toEqual({ type: "say", text: t });
  });
});

describe("speed commands", () => {
  it("understands faster as well as slower, in any mode", () => {
    for (const mode of ["idle", "options", "confirm"] as const) {
      expect(parseCommand("faster", mode)).toEqual({ type: "faster" });
      expect(parseCommand("Speak faster.", mode)).toEqual({ type: "faster" });
      expect(parseCommand("speed up", mode)).toEqual({ type: "faster" });
      expect(parseCommand("slower", mode)).toEqual({ type: "slower" });
    }
  });
});

describe("natural speed requests", () => {
  it("understands how people actually ask to slow down or speed up", () => {
    for (const said of ["Speak the slowest you can.", "Speak more slower.", "speak more slowly", "talk slower please", "Please speak slowly", "can you slow down", "too fast"]) {
      expect(parseCommand(said, "idle")).toEqual({ type: "slower" });
    }
    for (const said of ["Speak the fastest you can.", "please speak faster", "talk quicker", "too slow", "speak a bit quicker"]) {
      expect(parseCommand(said, "idle")).toEqual({ type: "faster" });
    }
  });

  it("leaves shopping requests that mention slow or fast to the helper", () => {
    expect(parseCommand("I need a slow cooker", "idle").type).toBe("say");
    expect(parseCommand("fast charging cable please", "idle").type).toBe("say");
    expect(parseCommand("I want slow release vitamins", "idle").type).toBe("say");
    expect(parseCommand("can you find a slow cooker", "idle").type).toBe("say");
  });
});
