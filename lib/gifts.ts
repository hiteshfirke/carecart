import type { Household, Order, OrderPatch, Payee, Role, TransitionOutcome, TrustedPerson, TrustedRequest } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/state";
import type { CreateGiftInput, CreatePayPalOrderInput } from "@/lib/paypal";
import type { ErrorCode } from "@/lib/errors";
import { GIFT_SCAM_MESSAGE, scamPhraseIn, type Flag } from "@/lib/safety/rules";
import { addPersonRequestEmail, scamAlertEmail, type SendEmail } from "@/lib/email";
import { caregiverLink } from "@/lib/caregiver";

export const MAX_GIFT_CENTS = 50_000;

export type GiftDeps = {
  listTrustedPeople(householdId: string): Promise<TrustedPerson[]>;
  userUtterances(sessionId: string): Promise<string[]>;
  createDraftGift(input: { userId: string; sessionId: string; payee: Payee; amountCents: number; note: string | null }): Promise<Order>;
  transitionOrder(id: string, to: OrderStatus, actor: string, patch?: OrderPatch): Promise<TransitionOutcome | null>;
  openTrustedRequest(householdId: string, name: string, token: string): Promise<{ request: TrustedRequest; created: boolean }>;
  sendEmail: SendEmail;
  appUrl: string;
  caregiverEmail: string | null;
  newToken(): string;
};

export type DraftGiftInput = { recipientName: string; amountCents: number; note: string | null };
export type DraftGiftResult =
  | { kind: "draft"; order: Order }
  | { kind: "ambiguous"; names: string[] }
  | { kind: "not_trusted"; name: string; emailed: boolean }
  | { kind: "blocked"; order: Order }
  | { kind: "bad_amount" };

const snapshot = (p: TrustedPerson): Payee => ({ trustedPersonId: p.id, name: p.name, relationship: p.relationship, paypalEmail: p.paypalEmail });

// Whole words only, so "Sam" is in "my grandson Sam" but not in "Samantha".
function hasWords(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(text);
}

// What Rose said ("Sam", "my grandson", "my grandson Sam") against the trusted list.
// The whole phrase as a name or relationship wins; then a name inside it; then a relationship inside it.
export function matchTrusted(people: TrustedPerson[], spoken: string): TrustedPerson[] {
  const said = spoken.toLowerCase().trim().replace(/^my\s+/, "").trim();
  const exact = people.filter((p) => p.name.toLowerCase() === said || p.relationship?.toLowerCase() === said);
  if (exact.length > 0) return exact;
  const byName = people.filter((p) => p.name.trim() && hasWords(said, p.name.toLowerCase().trim()));
  if (byName.length > 0) return byName;
  return people.filter((p) => p.relationship?.trim() && hasWords(said, p.relationship.toLowerCase().trim()));
}

export function trustedRequestLink(appUrl: string, r: Pick<TrustedRequest, "id" | "token">): string {
  return `${appUrl}/caregiver/people/add?r=${r.id}&t=${encodeURIComponent(r.token)}`;
}

// The AI only names who Rose meant. Who gets paid always comes from the trusted list.
export async function draftGift(deps: GiftDeps, household: Household, sessionId: string, input: DraftGiftInput): Promise<DraftGiftResult> {
  const { senior } = household;
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1) return { kind: "bad_amount" };

  const spoken = input.recipientName.trim();
  const matches = matchTrusted(await deps.listTrustedPeople(household.id), spoken);
  const note = input.note?.trim() || null;

  // The current utterance is already saved by the agent route, so it is part of this transcript.
  if (scamPhraseIn(await deps.userUtterances(sessionId), "gift")) {
    const payee: Payee = matches.length === 1 ? snapshot(matches[0]) : { trustedPersonId: null, name: spoken, relationship: null, paypalEmail: null };
    const order = await deps.createDraftGift({ userId: senior.id, sessionId, payee, amountCents: input.amountCents, note });
    const flags: Flag[] = [{ code: "S1_SCAM_PHRASE", message: GIFT_SCAM_MESSAGE }];
    await deps.transitionOrder(order.id, "CONFIRMED", "senior", { route: "blocked", flags });
    // Anna may open the email on her own phone, so the link carries this order's token.
    const caregiverToken = deps.newToken();
    const stopped = await deps.transitionOrder(order.id, "BLOCKED", "rules", { caregiverToken });
    const blocked: Order = { ...(stopped?.order ?? order), flags, caregiverToken };
    if (deps.caregiverEmail) {
      await deps.sendEmail({ to: deps.caregiverEmail, ...scamAlertEmail(blocked, senior, caregiverLink(deps.appUrl, blocked)) });
    }
    return { kind: "blocked", order: blocked };
  }

  // After the scam check on purpose: a "$5,000 bail" request must still be blocked and warn Anna.
  if (input.amountCents > MAX_GIFT_CENTS) return { kind: "bad_amount" };

  if (matches.length > 1) return { kind: "ambiguous", names: matches.map((p) => p.name) };

  if (matches.length === 0) {
    const { request, created } = await deps.openTrustedRequest(household.id, spoken, deps.newToken());
    // A repeat ask within the window reuses the open link, so Anna is not emailed twice.
    const emailed =
      created && deps.caregiverEmail
        ? await deps.sendEmail({ to: deps.caregiverEmail, ...addPersonRequestEmail(senior, spoken, trustedRequestLink(deps.appUrl, request)) })
        : false;
    return { kind: "not_trusted", name: spoken, emailed };
  }

  const order = await deps.createDraftGift({ userId: senior.id, sessionId, payee: snapshot(matches[0]), amountCents: input.amountCents, note });
  return { kind: "draft", order };
}

// A gift can only be paid to someone on the trusted list with a PayPal email. Blocked unknown-person gifts have neither.
export type PayablePayee = Payee & { trustedPersonId: string; paypalEmail: string };

export function payablePayee(order: Pick<Order, "kind" | "payee">): PayablePayee | null {
  const p = order.payee;
  return order.kind === "gift" && p?.trustedPersonId && p.paypalEmail ? { ...p, trustedPersonId: p.trustedPersonId, paypalEmail: p.paypalEmail } : null;
}

export function giftPayPalInput(order: Pick<Order, "id" | "product" | "totalCents">, payee: PayablePayee, senderName: string, appUrl: string, requestId: string): CreateGiftInput {
  return {
    kind: "gift",
    orderId: order.id,
    title: order.product.title,
    amountCents: order.totalCents,
    payeeEmail: payee.paypalEmail,
    senderName,
    returnUrl: `${appUrl}/api/paypal/return`,
    cancelUrl: `${appUrl}/api/paypal/cancel`,
    requestId,
  };
}

// A gift Anna approved and Rose has yet to send. A gift Rose paid herself already has its own PayPal order from
// confirm (route "self_pay"), so it never counts: sending it again would orphan that order.
export function isWaitingGift(o: Pick<Order, "kind" | "status" | "payerRole" | "route">): boolean {
  return o.kind === "gift" && o.status === "AWAITING_PAYMENT" && o.payerRole === "senior" && o.route === "caregiver";
}

export type PayGiftDeps = {
  getOrder(id: string): Promise<Order | null>;
  isTrusted(householdId: string, trustedPersonId: string): Promise<boolean>;
  createPayPalOrder(input: CreatePayPalOrderInput): Promise<{ paypalOrderId: string; approveUrl: string }>;
  setPaypalOrderId(id: string, paypalOrderId: string, payerRole: Role): Promise<boolean>;
  appUrl: string;
};

// Anna already approved this exact amount and person, so the rules and the cap are not run again.
// Only "is this person still trusted" is, because Anna may have removed them since.
export async function payGift(deps: PayGiftDeps, household: Household, orderId: string): Promise<{ ok: true; approveUrl: string } | { ok: false; code: ErrorCode }> {
  const order = await deps.getOrder(orderId);
  if (!order || order.userId !== household.senior.id) return { ok: false, code: "not_found" };
  const payee = payablePayee(order);
  if (!payee) return { ok: false, code: "not_found" };
  if (!isWaitingGift(order)) return { ok: false, code: "not_waiting" };
  if (!(await deps.isTrusted(household.id, payee.trustedPersonId))) return { ok: false, code: "not_trusted" };

  let paypal: { paypalOrderId: string; approveUrl: string };
  try {
    // Same request id on every ask, so PayPal returns the same order instead of a second one.
    paypal = await deps.createPayPalOrder(giftPayPalInput(order, payee, household.senior.name, deps.appUrl, `create-${order.id}-senior-gift`));
  } catch (err) {
    console.error("PayPal order creation failed", err);
    return { ok: false, code: "paypal_down" };
  }
  // The return page finds the order by its PayPal id, so a new id must be saved before Rose goes to PayPal.
  if (paypal.paypalOrderId !== order.paypalOrderId && !(await deps.setPaypalOrderId(order.id, paypal.paypalOrderId, "senior"))) {
    return { ok: false, code: "request_changed" };
  }
  return { ok: true, approveUrl: paypal.approveUrl };
}
