// Which language model the app talks to. Claude (Anthropic) is the default; any OpenAI-compatible
// chat API (Groq, Gemini, OpenRouter, …) can stand in by setting AI_PROVIDER=openai-compatible.
export type AiProvider = "anthropic" | "openai-compatible";

export function aiProvider(): AiProvider {
  return process.env.AI_PROVIDER === "openai-compatible" ? "openai-compatible" : "anthropic";
}

export function aiConfigured(): boolean {
  if (aiProvider() === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  return !!(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL);
}
