// A minimal client for OpenAI-compatible chat APIs (Groq, Gemini, OpenRouter, …), used when
// AI_PROVIDER=openai-compatible. The Anthropic path does not go through this file.
import { z } from "zod";

type Fetch = typeof fetch;

export class AiProviderError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

// The same shape the Anthropic tool runner takes, so both providers share one tool list.
export type ToolSpec = { name: string; description: string; inputSchema: z.ZodType; run(input: unknown): Promise<string> };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function config() {
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!baseUrl || !apiKey || !model) throw new AiProviderError("AI_BASE_URL, AI_API_KEY and AI_MODEL must be set", null);
  return { baseUrl, apiKey, model };
}

function toFunction(tool: ToolSpec) {
  const parameters = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
  delete parameters.$schema; // some providers reject unknown top-level keys
  return { type: "function" as const, function: { name: tool.name, description: tool.description, parameters } };
}

export async function chat(
  messages: ChatMessage[],
  opts: { tools?: ToolSpec[]; maxTokens?: number } = {},
  f: Fetch = fetch,
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const { baseUrl, apiKey, model } = config();
  const body: Record<string, unknown> = { model, messages, max_tokens: opts.maxTokens ?? 2000 };
  if (opts.tools?.length) body.tools = opts.tools.map(toFunction);
  let res: Response;
  try {
    res = await f(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new AiProviderError(`AI request failed: ${(err as Error).name}`, null);
  }
  if (!res.ok) throw new AiProviderError(`AI request failed with status ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  const data = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
  const message = data.choices?.[0]?.message;
  return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
}

// Runs one tool call. Arguments come from the model, so they are validated before anything runs.
async function runToolCall(tools: ToolSpec[], call: ToolCall): Promise<string> {
  const tool = tools.find((t) => t.name === call.function.name);
  if (!tool) return `ERROR: there is no tool named ${call.function.name}.`;
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return "ERROR: the tool arguments were not valid JSON.";
  }
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) return `ERROR: invalid arguments: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
  return tool.run(parsed.data);
}

// The model → tool → model loop that the Anthropic SDK's tool runner does for Claude.
export async function runToolLoop(
  args: { system: string; messages: ChatMessage[]; tools: ToolSpec[]; maxIterations: number },
  f: Fetch = fetch,
): Promise<string> {
  const messages: ChatMessage[] = [{ role: "system", content: args.system }, ...args.messages];
  for (let i = 0; i < args.maxIterations; i++) {
    const reply = await chat(messages, { tools: args.tools }, f);
    if (reply.toolCalls.length === 0) return reply.content ?? "";
    messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      messages.push({ role: "tool", tool_call_id: call.id, content: await runToolCall(args.tools, call) });
    }
  }
  return "";
}
