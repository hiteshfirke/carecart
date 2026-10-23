import type { OrderKind } from "@/lib/db";
import type { Cents } from "@/lib/money";

export type FlagCode =
  | "S1_SCAM_PRODUCT"
  | "S1_SCAM_PHRASE"
  | "S1_PRESSURE_WORD"
  | "S2_OVER_SELF_PAY_LIMIT"
  | "S3_OVER_DAILY_CAP"
  | "S4_UNUSUAL_AMOUNT"
  | "S5_NEW_MERCHANT"
  | "S6_DUPLICATE"
  | "S7_AI_HIGH_RISK";

export type Flag = { code: FlagCode; message: string };
export type Route = "self_pay" | "caregiver" | "blocked" | "recheck";
export type AiRisk = { risk: "low" | "medium" | "high"; reasons: string[] };

export type RuleHistory = {
  paidTodayCents: Cents;
  recentPaidTotalsCents: Cents[]; // newest first
  paidMerchants: string[];
  minutesSinceSameProduct: number | null;
};

export type RuleInput = {
  order: { totalCents: Cents; productId: string; title: string; category: string | null; merchant: string; kind: OrderKind };
  limits: { selfPayLimitCents: Cents; dailyCapCents: Cents };
  history: RuleHistory;
  transcript: string[]; // Rose's own words in this session
  aiRisk: AiRisk | null;
  duplicateAcknowledged: boolean;
};

export type RuleResult = { route: Route; flags: Flag[] };

export const NEW_MERCHANT_THRESHOLD_CENTS = 1500;
export const DUPLICATE_WINDOW_MINUTES = 10;
export const UNUSUAL_MULTIPLIER = 3;
export const MIN_HISTORY_FOR_UNUSUAL = 3;

const SCAM_PRODUCT =
  /\b(gift\s*cards?|prepaid\s*(debit\s*)?cards?|reloadable\s*cards?|bitcoin|crypto(currency)?|money\s*orders?|wire\s*transfers?|western\s*union|moneygram)\b/i;

const SCAM_PHRASES: RegExp[] = [
  /\bgift\s*cards?\b/i,
  /\bwire\s+(the\s+)?(money|funds|cash|transfer)\b/i,
  /\bbitcoin\b/i,
  /\birs\b/i,
  /\bbail\b/i,
  /\bwarrant\b/i,
  /\bkeep\s+(this|it)\s+(a\s+)?secret\b/i,
  /\bdon'?t\s+tell\b/i,
  /\baccount\s+(is\s+|was\s+|has\s+been\s+)?(suspended|blocked|frozen|locked)\b/i,
  /\b(my\s+|the\s+)?bank\s+(said|called|told)\b/i,
  /\bgrandson\s+(is\s+)?in\s+trouble\b/i,
];

// Only checked for gifts: the classic "grandchild in trouble" scripts that ask for money sent to a person.
const GIFT_SCAM_PHRASES: RegExp[] = [
  /\bjail\b/i,
  /\barrested\b/i,
  /\blawyer\b/i,
  /\baccident\b/i,
  /\bhospital\b/i,
  /\bnew\s+(phone\s+)?number\b/i,
  /\bcourier\b/i,
  /\bsend\s+it\s+today\b/i,
];

export const GIFT_SCAM_MESSAGE = "Something said in this conversation sounds like a common scam, like someone in trouble asking for money in secret.";

export function scamPhraseIn(transcript: string[], kind: OrderKind): boolean {
  const said = transcript.join("\n");
  return SCAM_PHRASES.some((r) => r.test(said)) || (kind === "gift" && GIFT_SCAM_PHRASES.some((r) => r.test(said)));
}

const PRESSURE_WORD = /\burgent(ly)?\b/i;

const BLOCKING: ReadonlySet<FlagCode> = new Set(["S1_SCAM_PRODUCT", "S1_SCAM_PHRASE"]);
const TO_CAREGIVER: ReadonlySet<FlagCode> = new Set([
  "S1_PRESSURE_WORD",
  "S2_OVER_SELF_PAY_LIMIT",
  "S3_OVER_DAILY_CAP",
  "S4_UNUSUAL_AMOUNT",
  "S5_NEW_MERCHANT",
  "S7_AI_HIGH_RISK",
]);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function evaluateRules(input: RuleInput): RuleResult {
  const { order, limits, history } = input;
  const flags: Flag[] = [];
  const said = input.transcript.join("\n");

  if (SCAM_PRODUCT.test(`${order.title} ${order.category ?? ""}`)) {
    flags.push({ code: "S1_SCAM_PRODUCT", message: "Gift cards, prepaid cards, crypto and money transfers can't be bought here. Scammers often ask for these." });
  }
  if (scamPhraseIn(input.transcript, order.kind)) {
    flags.push({
      code: "S1_SCAM_PHRASE",
      message: order.kind === "gift" ? GIFT_SCAM_MESSAGE : "Something said in this conversation sounds like a common scam, like a bank or official asking you to pay.",
    });
  }
  if (PRESSURE_WORD.test(said)) {
    flags.push({ code: "S1_PRESSURE_WORD", message: "This sounded urgent, so your caregiver will take a quick look." });
  }
  if (order.totalCents > limits.selfPayLimitCents) {
    flags.push({ code: "S2_OVER_SELF_PAY_LIMIT", message: "This is more than your own spending limit." });
  }
  if (history.paidTodayCents + order.totalCents > limits.dailyCapCents) {
    flags.push({ code: "S3_OVER_DAILY_CAP", message: "This would go over today's spending limit." });
  }
  const recent = history.recentPaidTotalsCents.slice(0, 10);
  if (recent.length >= MIN_HISTORY_FOR_UNUSUAL && order.totalCents > UNUSUAL_MULTIPLIER * median(recent)) {
    flags.push({ code: "S4_UNUSUAL_AMOUNT", message: "This costs much more than your usual orders." });
  }
  const merchant = order.merchant.toLowerCase();
  const knownMerchant = history.paidMerchants.some((m) => m.toLowerCase() === merchant);
  if (order.kind !== "gift" && !knownMerchant && order.totalCents > NEW_MERCHANT_THRESHOLD_CENTS) {
    flags.push({ code: "S5_NEW_MERCHANT", message: "You haven't bought from this store before." });
  }
  if (
    history.minutesSinceSameProduct !== null &&
    history.minutesSinceSameProduct < DUPLICATE_WINDOW_MINUTES &&
    !input.duplicateAcknowledged
  ) {
    flags.push({ code: "S6_DUPLICATE", message: "You ordered this same item a few minutes ago." });
  }
  if (input.aiRisk?.risk === "high") {
    flags.push({ code: "S7_AI_HIGH_RISK", message: "Our assistant noticed something unusual about this order." });
  }

  return { route: routeFor(flags), flags };
}

function routeFor(flags: Flag[]): Route {
  if (flags.some((f) => BLOCKING.has(f.code))) return "blocked";
  if (flags.some((f) => f.code === "S6_DUPLICATE")) return "recheck";
  if (flags.some((f) => TO_CAREGIVER.has(f.code))) return "caregiver";
  return "self_pay";
}
