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
  "send it", "yes send it", "send the money",
]);

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Natural speed requests ("speak the slowest you can", "talk quicker"). They must mention speaking, so
// shopping requests like "a slow cooker" or "a fast charger" still go to the helper.
const SPEAKING = /\b(speak|speaking|talk|talking|voice|read)\b/;
const SLOW = /\b(slow|slower|slowest|slowly)\b/;
const FAST = /\b(fast|faster|fastest|quick|quicker|quickly)\b/;

function speedRequest(t: string): "slower" | "faster" | null {
  if (/\bslow down\b/.test(t) || t === "too fast") return "slower";
  if (/\bspeed up\b/.test(t) || t === "too slow") return "faster";
  if (t.split(" ").length > 8 || !SPEAKING.test(t)) return null;
  if (SLOW.test(t)) return "slower";
  if (FAST.test(t)) return "faster";
  return null;
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
  const speed = speedRequest(t);
  if (speed) return { type: speed };
  if (/^(help|what can i say)$/.test(t)) return { type: "help" };
  if (/^(go back|back)$/.test(t)) return { type: "back" };
  if (mode === "confirm" && CONFIRM_PHRASES.has(t)) return { type: "confirm" };
  if (mode === "options") {
    const m = t.match(SELECT);
    if (m) return { type: "select", index: ORDINALS[m[1]] };
  }
  return { type: "say", text: text.trim() };
}
