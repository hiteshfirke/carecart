import type { Household, Order, OrderPatch, Payee, TransitionOutcome, TrustedPerson, TrustedRequest } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/state";
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

// What Rose said ("Sam", "my grandson") against the trusted list, by exact name or relationship.
export function matchTrusted(people: TrustedPerson[], spoken: string): TrustedPerson[] {
  const said = spoken.toLowerCase().trim().replace(/^my\s+/, "").trim();
  return people.filter((p) => p.name.toLowerCase() === said || p.relationship?.toLowerCase() === said);
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
