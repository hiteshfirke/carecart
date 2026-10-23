# Send Money to Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rose sends money by voice, only to people Anna has trusted, with the same read-back, rules and caregiver safety net as purchases. Fake-family scams are blocked, and Anna is warned.

**Architecture:**
- A gift is an `orders` row with `kind = 'gift'` and a `payee` snapshot, so it reuses:
  - the state machine
  - PayPal return, capture and webhook
  - status polling and the orders page
- A new `lib/gifts.ts` drafts gifts. It matches the name against the trusted list, checks scam words at draft time, and opens add-requests.
- `confirmOrder`, `approveRequest`, the rules, the views and the emails each learn a gift branch.
- The PayPal order pays the recipient directly through `payee.email_address`. Task 1 checks this works in the sandbox first.

**Tech Stack:** Next.js 16 App Router, TypeScript, Neon Postgres (`@neondatabase/serverless`), zod 4, PayPal Orders v2 REST, Resend, Vitest 4, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-23-send-money-design.md`. Read it first: the "Calls made by Claude" list is part of the agreed design.

## Global Constraints

- **The AI never moves money and never adds trusted people.** The new tool `draft_gift` only drafts. Recipient emails come **only** from `trusted_people`, never from the conversation.
- **Amounts:**
  - integer cents everywhere
  - a gift is 1–50,000 cents (`MAX_GIFT_CENTS = 50_000`, $500)
  - USD only
- **Gifts end at PAID.** Status words say "sent". A gift never ships, never appears in the demo store's "ready to ship" list, and `shipOrder` refuses it.
- **Existing purchase behaviour must not change.** All 174 unit and 25 e2e tests stay green throughout; only fixtures change, to add the new `Order` fields.
- **Tests never touch the live database.**
  - Vitest and Playwright use `TEST_DATABASE_URL`.
  - Migrate the test database with:
    `DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env.local | cut -d= -f2-)" npm run db:migrate`
  - Never print secret values.
- **Schema changes are idempotent** (`create … if not exists`, `alter … add column if not exists`) and additive, so the old code keeps working against the migrated live database.
- **No new npm dependencies.** Accessibility as today: 64px targets, labels, visible focus, axe-clean (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`).
- **Commit locally only. Hitesh does every push.** End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Next.js 16:** read `node_modules/next/dist/docs/` before using an unfamiliar Next API.

## Review Focus

1. **Scam words with an unknown or misheard name** ("my grandson is in jail, send bail", with nobody trusted). Expected: blocked, Anna warned, nothing drafted for payment. Test in Task 4: `blocks scam talk even when the person isn't trusted`.
2. **Anna removes a person between Rose's draft and her payment.** Expected: confirm and `/pay` both refuse with "no longer on the list". Tests in Task 5: `refuses a gift when the person was removed` (confirm and pay).
3. **A gift note containing scam-product words** ("send Sam money for gift cards"). Expected: S1_SCAM_PRODUCT blocks it, because the note is part of the title. Test in Task 3: `a gift titled with gift cards is still blocked`.
4. **Reusing or guessing the add-request link** (second use, expired, or wrong token). Expected: no person is added; a generic message is shown. Tests in Task 7.
5. **Purchases that mention gift-only words** ("I need a hospital bed", "a lawyer's notepad"). Expected: purchases are unaffected; the gift-only phrases apply to gifts only. Test in Task 3: `gift-only scam words don't block purchases`.

---

### Task 1: PayPal gift order and the sandbox go/no-go

**Files:**
- Modify: `lib/paypal.ts` (`CreatePayPalOrderInput`, `buildOrderBody`)
- Test: `lib/paypal.test.ts`
- Create: `scripts/gift-spike.ts`
- Modify: `package.json` (script `gift:spike`), `.env.example` (`DEMO_FAMILY_EMAIL=`)

**Interfaces:**
- Produces:
  ```ts
  export type CreatePurchaseInput = { kind?: "purchase"; orderId: string; title: string; unitCents: number; quantity: number; shipTo: Address; returnUrl: string; cancelUrl: string; requestId: string };
  export type CreateGiftInput = { kind: "gift"; orderId: string; title: string; amountCents: number; payeeEmail: string; senderName: string; returnUrl: string; cancelUrl: string; requestId: string };
  export type CreatePayPalOrderInput = CreatePurchaseInput | CreateGiftInput;
  ```
  `createPayPalOrder(input: CreatePayPalOrderInput)` is unchanged otherwise. Existing callers pass no `kind` and get the purchase body byte-for-byte as today.

- [ ] **Step 1: Write the failing tests** in `lib/paypal.test.ts`

  ```ts
  it("builds a gift order that pays the recipient, with no shipping", () => {
    const body = buildOrderBody({ kind: "gift", orderId: "o9", title: "Gift to Sam", amountCents: 2000, payeeEmail: "sam@example.com", senderName: "Rose", returnUrl: "https://a/r", cancelUrl: "https://a/c", requestId: "x" });
    const unit = body.purchase_units[0];
    expect(unit.payee).toEqual({ email_address: "sam@example.com" });
    expect(unit.amount.value).toBe("20.00");
    expect(unit.items[0].category).toBe("DIGITAL_GOODS");
    expect(unit.description).toBe("Gift from Rose");
    expect("shipping" in unit).toBe(false);
    expect(body.payment_source.paypal.experience_context.shipping_preference).toBe("NO_SHIPPING");
  });
  it("leaves purchase orders unchanged", () => {
    // build a purchase with the existing fixture and assert: no payee, shipping present, SET_PROVIDED_ADDRESS, PHYSICAL_GOODS
  });
  ```

- [ ] **Step 2: Run** `npx vitest run lib/paypal.test.ts`. Expected: the gift test FAILS (type error or no `payee`).

- [ ] **Step 3: Implement the gift branch in `buildOrderBody`.** Make the return type explicit, so `payee` and `shipping` are optional fields. The gift `brand_name` is "CareCart".

- [ ] **Step 4: Run** `npx vitest run lib/paypal.test.ts && npx tsc --noEmit`. Expected: PASS, with no type errors in the existing callers.

- [ ] **Step 5: Write `scripts/gift-spike.ts`**, a manual sandbox check. It touches no database.
  - `npm run gift:spike -- create`:
    - creates a $1.00 gift order paying `process.env.DEMO_FAMILY_EMAIL`, with `returnUrl = cancelUrl = ${APP_URL}/` and requestId `spike-<timestamp>`
    - prints the PayPal order id and the approve URL
    - exits with an error if `DEMO_FAMILY_EMAIL` is empty
  - `npm run gift:spike -- capture <paypalOrderId>`:
    - captures, then prints `orderStatus`, `captureStatus` and the payee email PayPal reports. Add `payee` to the `CaptureResponse` type only if it's needed for this print.
  - `package.json`: `"gift:spike": "tsx --env-file=.env.local scripts/gift-spike.ts"`.

- [ ] **Step 6: Hitesh sets up Sam (human step; Claude never creates accounts or types passwords).**
  1. PayPal developer dashboard → Sandbox accounts → create a **US Personal** account named "Sam".
  2. Put its email in `.env.local` as `DEMO_FAMILY_EMAIL=`.
  3. Claude confirms it's set with the awk set/EMPTY check, never printing it.

- [ ] **Step 7: Run the go/no-go.**
  1. Claude runs `npm run gift:spike -- create`.
  2. Hitesh opens the URL, logs in as the **Rose** sandbox buyer, and pays.
  3. Claude runs `npm run gift:spike -- capture <id>`.
  4. Hitesh logs in to sandbox.paypal.com as **Sam** and checks for +$1.00.
  - **PASS:** `captureStatus` is `COMPLETED`, and Sam received the money.
  - **FAIL** (a 422 like `PAYEE_ACCOUNT_RESTRICTED`, or the capture isn't completed):
    - stop the plan
    - write the Payouts-fallback design note the spec requires
    - get Hitesh's OK before continuing
  - Record the result in the ledger.

- [ ] **Step 8: Commit**
  ```bash
  git add lib/paypal.ts lib/paypal.test.ts scripts/gift-spike.ts package.json .env.example
  git commit -m "feat: PayPal gift orders that pay a family member directly"
  ```

---

### Task 2: Data: gift orders, trusted people, add-requests

**Files:**
- Modify: `db/schema.sql`, `lib/db.ts`, `lib/store.ts` (`shipOrder`), `app/store/page.tsx`
- Test: `lib/db.integration.test.ts`, `lib/store.test.ts`
- Modify: every test fixture that builds an `Order` (let `npx tsc --noEmit` find them all; add `kind: "purchase", payee: null`)

**Interfaces:**
- Consumes: nothing new.
- Produces (in `lib/db.ts`):
  ```ts
  export type OrderKind = "purchase" | "gift";
  export type Payee = { trustedPersonId: string | null; name: string; relationship: string | null; paypalEmail: string | null };
  // Order gains: kind: OrderKind; payee: Payee | null
  export type TrustedPerson = { id: string; householdId: string; name: string; relationship: string | null; paypalEmail: string };
  export type TrustedRequest = { id: string; householdId: string; name: string; token: string; createdAt: Date; expiresAt: Date; usedAt: Date | null };

  export async function listTrustedPeople(householdId: string): Promise<TrustedPerson[]>;      // ordered by name
  export async function addTrustedPerson(householdId: string, p: { name: string; relationship: string | null; paypalEmail: string }): Promise<TrustedPerson | null>; // null = name already used (case-insensitive)
  export async function removeTrustedPerson(householdId: string, id: string): Promise<boolean>;
  export async function isTrusted(householdId: string, trustedPersonId: string): Promise<boolean>;
  export async function createDraftGift(input: { userId: string; sessionId: string; payee: Payee; amountCents: number; note: string | null }): Promise<Order>;
  export async function openTrustedRequest(householdId: string, name: string, token: string): Promise<{ request: TrustedRequest; created: boolean }>;
  export async function getTrustedRequest(id: string): Promise<TrustedRequest | null>;
  export async function useTrustedRequest(id: string, p: { relationship: string | null; paypalEmail: string }): Promise<TrustedPerson | null>; // null = already used, expired, or name taken
  export async function setPaypalOrderId(id: string, paypalOrderId: string, payerRole: Role): Promise<boolean>; // was caregiver-only; existing caller passes "caregiver"
  ```

- [ ] **Step 1: Append to `db/schema.sql`**

  ```sql
  alter table orders add column if not exists kind text not null default 'purchase' check (kind in ('purchase', 'gift'));
  alter table orders add column if not exists payee jsonb;
  create table if not exists trusted_people (
    id text primary key,
    household_id text not null references households(id) on delete cascade,
    name text not null,
    relationship text,
    paypal_email text not null,
    created_at timestamptz not null default now()
  );
  create unique index if not exists trusted_people_name_idx on trusted_people (household_id, lower(name));
  create table if not exists trusted_requests (
    id text primary key,
    household_id text not null references households(id) on delete cascade,
    name text not null,
    token text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at timestamptz
  );
  ```

  Then migrate the **test** database (command in Global Constraints). Expected: "Applied N statements."

- [ ] **Step 2: Write the failing integration tests** in `lib/db.integration.test.ts` (inside the existing `describe.skipIf`)
  - `it("seeds Sam the grandson as a trusted person")`:
    - `createHousehold(null)` gives `listTrustedPeople` → `[{ name: "Sam", relationship: "grandson", paypalEmail: process.env.DEMO_FAMILY_EMAIL || "sam@example.com" }]`
  - `it("drafts a gift order with a payee snapshot")`:
    - `createDraftGift({ …, amountCents: 2000, note: "birthday" })` gives:
      - `kind: "gift"`, `totalCents: 2000`, `quantity: 1`, `status: "DRAFT"`
      - `product.title: "Gift to Sam (birthday)"`, `product.productId: "gift:<trustedPersonId>"`, `merchant: "Sam"`
      - `payee` equal to the input
  - `it("keeps trusted names unique per household, ignoring case")`: a second `addTrustedPerson` with name "sam" returns `null`. Another household can add "Sam".
  - `it("reuses an open add-request for 24 hours and lets it be used once")`:
    - first `openTrustedRequest(h, "Ben", "T1")` gives `created: true`
    - a second call with "ben" gives `created: false` and the same id
    - `useTrustedRequest(id, …)` returns the person; using it again returns `null`
  - `it("refuses an expired add-request")`: set `expires_at` in the past via SQL in the test; `useTrustedRequest` returns `null`.

- [ ] **Step 3: Run** `npm test -- lib/db.integration.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 4: Implement in `lib/db.ts`:**
  - `toOrder` reads `kind`/`payee`; add `toTrustedPerson`/`toTrustedRequest`.
  - The functions above. `createHousehold` inserts Sam (grandson) with `process.env.DEMO_FAMILY_EMAIL || "sam@example.com"`.
  - Gift product shape: `{ productId: \`gift:${payee.trustedPersonId ?? "unknown"}\`, title: note ? \`Gift to ${name} (${note})\` : \`Gift to ${name}\`, priceCents: amountCents, merchant: name, url: "", imageUrl: null, imageAlt: \`Gift to ${name}\`, rating: null, category: "gift" }`. `note` is trimmed to 60 characters.
  - `openTrustedRequest`: `expires_at = now() + 7 days`. It reuses an unused, unexpired request for the same lower-cased name created less than 24 h ago.
  - `useTrustedRequest`: a single `update … set used_at = now() where id = $1 and used_at is null and expires_at > now() returning *`, then `addTrustedPerson`.
  - `setPaypalOrderId` gains `payerRole` and filters on it; update its caller in `lib/caregiver.ts` and the route deps to pass `"caregiver"`.

- [ ] **Step 5: Exclude gifts from shipping**
  - **Test** in `lib/store.test.ts`: `it("refuses to ship a gift")`. A PAID order with `kind: "gift"` gives `{ ok: false, code: "not_shippable" }`.
  - **Implement:** a guard at the top of `shipOrder`, and in `app/store/page.tsx` filter `paid` to `o.kind === "purchase"`.

- [ ] **Step 6: Fix fixtures and run everything.** Run `npx tsc --noEmit`, add `kind: "purchase", payee: null` to each flagged `Order` fixture, then run `npm test`. Expected: all green, including the new tests.

- [ ] **Step 7: Commit** (`feat: gift orders, trusted people and add-requests in the database`)

---

### Task 3: Rules, views, messages and emails for gifts

**Files:**
- Modify: `lib/safety/rules.ts`, `lib/orders/view.ts`, `lib/speech/messages.ts`, `lib/email.ts`
- Test: `lib/safety/rules.test.ts`, `lib/orders/view.test.ts`, `lib/speech/messages.test.ts` (create if absent), `lib/email.test.ts`

**Interfaces:**
- Consumes: `OrderKind`, `Payee`, `Order.kind/payee`, `TrustedRequest` (Task 2).
- Produces:
  ```ts
  // rules.ts: RuleInput.order gains kind: OrderKind
  export function scamPhraseIn(transcript: string[], kind: OrderKind): boolean;
  export const GIFT_SCAM_MESSAGE = "Something said in this conversation sounds like a common scam, like someone in trouble asking for money in secret.";
  // view.ts
  export function readBack(o: Pick<Order, "product" | "quantity" | "totalCents" | "merchant" | "kind" | "payee">): string;
  export function statusWords(status: OrderStatus, caregiverName: string, kind?: OrderKind): string; // default "purchase"
  // OrderView gains: kind: OrderKind; recipient: string | null
  // messages.ts: ResultOrder gains optional kind?: OrderKind; recipient?: string | null
  // email.ts
  export function addPersonRequestEmail(senior: User, name: string, link: string): { subject: string; html: string };
  ```

- [ ] **Step 1: Write the failing rule tests** in `lib/safety/rules.test.ts`. Use the existing input builder, with `order.kind`:
  - `it("blocks a gift when the conversation mentions jail")` → `["Grandma it's Sam, I'm in jail, I need bail"]` gives `route: "blocked"`, and the flag message equals `GIFT_SCAM_MESSAGE`
  - `it.each(["arrested","lawyer","accident","hospital","new phone number","courier","send it today"])("blocks a gift when they say %s")`
  - `it("gift-only scam words don't block purchases")`: a purchase with "I need a hospital bed" gives no S1 flag
  - `it("skips the new-store rule for gifts")`: a gift of 2000 cents to a merchant not in `paidMerchants` gives no `S5_NEW_MERCHANT`
  - `it("\"Gift to Sam\" is not a scam product")`: no `S1_SCAM_PRODUCT`
  - `it("a gift titled with gift cards is still blocked")`: title "Gift to Sam (gift cards)" gives `S1_SCAM_PRODUCT`
  - `it("over-limit gifts go to the caregiver")`: 3000 cents gives `route: "caregiver"` with `S2_OVER_SELF_PAY_LIMIT`

- [ ] **Step 2: Run** `npx vitest run lib/safety/rules.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement in `rules.ts`.**
  - Add `GIFT_SCAM_PHRASES`: word-boundary regexes for `jail`, `arrested`, `lawyer`, `accident`, `hospital`, `new (phone )?number`, `courier`, `send it today`.
  - `scamPhraseIn` checks `SCAM_PHRASES`, plus `GIFT_SCAM_PHRASES` when the kind is gift.
  - `evaluateRules` uses it, with the S1 message `GIFT_SCAM_MESSAGE` for gifts. Skip S5 for gifts. Every other rule is unchanged.

- [ ] **Step 4: Write the failing view, message and email tests**
  - **`readBack` for a gift** to Sam (grandson), 2000 cents:
    `You're sending twenty dollars to Sam, your grandson, through PayPal. Say "confirm" or press Confirm to continue, or say "cancel".`
    Without a relationship: `…to Sam, through PayPal…`.
  - **`statusWords`:**
    - `("PAID","Anna","gift")` gives `"sent"`
    - `("AWAITING_PAYMENT","Anna","gift")` gives `"approved, waiting for you to send it"`
    - purchase words are unchanged
  - **`toOrderView` of a gift:** `kind: "gift"`, `recipient: "Sam"`, `merchant: "Sam"`, `statusWords` gift-aware. A purchase gives `kind: "purchase"` and `recipient: null`.
  - **`paymentResultMessage`** of a paid gift (`{ title, totalWords: "twenty dollars", status: "PAID", kind: "gift", recipient: "Sam" }`, "paid") gives `"Sent. Sam got twenty dollars."`
  - **Emails:**
    - `requestEmail` subject for a gift: `Rose needs your OK to send $20.00 to Sam`; body contains `asked to send`
    - `scamAlertEmail` subject for a gift: `Scam warning: CareCart stopped money Rose was sending`
    - `addPersonRequestEmail(senior, "Ben", link)`: subject `Rose wants to send money to Ben`; body has an escaped `href` equal to the link and the text `Add Ben`

- [ ] **Step 5: Run the four test files.** Expected: FAIL.

- [ ] **Step 6: Implement.**
  - `toOrderView` passes `o.kind`. `merchant` for a gift is `o.payee?.name ?? o.merchant`, without `merchantName`.
  - `orderBlock` in `email.ts` gets a gift sentence: `Rose asked to send <strong>$20.00</strong> to <strong>Sam</strong> (grandson).`, escaped as today.
  - Update `lib/agent/tools.ts` `runStatus`/`runExplain` to pass `o.kind` to `statusWords`.

- [ ] **Step 7: Run** `npm test && npx tsc --noEmit`. Expected: all green.

- [ ] **Step 8: Commit** (`feat: gift-aware rules, read-back, status words, messages and emails`)

---

### Task 4: Drafting gifts, and the `draft_gift` tool

**Files:**
- Create: `lib/gifts.ts`, `lib/gifts.test.ts`
- Modify: `lib/agent/tools.ts`, `lib/agent/prompt.ts`, `app/api/agent/route.ts`, `scripts/smoke.ts`
- Test: `lib/agent/tools.test.ts` (existing agent tests live under `lib/agent`; add there)

**Interfaces:**
- Consumes: `scamPhraseIn`, `GIFT_SCAM_MESSAGE` (Task 3); db functions and types (Task 2); `caregiverLink`, `newCaregiverToken` (`lib/caregiver.ts`); `scamAlertEmail`, `addPersonRequestEmail`, `SendEmail` (`lib/email.ts`).
- Produces:
  ```ts
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
  export function matchTrusted(people: TrustedPerson[], spoken: string): TrustedPerson[];
  export function trustedRequestLink(appUrl: string, r: Pick<TrustedRequest, "id" | "token">): string; // `${appUrl}/caregiver/people/add?r=<id>&t=<encoded token>`
  export async function draftGift(deps: GiftDeps, household: Household, sessionId: string, input: DraftGiftInput): Promise<DraftGiftResult>;
  // tools.ts: AgentDeps gains draftGift(sessionId: string, input: DraftGiftInput): Promise<DraftGiftResult>
  ```

- [ ] **Step 1: Write the failing tests** in `lib/gifts.test.ts`. Use fakes in the style of `lib/confirm.test.ts`: Sam (grandson) and Ben (neighbor) trusted.
  - **`matchTrusted`:**
    - `"Sam"` → [Sam]
    - `"my grandson"` → [Sam]
    - `"SAM"` → [Sam]
    - `"Tom"` → []
    - two grandsons + `"my grandson"` → both
  - `drafts a gift for a trusted person`: result `draft`; `createDraftGift` called with Sam's payee snapshot and `amountCents: 2000`
  - `asks which person when the name matches several`: result `ambiguous` with both names; nothing drafted
  - `asks Anna to add an unknown person, once`:
    - first call: `not_trusted`, `emailed: true`; one email whose `to` is the caregiver, with subject `Rose wants to send money to Tom`
    - second call (fake returns `created: false`): `emailed: false`, no new email
  - `blocks scam talk before drafting`:
    - utterances `["Sam is in jail and needs bail money, don't tell mum"]` → `blocked`
    - transitions `CONFIRMED` (patch `route: "blocked"`, one S1 flag) then `BLOCKED` (patch with `caregiverToken`)
    - one scam email; never `draft`
  - `blocks scam talk even when the person isn't trusted`: same, with `"Tom"`. The blocked order's payee is `{ trustedPersonId: null, name: "Tom", relationship: null, paypalEmail: null }`; no add-request email.
  - `rejects amounts outside one cent to five hundred dollars`: 0 and 50_001 → `bad_amount`

- [ ] **Step 2: Run** `npx vitest run lib/gifts.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/gifts.ts`.**
  - **`matchTrusted`:** lower-case, strip a leading "my ", trim, then match `name` or `relationship` exactly.
  - **`draftGift`** checks, in this order:
    1. amount
    2. scam words: `scamPhraseIn(await deps.userUtterances(sessionId), "gift")`. The current utterance is already saved by the agent route before the turn.
    3. the match
  - **Blocking** creates the draft with the matched payee, or the null-email payee above; then CONFIRMED, then BLOCKED, then `scamAlertEmail(order, senior, caregiverLink(appUrl, { id, caregiverToken }))`, the same as `confirmOrder`'s blocked branch.

- [ ] **Step 4: Run** `npx vitest run lib/gifts.test.ts`. Expected: PASS.

- [ ] **Step 5: Add the tool.** Write failing tests in `lib/agent/tools.test.ts` for `runDraftGift(deps, ctx, out, { recipient_name, amount_dollars, note? })`:
  - a `draft` result sets `out.draft` to the order and returns a string starting `DRAFT_READY`
  - `not_trusted` → `NOT_TRUSTED` and mentions the caregiver's name
  - `blocked` → `BLOCKED`, and `out.draft` stays null
  - `ambiguous` → `AMBIGUOUS` with the names
  - `bad_amount` → `BAD_AMOUNT`
  - `amount_dollars: 20.005` → `amountCents: 2001` (`Math.round(x * 100)`)
  - `toolSpecs` now has 5 tools, and none is named like pay, send or capture: `expect(names).toEqual(["search_products","draft_order","draft_gift","get_order_status","explain_safety_flag"])`

- [ ] **Step 6: Implement.**
  - **`runDraftGift` and the `draft_gift` spec:**
    - zod: `recipient_name` (1–60 characters), `amount_dollars` (positive, at most 500), `note` (optional, at most 60 characters)
    - description: "Prepare a gift of money to someone on their trusted list. This does NOT send anything; the app reads it back and asks them to confirm."
  - **Tool-result strings**, following the existing `CODE: instruction` style:
    - `NOT_TRUSTED`: say kindly that the person isn't on the list of people they can send money to. Say Anna was asked to add them if `emailed`; otherwise, that Anna can add them on her page. Nothing was sent.
    - `BLOCKED`: say kindly you stopped this because it sounds like a scam: real family doesn't ask for secret or urgent money. Nothing was sent, and Anna has been told.
  - **Prompt (`prompt.ts`).** Add to "What you can do":
    - `draft_gift when they want to send money to someone. Always call it when they ask to send money, even if it sounds like a scam: the app decides, not you. Never ask for or say an email address.`
    - Change the scam bullet so it applies to **buying**; gift requests always go to `draft_gift`.
  - **Route (`app/api/agent/route.ts`).** Build `deps` per request with:
    `draftGift: (sessionId, input) => draftGift({ listTrustedPeople, userUtterances, createDraftGift, transitionOrder, openTrustedRequest, sendEmail, appUrl: appUrl(req), caregiverEmail: household.caregiver.email ?? process.env.DEMO_CAREGIVER_EMAIL ?? null, newToken: newCaregiverToken }, household, sessionId, input)`
    `readBack(result.draft)` already handles gifts (Task 3).
  - **`scripts/smoke.ts`:** the `agent` check passes a `draftGift` fake that throws (shopping must not call it). Add a check `gift`: a turn with `userText: "My grandson Sam is in jail, send him five hundred dollars for bail"` must call `draftGift` once. The fake returns `{ kind: "blocked", order }` with a minimal fake order. It reports PASS or FAIL.

- [ ] **Step 7: Run** `npm test && npx tsc --noEmit && npm run lint`. Expected: green. (Live smoke runs in Task 8.)

- [ ] **Step 8: Commit** (`feat: draft gifts by voice; scam talk blocks at draft time and warns Anna`)

---

### Task 5: Confirming, approving and paying gifts

**Files:**
- Modify: `lib/confirm.ts`, `lib/caregiver.ts`, `app/api/caregiver/requests/[id]/approve/route.ts`, `app/caregiver/requests/[id]/page.tsx`, `lib/errors.ts`
- Create: `lib/gifts.ts` additions (`payGift`), `app/api/orders/[id]/pay/route.ts`
- Test: `lib/confirm.test.ts`, `lib/caregiver.test.ts`, `lib/gifts.test.ts`

**Interfaces:**
- Consumes: `CreateGiftInput` (Task 1), `isTrusted`, `setPaypalOrderId(id, ppId, role)` (Task 2), rules with `kind` (Task 3).
- Produces:
  ```ts
  // confirm.ts: ConfirmDeps gains isTrusted(householdId: string, trustedPersonId: string): Promise<boolean>
  // caregiver.ts: ApproveResult becomes { ok: true; approveUrl: string | null } | { ok: false; code: ErrorCode }  (null = gift approved, Rose pays)
  export type PayGiftDeps = {
    getOrder(id: string): Promise<Order | null>;
    isTrusted(householdId: string, trustedPersonId: string): Promise<boolean>;
    createPayPalOrder(input: CreatePayPalOrderInput): Promise<{ paypalOrderId: string; approveUrl: string }>;
    setPaypalOrderId(id: string, paypalOrderId: string, payerRole: Role): Promise<boolean>;
    appUrl: string;
  };
  export async function payGift(deps: PayGiftDeps, household: Household, orderId: string): Promise<{ ok: true; approveUrl: string } | { ok: false; code: ErrorCode }>;
  // errors.ts gains: not_trusted: "This person is no longer on the list of people Rose can send money to."
  ```

- [ ] **Step 1: Write the failing tests.**
  - **`lib/confirm.test.ts`** (gift fixture: `kind: "gift"`, Sam's payee, product from Task 2's shape):
    - `pays a trusted person directly`: under the limit, `createPayPalOrder` receives `{ kind: "gift", payeeEmail: "sam@example.com", amountCents: 2000, senderName: "Rose", requestId: "create-o1-senior" }`; outcome `pay`
    - `refuses a gift when the person was removed`: `isTrusted` → false gives `{ outcome: "error" }` with a message containing "no longer on your list"; no PayPal call, no transition
    - `sends an over-limit gift to Anna`: 3000 cents gives `caregiver`, and the email subject starts `Rose needs your OK to send`
    - `blocks a gift when scam words were said after the draft`: utterances include "lawyer" → `blocked`
    - `purchases are unchanged`: the existing tests pass with `isTrusted` never called for purchases
  - **`lib/caregiver.test.ts`:**
    - `approving a gift hands it back to Rose`: from AWAITING_CAREGIVER gives `{ ok: true, approveUrl: null }`, one transition to `AWAITING_PAYMENT` with patch `{ payerRole: "senior" }`, and **no** `createPayPalOrder` call
    - `Anna can't resume a gift that's waiting for Rose`: AWAITING_PAYMENT + payerRole senior → `not_waiting`
  - **`lib/gifts.test.ts` `payGift`:**
    - `creates the PayPal order for an approved gift`: AWAITING_PAYMENT, senior, gift → `ok`, PayPal input `kind: "gift"`, requestId `create-<id>-senior-gift`, `setPaypalOrderId(id, "PP1", "senior")`
    - `refuses a gift when the person was removed` → `not_trusted`
    - `refuses other households' orders, purchases, and gifts not waiting for Rose` → `not_found` / `not_found` / `not_waiting`
    - `asking twice reuses the same PayPal request id`: two calls send the same `requestId`

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`confirmOrder`:**
    - for gifts, require a non-null `payee.trustedPersonId` and `paypalEmail`, and `isTrusted`
    - rule input `order.kind`
    - risk input `merchant: \`${payee.name}${payee.relationship ? \` (${payee.relationship})\` : ""}\``
    - self-pay creates the `CreateGiftInput`
  - **`approveRequest`:** the gift branch transitions and returns `approveUrl: null`, with no PayPal call. `resuming` only applies to purchases.
  - **Approve route:**
    - `approveUrl === null` → 303 to `/caregiver/requests/<id>?approved=1` (plus `t` when present)
    - the request page shows `Approved. Rose will hear the news and send it herself.` in a `role="status"`
    - the gift Approve button text is `Approve. Rose will send it herself`

- [ ] **Step 4: Write `app/api/orders/[id]/pay/route.ts`.**
  - Requires the household cookie (401 JSON otherwise).
  - Calls `payGift`.
  - Returns JSON `{ approveUrl }` or `{ error: code }` (status 409 for `not_waiting`/`not_trusted`, 404 for `not_found`, 502 for `paypal_down`).
  - With `?redirect=1`, it redirects instead: 303 to `approveUrl`, or to `/orders?error=<code>`.

- [ ] **Step 5: Run** `npm test && npx tsc --noEmit && npm run lint`. Expected: green.

- [ ] **Step 6: Commit** (`feat: confirm, approve and pay gifts; Anna's OK hands the payment back to Rose`)

---

### Task 6: Talk screen and My orders

**Files:**
- Modify: `lib/speech/commands.ts`, `components/TalkScreen.tsx`, `components/ReadBack.tsx`, `app/talk/page.tsx`, `app/orders/page.tsx`
- Test: `lib/speech/commands.test.ts`, `e2e/talk.spec.ts`

**Interfaces:**
- Consumes: `OrderView.kind/recipient` (Task 3), `POST /api/orders/:id/pay` (Task 5).
- Produces: the `TalkScreen` prop `waitingGift: OrderView | null`. The talk page passes the newest of Rose's gifts in AWAITING_PAYMENT with `payerRole === "senior"` and no PayPal order id. (Use a `toOrderView` field or the raw `Order`, whichever is simpler, as long as `paypalOrderId` isn't sent to the client.)

- [ ] **Step 1: Write the failing command tests.**
  - `it.each(["send it","yes send it","send the money"])` confirm in confirm mode
  - `"send it later"` and `"send it to Tom"` → `say`
  - existing ambiguity tests stay green

- [ ] **Step 2: Implement.** Add those three phrases to `CONFIRM_PHRASES`. Run `npx vitest run lib/speech/commands.test.ts`. Expected: PASS.

- [ ] **Step 3: Write the failing e2e tests** in `e2e/talk.spec.ts`. Use network mocks like the existing ones, with a gift `draft` fixture: `kind: "gift"`, `recipient: "Sam"`, and a `readBack` from Task 3. Wait for the focused heading between steps (see the existing tests).
  - `a gift reads back "To Sam" and pays Sam through PayPal`:
    - the read-back region shows `To Sam`, not `From`
    - "confirm" calls `/confirm` and navigates to the mocked approve URL
  - `Anna's approval of a gift asks Rose to send it`:
    - confirm → `caregiver`; then the polled `/api/orders/<id>` returns AWAITING_PAYMENT with `payerRole: "senior"`, `kind: "gift"`
    - the status region says `Anna said yes to your gift to Sam. Say send it, and I'll open PayPal.`
    - typing "send it" POSTs `/api/orders/<id>/pay`; the mocked `{ approveUrl }` is navigated to
  - `an approved gift waiting on load is announced`: a page with a waiting gift shows the same sentence. Seed the DB with a gift in AWAITING_PAYMENT/senior using Task 2's db functions, as `e2e/caregiver.spec.ts` does.
  - `a paid gift says "Sent. Sam got twenty dollars."` on return from PayPal: mock `/api/orders/<id>` as PAID gift, with `?order=<id>&payment=paid`.

- [ ] **Step 4: Implement.**
  - **`ReadBack`:** for gifts, `To {draft.recipient}` instead of `From {draft.merchant}`.
  - **`TalkScreen`:**
    - state `sendable: OrderView | null`, with phase `"send"` mapped to parse mode `"confirm"`
    - on mount, `waitingGift` sets `sendable` and says the sentence
    - polling sees a gift in AWAITING_PAYMENT with `payerRole "senior"` → the same; purchases keep today's "is paying for it now"
    - in `"send"` phase, the confirm command calls `sendGift()`: POST `/pay`, then the same screen-reader / `window.location.assign` branch as the `pay` outcome; on error, say the fixed message for the code
    - a PAID gift in polling → `Sent. Sam got <totalWords>.`
  - **`app/talk/page.tsx`:** load `waitingGift` server-side with `listOrdersByStatus(senior.id, ["AWAITING_PAYMENT"])`.
  - **`app/orders/page.tsx`:**
    - gifts show `To Sam` and their status words
    - a waiting gift gets `<form method="post" action="/api/orders/<id>/pay?redirect=1"><button className="btn btn-primary">Send it</button></form>` (64px)
    - `?error=` shows `errorMessage` in `role="alert"`

- [ ] **Step 5: Run** `npx playwright test e2e/talk.spec.ts` (no other `next dev` running). Expected: PASS, with all old talk tests still green.

- [ ] **Step 6: Commit** (`feat: talk screen and My orders send approved gifts`)

---

### Task 7: Anna's trusted people and the add-request link

**Files:**
- Modify: `app/caregiver/page.tsx`, `lib/errors.ts`, `lib/gifts.ts` (`canUseTrustedRequest`)
- Create: `app/api/caregiver/people/route.ts` (add), `app/api/caregiver/people/[id]/remove/route.ts`, `app/caregiver/people/add/page.tsx`, `app/api/caregiver/people/requests/route.ts` (use a request)
- Test: `lib/gifts.test.ts`, `e2e/caregiver.spec.ts`

**Interfaces:**
- Consumes: Task 2's trusted-people and request functions; `trustedRequestLink` (Task 4).
- Produces:
  ```ts
  export function canUseTrustedRequest(r: TrustedRequest | null, token: string | null, now: Date): "ok" | "used" | "invalid"; // timing-safe token compare like canActOnRequest; expired → "invalid"
  export const PersonForm = z.object({ name: z.string().trim().min(1).max(40), relationship: z.string().trim().max(30).optional(), paypalEmail: z.email() });
  // errors.ts gains: bad_person, person_exists, link_invalid ("This link has expired."), link_used ("This person has already been added.")
  ```

- [ ] **Step 1: Write the failing unit tests** for `canUseTrustedRequest`:
  - `ok` for a matching token before expiry
  - `invalid` for a wrong token, a missing token, a null request, or after `expiresAt`
  - `used` when `usedAt` is set, checked **after** the token, so a wrong token on a used link is `invalid`

- [ ] **Step 2: Implement it.** Run `npx vitest run lib/gifts.test.ts`. Expected: PASS.

- [ ] **Step 3: Write the failing e2e tests** in `e2e/caregiver.spec.ts` (test database, as today):
  - `Anna adds and removes trusted people, and the page passes axe`:
    - with the household cookie (start through "Try as Rose", then open `/caregiver`), the "People Rose can send money to" section lists Sam
    - adding "Ben", "neighbor", a valid email shows Ben; adding "ben" again shows `That name is already on the list.`
    - removing Ben leaves only Sam
    - axe shows no violations
  - `the add-request link adds one person, once, without Rose's cookie`:
    - seed with `openTrustedRequest(h.id, "Tom", token)`, then open `trustedRequestLink("", request)` in a fresh context
    - the name "Tom" is shown and isn't editable
    - submit an email → `Tom is on Rose's list now.`
    - reopening the link shows `This person has already been added.`
    - the same link with a wrong `t` shows `This link has expired.`
  - `a gift request says Rose will send it herself`:
    - seed a gift in AWAITING_CAREGIVER with a token
    - Approve → `Approved. Rose will hear the news and send it herself.`
    - the DB order is AWAITING_PAYMENT, payerRole senior

- [ ] **Step 4: Implement.**
  - **Section on `/caregiver`:** a list (name, relationship, email); a Remove form per person (POST, 64px button labelled `Remove <name>`); an Add form with labelled inputs.
  - **Routes:** each requires the household cookie (redirect `/` otherwise); validate with `PersonForm`; redirect to `/caregiver?person=added|removed` or `?error=bad_person|person_exists`.
  - **The add page** reads `r` and `t` and uses `canUseTrustedRequest`:
    - on `ok`: a form with the fixed name, a relationship input and an email input, plus hidden `r`/`t`
    - otherwise: the fixed message
  - **The use route:** re-checks with `canUseTrustedRequest`, calls `useTrustedRequest`, then redirects back with `?done=1` or the error code.
  - **Pending list:** gifts read `Send $20.00 to Sam`.

- [ ] **Step 5: Run** `npx playwright test e2e/caregiver.spec.ts && npm test`. Expected: PASS.

- [ ] **Step 6: Commit** (`feat: Anna manages who Rose can send money to`)

---

### Task 8: Docs, live smoke, migration and final verification

**Files:**
- Modify: `README.md`, `docs/walkthrough.md`, `docs/submission.md`, `docs/manual-test.md`, and `CLAUDE.md` (add `## What` / `## Status`, in caveman ultra, per the user's global rule)

- [ ] **Step 1: Update the docs.**
  - **README:**
    - "How it works" gains the gift flow
    - "Safety design" gains the trusted list, the draft-time scam block and "AI can't add people"
    - "PayPal usage" gains `payee.email_address` (paying a family member directly)
  - **`submission.md`:**
    - "What it does" gains the gift flow
    - the video script gains a 20-second gift scene: "send Sam twenty dollars" → Sent; then the "Sam's in jail" call → blocked, Anna's email
  - **`manual-test.md`:** add checks:
    - gift self-pay
    - an over-limit gift via Anna, then "send it"
    - an unknown name → add-request email → Anna adds → Rose sends
    - the jail scam → blocked + email
    - a gift isn't shown in the demo store
  - **`walkthrough.md`:** a short "Gifts" section.

- [ ] **Step 2: Run the full suite.** `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test`. Expected: all green. Report the counts.

- [ ] **Step 3: Run the live smoke checks:** `npm run smoke -- agent` and `npm run smoke -- gift`. Expected: PASS both. Skip `email`/`voice` (inbox noise, Orpheus quota).

- [ ] **Step 4: Migrate the live database** (additive, safe for the running old code): `npm run db:migrate`. Expected: "Applied N statements."
  - Existing households have no Sam. Seed him once for the newest demo households with an inline `tsx` one-off. Don't commit it.
  - Or tell Hitesh to start a fresh demo, which seeds Sam. **Prefer the fresh demo.**

- [ ] **Step 5: Commit** (`docs: gifts in README, walkthrough, Devpost text and manual test`). Tell Hitesh:
  1. add `DEMO_FAMILY_EMAIL` to Vercel (production)
  2. push
  3. Claude checks the build is READY
  4. run the new manual checks on the live site

## Self-review notes
- **Spec coverage:**
  - experience → Tasks 4–6
  - trusted list → Tasks 2 and 7
  - unknown-name request → Tasks 4 and 7
  - limits and Anna's approval, Rose pays → Tasks 5 and 6
  - scam block at draft time → Task 4; at confirm → Tasks 3 and 5
  - PayPal payee and the go/no-go → Task 1
  - store exclusion → Task 2
  - waiting gift after leaving → Task 6
  - narrow add link → Task 7
  - docs and smoke → Task 8
  - The Payouts fallback is out of scope unless Task 1 fails, as the spec says.
- **Type names used across tasks:** `OrderKind`, `Payee`, `TrustedPerson`, `TrustedRequest`, `DraftGiftInput`, `DraftGiftResult`, `CreateGiftInput`, `PayGiftDeps`, `setPaypalOrderId(id, ppId, payerRole)`.
