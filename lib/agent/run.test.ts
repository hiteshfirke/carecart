import { afterEach, describe, expect, it, vi } from "vitest";
import { runTurn, toMessages } from "./run";
import type { AgentDeps } from "./tools";

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

describe("runTurn with an OpenAI-compatible provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the configured API instead of Anthropic and returns its reply", async () => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("AI_API_KEY", "k");
    vi.stubEnv("AI_MODEL", "m");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "What do you need?" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const deps = {} as AgentDeps;
    const result = await runTurn({ deps, ctx: { userId: "u", sessionId: "s", caregiverName: "Anna" }, userName: "Rose", history: [], userText: "hello" });
    expect(result).toEqual({ reply: "What do you need?", options: null, draft: null });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("https://api.example.com/v1/chat/completions");
  });
});
