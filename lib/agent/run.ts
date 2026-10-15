import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import type { ChatMessage } from "@/lib/db";
import { systemPrompt } from "./prompt";
import { buildTools, type AgentDeps, type TurnContext, type TurnOutput } from "./tools";

let anthropic: Anthropic | null = null;
function client(): Anthropic {
  anthropic ??= new Anthropic();
  return anthropic;
}

export function toMessages(history: ChatMessage[], userText: string): BetaMessageParam[] {
  const merged: ChatMessage[] = [];
  for (const m of [...history, { role: "user" as const, text: userText }]) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.text += "\n" + m.text;
    else merged.push({ ...m });
  }
  while (merged.length > 0 && merged[0].role !== "user") merged.shift();
  return merged.map((m) => ({ role: m.role, content: m.text }));
}

export async function runTurn(args: {
  deps: AgentDeps;
  ctx: TurnContext;
  userName: string;
  history: ChatMessage[];
  userText: string;
}): Promise<{ reply: string } & TurnOutput> {
  const out: TurnOutput = { options: null, draft: null };
  const final = await client().beta.messages.toolRunner({
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5",
    max_tokens: 2000,
    system: systemPrompt(args.userName, args.ctx.caregiverName),
    messages: toMessages(args.history, args.userText),
    tools: buildTools(args.deps, args.ctx, out),
    max_iterations: 6,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (final.stop_reason === "refusal") {
    return { reply: `Sorry, I can't help with that one. ${args.ctx.caregiverName} can help you.`, ...out };
  }
  const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
  return { reply: text || "Sorry, could you say that again?", ...out };
}
