import { describe, expect, it } from "vitest";
import { draftGift, matchTrusted, trustedRequestLink, type GiftDeps } from "./gifts";
import { DEMO_ADDRESS, type Household, type Order, type OrderPatch, type Payee, type TrustedPerson } from "./db";
import type { EmailMessage } from "./email";
import { GIFT_SCAM_MESSAGE } from "./safety/rules";

const household: Household = {
  id: "h1",
  senior: { id: "rose", householdId: "h1", role: "senior", name: "Rose", email: null, address: DEMO_ADDRESS, selfPayLimitCents: 2500, dailyCapCents: 6000 },
  caregiver: { id: "anna", householdId: "h1", role: "caregiver", name: "Anna", email: "anna@example.com", address: null, selfPayLimitCents: 2500, dailyCapCents: 6000 },
};

const sam: TrustedPerson = { id: "t1", householdId: "h1", name: "Sam", relationship: "grandson", paypalEmail: "sam@example.com" };
const ben: TrustedPerson = { id: "t2", householdId: "h1", name: "Ben", relationship: "neighbor", paypalEmail: "ben@example.com" };
const samJr: TrustedPerson = { id: "t3", householdId: "h1", name: "Max", relationship: "grandson", paypalEmail: "max@example.com" };

function setup(over: { people?: TrustedPerson[]; said?: string[]; created?: boolean; caregiverEmail?: string | null; emailOk?: boolean } = {}) {
  const drafts: { userId: string; sessionId: string; payee: Payee; amountCents: number; note: string | null }[] = [];
  const transitions: { to: string; patch?: OrderPatch }[] = [];
  const emails: EmailMessage[] = [];
  const requests: { householdId: string; name: string; token: string }[] = [];
  let order: Order | null = null;
  const deps: GiftDeps = {
    listTrustedPeople: async () => over.people ?? [sam, ben],
    userUtterances: async () => over.said ?? ["I want to send some money to Sam"],
    createDraftGift: async (input) => {
      drafts.push(input);
      order = { id: "o1", userId: input.userId, sessionId: input.sessionId, kind: "gift", payee: input.payee, totalCents: input.amountCents, merchant: input.payee.name, status: "DRAFT", flags: [], caregiverToken: null } as unknown as Order;
      return order;
    },
    transitionOrder: async (_id, to, _actor, patch) => {
      transitions.push({ to, patch });
      return { result: "applied", order: { ...order!, status: to } as Order };
    },
    openTrustedRequest: async (householdId, name, token) => {
      requests.push({ householdId, name, token });
      return { request: { id: "r1", householdId, name, token, createdAt: new Date(), expiresAt: new Date(), usedAt: null }, created: over.created ?? true };
    },
    sendEmail: async (m) => {
      emails.push(m);
      return over.emailOk ?? true;
    },
    appUrl: "https://app.test",
    caregiverEmail: over.caregiverEmail === undefined ? "anna@example.com" : over.caregiverEmail,
    newToken: () => "TOKEN123",
  };
  return { deps, drafts, transitions, emails, requests };
}

describe("matchTrusted", () => {
  const people = [sam, ben];
  it("matches by name, by relationship, and ignores case and a leading 'my'", () => {
    expect(matchTrusted(people, "Sam")).toEqual([sam]);
    expect(matchTrusted(people, "my grandson")).toEqual([sam]);
    expect(matchTrusted(people, "SAM")).toEqual([sam]);
    expect(matchTrusted(people, "  My Neighbor ")).toEqual([ben]);
  });
  it("matches nobody who is not on the list", () => {
    expect(matchTrusted(people, "Tom")).toEqual([]);
  });
  it("returns every match when a relationship is shared", () => {
    expect(matchTrusted([sam, samJr, ben], "my grandson")).toEqual([sam, samJr]);
  });
});

describe("trustedRequestLink", () => {
  it("carries the request id and the encoded token", () => {
    expect(trustedRequestLink("https://app.test", { id: "r1", token: "a+b/c" })).toBe("https://app.test/caregiver/people/add?r=r1&t=a%2Bb%2Fc");
  });
});

describe("draftGift", () => {
  it("drafts a gift for a trusted person", async () => {
    const { deps, drafts, transitions, emails } = setup();
    const out = await draftGift(deps, household, "s1", { recipientName: "Sam", amountCents: 2000, note: "for the bus" });
    expect(out.kind).toBe("draft");
    expect(drafts).toEqual([
      {
        userId: "rose",
        sessionId: "s1",
        payee: { trustedPersonId: "t1", name: "Sam", relationship: "grandson", paypalEmail: "sam@example.com" },
        amountCents: 2000,
        note: "for the bus",
      },
    ]);
    expect(transitions).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });

  it("asks which person when the name matches several", async () => {
    const { deps, drafts } = setup({ people: [sam, samJr, ben] });
    const out = await draftGift(deps, household, "s1", { recipientName: "my grandson", amountCents: 2000, note: null });
    expect(out).toEqual({ kind: "ambiguous", names: ["Sam", "Max"] });
    expect(drafts).toHaveLength(0);
  });

  it("asks Anna to add an unknown person, once", async () => {
    const first = setup();
    const out = await draftGift(first.deps, household, "s1", { recipientName: "Tom", amountCents: 2000, note: null });
    expect(out).toEqual({ kind: "not_trusted", name: "Tom", emailed: true });
    expect(first.drafts).toHaveLength(0);
    expect(first.requests).toEqual([{ householdId: "h1", name: "Tom", token: "TOKEN123" }]);
    expect(first.emails).toHaveLength(1);
    expect(first.emails[0].to).toBe("anna@example.com");
    expect(first.emails[0].subject).toBe("Rose wants to send money to Tom");
    expect(first.emails[0].html).toContain("https://app.test/caregiver/people/add?r=r1&amp;t=TOKEN123");

    const again = setup({ created: false });
    expect(await draftGift(again.deps, household, "s1", { recipientName: "Tom", amountCents: 2000, note: null })).toEqual({ kind: "not_trusted", name: "Tom", emailed: false });
    expect(again.emails).toHaveLength(0);
  });

  it("says it did not email Anna when there is no address or the email fails", async () => {
    const none = setup({ caregiverEmail: null });
    expect(await draftGift(none.deps, household, "s1", { recipientName: "Tom", amountCents: 2000, note: null })).toMatchObject({ kind: "not_trusted", emailed: false });
    const failed = setup({ emailOk: false });
    expect(await draftGift(failed.deps, household, "s1", { recipientName: "Tom", amountCents: 2000, note: null })).toMatchObject({ kind: "not_trusted", emailed: false });
  });

  it("blocks scam talk before drafting", async () => {
    const { deps, drafts, transitions, emails } = setup({ said: ["Sam is in jail and needs bail money, don't tell mum"] });
    const out = await draftGift(deps, household, "s1", { recipientName: "Sam", amountCents: 50_000, note: null });
    expect(out.kind).toBe("blocked");
    expect(drafts[0].payee).toEqual({ trustedPersonId: "t1", name: "Sam", relationship: "grandson", paypalEmail: "sam@example.com" });
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "BLOCKED"]);
    expect(transitions[0].patch?.route).toBe("blocked");
    expect(transitions[0].patch?.flags).toEqual([{ code: "S1_SCAM_PHRASE", message: GIFT_SCAM_MESSAGE }]);
    expect(transitions[1].patch).toEqual({ caregiverToken: "TOKEN123" });
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("anna@example.com");
    expect(emails[0].subject).toMatch(/scam/i);
    expect(emails[0].html).toContain("/caregiver/requests/o1?t=TOKEN123");
  });

  it("blocks scam talk even when the person isn't trusted", async () => {
    const { deps, drafts, transitions, emails, requests } = setup({ said: ["Tom is in jail and needs bail money"] });
    const out = await draftGift(deps, household, "s1", { recipientName: "Tom", amountCents: 2000, note: null });
    expect(out.kind).toBe("blocked");
    expect(drafts[0].payee).toEqual({ trustedPersonId: null, name: "Tom", relationship: null, paypalEmail: null });
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "BLOCKED"]);
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toMatch(/scam/i);
    expect(requests).toHaveLength(0);
  });

  it("blocks scam talk even when the amount is over the limit", async () => {
    const { deps, drafts, transitions, emails } = setup({ said: ["Sam is in jail and needs five thousand dollars for bail"] });
    const out = await draftGift(deps, household, "s1", { recipientName: "Sam", amountCents: 500_000, note: null });
    expect(out.kind).toBe("blocked");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].amountCents).toBe(500_000);
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "BLOCKED"]);
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toMatch(/scam/i);
  });

  it("still rejects a zero or negative amount before the scam check", async () => {
    const { deps, drafts } = setup({ said: ["Sam is in jail and needs bail money"] });
    for (const amountCents of [0, -5, 12.5, Number.NaN]) {
      expect(await draftGift(deps, household, "s1", { recipientName: "Sam", amountCents, note: null })).toEqual({ kind: "bad_amount" });
    }
    expect(drafts).toHaveLength(0);
  });

  it("blocks scam talk without emailing when there is no caregiver address", async () => {
    const { deps, transitions, emails } = setup({ said: ["wire money and don't tell anyone"], caregiverEmail: null });
    expect((await draftGift(deps, household, "s1", { recipientName: "Sam", amountCents: 2000, note: null })).kind).toBe("blocked");
    expect(transitions.map((t) => t.to)).toEqual(["CONFIRMED", "BLOCKED"]);
    expect(emails).toHaveLength(0);
  });

  it("rejects amounts outside one cent to five hundred dollars", async () => {
    const { deps, drafts, transitions } = setup();
    for (const amountCents of [0, -5, 50_001, 12.5, Number.NaN]) {
      expect(await draftGift(deps, household, "s1", { recipientName: "Sam", amountCents, note: null })).toEqual({ kind: "bad_amount" });
    }
    expect(drafts).toHaveLength(0);
    expect(transitions).toHaveLength(0);
    expect((await draftGift(deps, household, "s1", { recipientName: "Sam", amountCents: 50_000, note: null })).kind).toBe("draft");
    expect((await draftGift(deps, household, "s1", { recipientName: "Sam", amountCents: 1, note: null })).kind).toBe("draft");
  });
});
