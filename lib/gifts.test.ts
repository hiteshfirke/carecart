import { describe, expect, it, vi } from "vitest";
import { canUseTrustedRequest, draftGift, isWaitingGift, matchTrusted, payGift, PersonForm, trustedRequestLink, type GiftDeps, type PayGiftDeps } from "./gifts";
import { DEMO_ADDRESS, type Household, type Order, type OrderPatch, type Payee, type TrustedPerson, type TrustedRequest } from "./db";
import type { EmailMessage } from "./email";
import type { CreatePayPalOrderInput } from "./paypal";
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
  const transitions: { to: string; actor: string; patch?: OrderPatch }[] = [];
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
    transitionOrder: async (_id, to, actor, patch) => {
      transitions.push({ to, actor, patch });
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
  it("finds the name or relationship inside a longer phrase, in either order", () => {
    expect(matchTrusted(people, "my grandson Sam")).toEqual([sam]);
    expect(matchTrusted(people, "Sam my grandson")).toEqual([sam]);
    expect(matchTrusted(people, "my neighbor")).toEqual([ben]);
    expect(matchTrusted(people, "my neighbor Ben")).toEqual([ben]);
    expect(matchTrusted([sam, samJr, ben], "my grandson Max")).toEqual([samJr]);
  });
  it("only matches whole words", () => {
    expect(matchTrusted(people, "Samantha")).toEqual([]);
    expect(matchTrusted(people, "my grandsons")).toEqual([]);
    expect(matchTrusted(people, "Bensonhurst Ben2")).toEqual([]);
  });
  it("prefers an exact match, then the name, then the relationship", () => {
    const anne: TrustedPerson = { id: "t4", householdId: "h1", name: "Mary Ann", relationship: "sister", paypalEmail: "ma@example.com" };
    expect(matchTrusted([anne, sam], "Mary Ann")).toEqual([anne]);
    expect(matchTrusted([anne, sam], "my sister Mary Ann")).toEqual([anne]);
    // The name wins over the relationship when both appear: "sister" alone would also be Mary Ann.
    expect(matchTrusted([anne, sam], "my sister Sam")).toEqual([sam]);
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

describe("canUseTrustedRequest", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const request: TrustedRequest = {
    id: "r1",
    householdId: "h1",
    name: "Tom",
    token: "secret-token",
    createdAt: new Date("2026-10-22T12:00:00Z"),
    expiresAt: new Date("2026-10-29T12:00:00Z"),
    usedAt: null,
  };
  it("is ok for the matching token before it expires", () => {
    expect(canUseTrustedRequest(request, "secret-token", now)).toBe("ok");
  });
  it("is invalid for a wrong token, a missing token or no request", () => {
    expect(canUseTrustedRequest(request, "secret-tokex", now)).toBe("invalid");
    expect(canUseTrustedRequest(request, "short", now)).toBe("invalid");
    expect(canUseTrustedRequest(request, "", now)).toBe("invalid");
    expect(canUseTrustedRequest(request, null, now)).toBe("invalid");
    expect(canUseTrustedRequest(null, "secret-token", now)).toBe("invalid");
  });
  it("is invalid once the request has expired", () => {
    expect(canUseTrustedRequest(request, "secret-token", new Date("2026-10-29T12:00:00Z"))).toBe("invalid");
    expect(canUseTrustedRequest(request, "secret-token", new Date("2026-10-30T12:00:00Z"))).toBe("invalid");
  });
  it("is used when the link was already used", () => {
    expect(canUseTrustedRequest({ ...request, usedAt: new Date("2026-10-23T11:00:00Z") }, "secret-token", now)).toBe("used");
  });
  it("checks the token before the used flag, so a wrong token on a used link tells nothing", () => {
    expect(canUseTrustedRequest({ ...request, usedAt: new Date("2026-10-23T11:00:00Z") }, "wrong-token!", now)).toBe("invalid");
  });
});

describe("PersonForm", () => {
  it("trims the name and relationship and accepts a PayPal email", () => {
    expect(PersonForm.parse({ name: "  Ben ", relationship: " neighbor ", paypalEmail: "ben@example.com" })).toEqual({ name: "Ben", relationship: "neighbor", paypalEmail: "ben@example.com" });
  });
  it("makes the relationship optional", () => {
    expect(PersonForm.safeParse({ name: "Ben", paypalEmail: "ben@example.com" }).success).toBe(true);
    expect(PersonForm.safeParse({ name: "Ben", relationship: "", paypalEmail: "ben@example.com" }).success).toBe(true);
  });
  it("rejects an empty or very long name, a long relationship, and a bad email", () => {
    expect(PersonForm.safeParse({ name: "   ", paypalEmail: "ben@example.com" }).success).toBe(false);
    expect(PersonForm.safeParse({ name: "B".repeat(41), paypalEmail: "ben@example.com" }).success).toBe(false);
    expect(PersonForm.safeParse({ name: "Ben", relationship: "r".repeat(31), paypalEmail: "ben@example.com" }).success).toBe(false);
    expect(PersonForm.safeParse({ name: "Ben", paypalEmail: "not-an-email" }).success).toBe(false);
    expect(PersonForm.safeParse({ name: "Ben" }).success).toBe(false);
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

  it("drafts when Rose says the relationship and the name together", async () => {
    const { deps, drafts, emails, requests } = setup();
    const out = await draftGift(deps, household, "s1", { recipientName: "my grandson Sam", amountCents: 2000, note: null });
    expect(out.kind).toBe("draft");
    expect(drafts[0].payee.trustedPersonId).toBe("t1");
    expect(emails).toHaveLength(0);
    expect(requests).toHaveLength(0);
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

  it("a person added from a request is matched by the phrase Rose used", async () => {
    const { deps, requests, emails } = setup({ said: ["send money to my nephew"] });
    expect(await draftGift(deps, household, "s1", { recipientName: "my nephew", amountCents: 2000, note: null })).toMatchObject({ kind: "not_trusted", emailed: true });
    expect(requests[0].name).toBe("nephew");
    expect(emails[0].subject).toBe("Rose wants to send money to nephew");
    // Anna adds the person under the name the request carried.
    const added: TrustedPerson = { id: "t9", householdId: "h1", name: requests[0].name, relationship: null, paypalEmail: "nephew@example.com" };
    expect(matchTrusted([sam, ben, added], "my nephew")).toEqual([added]);

    const cased = setup();
    await draftGift(cased.deps, household, "s1", { recipientName: "  My Nephew Tom ", amountCents: 2000, note: null });
    expect(cased.requests[0].name).toBe("Nephew Tom");
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
    // The rules stopped it, not Rose: she never confirmed anything.
    expect(transitions.map((t) => t.actor)).toEqual(["rules", "rules"]);
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

describe("isWaitingGift", () => {
  const approved = { kind: "gift", status: "AWAITING_PAYMENT", payerRole: "senior", route: "caregiver" } as const;
  it("is true only for a gift Anna approved that Rose has yet to send", () => {
    expect(isWaitingGift(approved)).toBe(true);
    for (const change of [{ route: "self_pay" }, { route: null }, { kind: "purchase" }, { payerRole: "caregiver" }, { payerRole: null }, { status: "PAID" }, { status: "AWAITING_CAREGIVER" }] as const) {
      expect(isWaitingGift({ ...approved, ...change } as Pick<Order, "kind" | "status" | "payerRole" | "route">)).toBe(false);
    }
  });
});

describe("payGift", () => {
  function paySetup(over: { order?: Partial<Order> | null; trusted?: boolean; paypalFails?: boolean; saveFails?: boolean; paypalOrderId?: string } = {}) {
    const order = {
      id: "o1", userId: "rose", kind: "gift", status: "AWAITING_PAYMENT", payerRole: "senior", route: "caregiver", paypalOrderId: null, totalCents: 3000, merchant: "Sam",
      payee: { trustedPersonId: "t1", name: "Sam", relationship: "grandson", paypalEmail: "sam@example.com" },
      product: { productId: "gift:t1", title: "Gift to Sam", priceCents: 3000, merchant: "Sam" },
      ...over.order,
    } as Order;
    const calls: {
      paypal: CreatePayPalOrderInput[];
      trusted: [string, string][];
      saved: [string, string, string][];
      transitions: { id: string; to: string; actor: string; patch?: OrderPatch }[];
    } = { paypal: [], trusted: [], saved: [], transitions: [] };
    const deps: PayGiftDeps = {
      getOrder: async (id) => (over.order === null || id !== "o1" ? null : order),
      isTrusted: async (householdId, trustedPersonId) => {
        calls.trusted.push([householdId, trustedPersonId]);
        return over.trusted ?? true;
      },
      createPayPalOrder: async (input) => {
        calls.paypal.push(input);
        if (over.paypalFails) throw new Error("down");
        const id = over.paypalOrderId ?? "PP1";
        return { paypalOrderId: id, approveUrl: `https://paypal.test/approve/${id}` };
      },
      setPaypalOrderId: async (id, paypalOrderId, payerRole) => {
        calls.saved.push([id, paypalOrderId, payerRole]);
        return !over.saveFails;
      },
      transitionOrder: async (id, to, actor, patch) => {
        calls.transitions.push({ id, to, actor, patch });
        return { result: "applied", order: { ...order, status: to } };
      },
      appUrl: "https://app.test",
    };
    return { deps, calls };
  }

  it("creates the PayPal order for an approved gift", async () => {
    const { deps, calls } = paySetup();
    expect(await payGift(deps, household, "o1")).toEqual({ ok: true, approveUrl: "https://paypal.test/approve/PP1" });
    expect(calls.paypal).toEqual([
      {
        kind: "gift",
        orderId: "o1",
        title: "Gift to Sam",
        amountCents: 3000,
        payeeEmail: "sam@example.com",
        senderName: "Rose",
        returnUrl: "https://app.test/api/paypal/return",
        cancelUrl: "https://app.test/api/paypal/cancel",
        requestId: "create-o1-senior-gift",
      },
    ]);
    expect(calls.trusted).toEqual([["h1", "t1"]]);
    expect(calls.saved).toEqual([["o1", "PP1", "senior"]]);
  });

  it("refuses a gift when the person was removed, and cancels it so it stops waiting", async () => {
    const { deps, calls } = paySetup({ trusted: false });
    expect(await payGift(deps, household, "o1")).toEqual({ ok: false, code: "not_trusted" });
    expect(calls.paypal).toHaveLength(0);
    expect(calls.saved).toHaveLength(0);
    expect(calls.transitions).toEqual([{ id: "o1", to: "CANCELLED", actor: "system", patch: { declineReason: "not_trusted" } }]);
  });

  it("refuses other households' orders, purchases, and gifts not waiting for Rose", async () => {
    const other = paySetup({ order: { userId: "someone-else" } });
    expect(await payGift(other.deps, household, "o1")).toEqual({ ok: false, code: "not_found" });
    expect(await payGift(paySetup({ order: null }).deps, household, "o1")).toEqual({ ok: false, code: "not_found" });
    const purchase = paySetup({ order: { kind: "purchase", payee: null, payerRole: "senior" } });
    expect(await payGift(purchase.deps, household, "o1")).toEqual({ ok: false, code: "not_found" });
    for (const order of [{ status: "AWAITING_CAREGIVER" }, { status: "PAID" }, { status: "DECLINED" }, { payerRole: "caregiver" }] as Partial<Order>[]) {
      const waiting = paySetup({ order });
      expect(await payGift(waiting.deps, household, "o1")).toEqual({ ok: false, code: "not_waiting" });
      expect(waiting.calls.paypal).toHaveLength(0);
    }
    for (const s of [other, purchase]) expect(s.calls.paypal).toHaveLength(0);
  });

  it("refuses a self-pay gift that already has its own PayPal order", async () => {
    const { deps, calls } = paySetup({ order: { route: "self_pay", paypalOrderId: "PP-OWN" } });
    expect(await payGift(deps, household, "o1")).toEqual({ ok: false, code: "not_waiting" });
    expect(calls.paypal).toHaveLength(0);
    expect(calls.saved).toHaveLength(0);
  });

  it("never pays a gift with no trusted person or PayPal email", async () => {
    const samPayee = { trustedPersonId: "t1", name: "Sam", relationship: "grandson", paypalEmail: "sam@example.com" };
    for (const payee of [null, { ...samPayee, trustedPersonId: null }, { ...samPayee, paypalEmail: null }]) {
      const { deps, calls } = paySetup({ order: { payee } });
      expect(await payGift(deps, household, "o1")).toEqual({ ok: false, code: "not_found" });
      expect(calls.paypal).toHaveLength(0);
    }
  });

  it("asking twice reuses the same PayPal request id", async () => {
    const { deps, calls } = paySetup();
    await payGift(deps, household, "o1");
    await payGift(deps, household, "o1");
    expect(calls.paypal.map((p) => p.requestId)).toEqual(["create-o1-senior-gift", "create-o1-senior-gift"]);
  });

  it("does not rewrite the PayPal id when PayPal returns the order it already has", async () => {
    const { deps, calls } = paySetup({ order: { paypalOrderId: "PP1" } });
    expect((await payGift(deps, household, "o1")).ok).toBe(true);
    expect(calls.saved).toEqual([]);
  });

  it("never swaps in a new PayPal order once one exists", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { deps, calls } = paySetup({ order: { paypalOrderId: "PP-OLD" }, paypalOrderId: "PP-NEW" });
      expect(await payGift(deps, household, "o1")).toEqual({ ok: false, code: "request_changed" });
      expect(calls.saved).toEqual([]);
      expect(calls.transitions).toEqual([]);
      expect(String(logged.mock.calls[0])).toContain("PP-OLD");
      expect(String(logged.mock.calls[0])).toContain("PP-NEW");
    } finally {
      logged.mockRestore();
    }
  });

  it("fails instead of sending Rose to a PayPal order the app can't find", async () => {
    const { deps } = paySetup({ saveFails: true });
    expect(await payGift(deps, household, "o1")).toEqual({ ok: false, code: "request_changed" });
  });

  it("leaves the gift waiting when PayPal is down", async () => {
    const { deps, calls } = paySetup({ paypalFails: true });
    expect(await payGift(deps, household, "o1")).toEqual({ ok: false, code: "paypal_down" });
    expect(calls.saved).toEqual([]);
  });
});
