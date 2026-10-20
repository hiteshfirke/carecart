export type Mode = "idle" | "options" | "confirm";

export type Command =
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "repeat" }
  | { type: "slower" }
  | { type: "faster" }
  | { type: "help" }
  | { type: "back" }
  | { type: "select"; index: 0 | 1 | 2 }
  | { type: "say"; text: string };

// Exact, whole-utterance matches only. "yes but wait" must never pay.
export const CONFIRM_PHRASES: ReadonlySet<string> = new Set([
  "yes", "yes please", "confirm", "confirm it", "yes confirm", "pay", "pay now", "pay it", "yes pay", "yes pay it", "yes pay now",
]);

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

const ORDINALS: Record<string, 0 | 1 | 2> = { one: 0, first: 0, "1": 0, two: 1, second: 1, "2": 1, three: 2, third: 2, "3": 2 };

const SELECT =
  /^(?:(?:i(?:'ll| will)? (?:take|want|choose|pick)|give me) )?(?:the )?(?:option |number )?(one|first|1|two|second|2|three|third|3)(?: one| option)?(?: please)?$/;

export function parseCommand(text: string, mode: Mode): Command {
  const t = normalize(text);
  if (/^(cancel|stop|no|no thanks|never mind|nevermind)$/.test(t)) return { type: "cancel" };
  if (/^(repeat|say that again|say it again|again|what)$/.test(t)) return { type: "repeat" };
  if (/^(slower|slow down|speak slower)$/.test(t)) return { type: "slower" };
  if (/^(faster|speak faster|speed up|go faster)$/.test(t)) return { type: "faster" };
  if (/^(help|what can i say)$/.test(t)) return { type: "help" };
  if (/^(go back|back)$/.test(t)) return { type: "back" };
  if (mode === "confirm" && CONFIRM_PHRASES.has(t)) return { type: "confirm" };
  if (mode === "options") {
    const m = t.match(SELECT);
    if (m) return { type: "select", index: ORDINALS[m[1]] };
  }
  return { type: "say", text: text.trim() };
}
