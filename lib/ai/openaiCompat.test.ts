import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiProviderError, runToolLoop, type ToolSpec } from "./openaiCompat";

type Sent = { model: string; messages: { role: string; content: string | null; tool_call_id?: string }[]; tools?: { type: string; function: { name: string; parameters: Record<string, unknown> } }[] };

function fakeFetch(replies: unknown[]) {
  const sent: Sent[] = [];
  const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const next = replies.shift();
    if (next instanceof Response) return next;
    return new Response(JSON.stringify({ choices: [{ message: next }] }), { status: 200 });
  });
  return { f: f as unknown as typeof fetch, sent };
}

const search = vi.fn(async (input: { query: string }) => `found ${input.query}`);
const tools: ToolSpec[] = [
  { name: "search_products", description: "Search the store.", inputSchema: z.object({ query: z.string().min(1) }), run: (i) => search(i as { query: string }) },
];

beforeEach(() => {
  vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1/");
  vi.stubEnv("AI_API_KEY", "test-key");
  vi.stubEnv("AI_MODEL", "test-model");
  search.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("runToolLoop", () => {
  it("runs the tool the model asks for and returns the model's final text", async () => {
    const { f, sent } = fakeFetch([
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "search_products", arguments: '{"query":"reading glasses"}' } }] },
      { role: "assistant", content: "Option one: reading glasses." },
    ]);
    const reply = await runToolLoop({ system: "Be brief.", messages: [{ role: "user", content: "I need reading glasses" }], tools, maxIterations: 6 }, f);

    expect(reply).toBe("Option one: reading glasses.");
    expect(search).toHaveBeenCalledWith({ query: "reading glasses" });
    expect(sent[0].model).toBe("test-model");
    expect(sent[0].messages[0]).toEqual({ role: "system", content: "Be brief." });
    expect(sent[1].messages.at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: "found reading glasses" });
  });

  it("sends tools as JSON Schema functions, without the $schema key", async () => {
    const { f, sent } = fakeFetch([{ role: "assistant", content: "Hi" }]);
    await runToolLoop({ system: "s", messages: [{ role: "user", content: "hi" }], tools, maxIterations: 6 }, f);
    const fn = sent[0].tools?.[0];
    expect(fn?.type).toBe("function");
    expect(fn?.function.name).toBe("search_products");
    expect(fn?.function.parameters.type).toBe("object");
    expect(fn?.function.parameters).not.toHaveProperty("$schema");
  });

  it("never runs a tool with arguments that fail its schema, and tells the model why", async () => {
    const { f, sent } = fakeFetch([
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "search_products", arguments: '{"query":""}' } }] },
      { role: "assistant", content: "What would you like?" },
    ]);
    await runToolLoop({ system: "s", messages: [{ role: "user", content: "hi" }], tools, maxIterations: 6 }, f);
    expect(search).not.toHaveBeenCalled();
    expect(sent[1].messages.at(-1)?.content).toMatch(/^ERROR/);
  });

  it("answers an unknown tool or broken JSON with an error instead of crashing", async () => {
    const { f, sent } = fakeFetch([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "pay_now", arguments: "{}" } },
          { id: "c2", type: "function", function: { name: "search_products", arguments: "{not json" } },
        ],
      },
      { role: "assistant", content: "Sorry." },
    ]);
    expect(await runToolLoop({ system: "s", messages: [{ role: "user", content: "hi" }], tools, maxIterations: 6 }, f)).toBe("Sorry.");
    const toolReplies = sent[1].messages.filter((m) => m.role === "tool");
    expect(toolReplies.map((m) => m.tool_call_id)).toEqual(["c1", "c2"]);
    expect(toolReplies.every((m) => m.content?.startsWith("ERROR"))).toBe(true);
  });

  it("stops after maxIterations of tool calls", async () => {
    const call = { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "search_products", arguments: '{"query":"x"}' } }] };
    const { f, sent } = fakeFetch([call, call, call]);
    expect(await runToolLoop({ system: "s", messages: [{ role: "user", content: "hi" }], tools, maxIterations: 2 }, f)).toBe("");
    expect(sent).toHaveLength(2);
  });

  it("throws AiProviderError with the HTTP status when the provider fails", async () => {
    const { f } = fakeFetch([new Response('{"error":"rate limited"}', { status: 429 })]);
    const run = runToolLoop({ system: "s", messages: [{ role: "user", content: "hi" }], tools, maxIterations: 6 }, f);
    await expect(run).rejects.toBeInstanceOf(AiProviderError);
    await expect(run).rejects.toMatchObject({ status: 429 });
  });
});
