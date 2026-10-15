import { describe, expect, it } from "vitest";
import { toMessages } from "./run";

describe("toMessages", () => {
  it("appends the new user text and merges same-role neighbours", () => {
    expect(
      toMessages(
        [
          { role: "user", text: "hi" },
          { role: "assistant", text: "Hello" },
          { role: "assistant", text: "How can I help?" },
        ],
        "I need tea",
      ),
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello\nHow can I help?" },
      { role: "user", content: "I need tea" },
    ]);
  });

  it("drops leading assistant messages so the conversation starts with the user", () => {
    expect(toMessages([{ role: "assistant", text: "Hello" }], "tea")).toEqual([{ role: "user", content: "tea" }]);
  });
});
