# CareCart: "Send money to family", protected from scams — design

Date: 2026-10-23. Status: agreed with Hitesh in chat; this doc is the written form.
Builds on: `docs/superpowers/specs/2026-10-14-carecart-design.md` and the code as it is today.

## Why

Older people lose the most money not in shops but by **sending money**: the "grandparent scam", where a caller pretends to be a grandchild in jail or hospital and begs for bail money and secrecy, plus other impersonation scams.

CareCart already protects Rose when she **buys**:
- the AI talks, and code moves the money
- a read-back and exact confirm phrases
- safety rules S1–S7
- Anna as the safety net

This feature puts the same protection on **gifts and money for family**. It also gives the hackathon a second PayPal money movement: a payment whose money goes to another person's PayPal account. And it strengthens our differentiation: about 100 public rival projects exist, and none target seniors, caregivers or voice.

## The experience

1. Rose says "send twenty dollars to Sam for his birthday".
2. The helper finds Sam on Rose's **trusted people** list and reads back:
   > "You're sending twenty dollars to Sam, your grandson, through PayPal. Say confirm or press Confirm to continue, or say cancel."
3. Rose says "confirm". Code runs the safety rules, then sends her to PayPal to approve. She logs in as the Rose sandbox buyer.
4. Back on the talk screen she hears "Sent. Sam got twenty dollars."
5. The gift appears on "My orders" and on Anna's page as **sent**.

**Other cases:**
- **The person isn't on the list.**
  - Rose hears: "Sam isn't on your list of people you can send money to. I've asked Anna to add him."
  - Anna gets an email with an "Add Sam" button. It opens her page with the name filled in; she types Sam's PayPal email and saves.
  - Nothing is drafted; Rose asks again later.
- **Over Rose's own limit, or over the daily cap.**
  - The gift goes to Anna for approval, like a big purchase.
  - **It stays Rose's money.** Approving doesn't make Anna pay: Rose's screen says "Anna said yes. Say send it, and I'll open PayPal", and Rose pays.
- **Scam signs.** Words like "bail", "jail", "arrested", "lawyer", "accident", "hospital", "don't tell", "keep it secret", "new phone number" or "courier" anywhere in the conversation **block** the gift.
  - Rose hears a kind explanation.
  - Anna gets the scam-alert email, the same flow as a blocked purchase.
- **The same gift twice within 10 minutes** (same person) → "You sent Sam money a few minutes ago. Say confirm to send again." (rule S6).

## Goals
- Rose can send money by voice to people Anna has approved, with the same read-back, confirm phrases and rules as purchases.
- Anna manages the trusted list on her page: add (name, relationship, PayPal email) and remove.
- Fake-family scams are blocked, and Anna is warned.
- Works on the hosted demo, in the PayPal sandbox, for a fresh demo household, with no setup by judges.

## Non-goals
- Requesting money, splitting bills, or recurring gifts.
- Receiving money, or the recipient's own experience beyond PayPal's.
- Real identity checks on recipients. Anna vouches for them.
- Currencies other than USD; languages other than English.

## Anti-goals (a failure even if it "works")
- **The AI can send money, or can add a trusted person.** Only Anna adds people, on her page, through code.
- **Rose can send to a name the AI made up**, or to an email that came from the conversation. Recipient emails come **only** from the trusted list.
- A gift flow that breaks or changes the existing shopping flow.
- **Gifts showing up as "ready to ship"** in the demo store.

## Decided (with Hitesh)
- Trusted list managed by Anna; Rose can only send to people on it.
- An unknown name triggers an "I've asked Anna" email with an Add button. Nothing is drafted.
- Gifts over Rose's limit need Anna's OK. **Rose still pays** after Anna approves.
- Gifts count toward the same daily cap as shopping.
- Scam words block the gift and warn Anna.
- A new AI tool only **drafts** a gift; code does the read-back, the rules and the payment.

## Design

### Data
- **New table `trusted_people`:**
  - `id`
  - `household_id`
  - `name`
  - `relationship` (e.g. "grandson", optional)
  - `paypal_email`
  - `created_at`
  - Names are unique per household, case-insensitive.
- **`orders` gains:**
  - `kind text not null default 'purchase'`, either `'purchase'` or `'gift'`
  - `payee jsonb null`: `{ trustedPersonId, name, relationship, paypalEmail }`, copied when the gift is drafted, so editing or removing the person later never changes a gift in flight
- **A gift is an order:**
  - `product` = `{ productId: "gift:<trustedPersonId>", title: "Gift to Sam", priceCents, category: "gift", imageUrl: null, ... }`
  - `quantity` 1
  - `merchant` = the recipient's name

  Reusing `orders` keeps, unchanged:
  - the state machine
  - order events
  - PayPal return, capture and webhook, with the capture idempotency key
  - status polling and the orders page
- **Lifecycle:**
  - A gift ends at **PAID**, with status words "sent". It never ships.
  - Every "ready to ship" list (`app/store/page.tsx`, `lib/store.ts`) must exclude gifts. `shipOrder` refuses them.
- **Demo seeding:** `createHousehold` adds one trusted person, **Sam (grandson)**, with `DEMO_FAMILY_EMAIL`. This is a new env var holding the "Sam" US Personal sandbox account email that Hitesh creates.

### The AI tool
- **New tool `draft_gift`** `{ recipient_name: string, amount_dollars: number, note?: string }`.
- Its description says it does NOT send money, like `draft_order`.
- **Code** matches `recipient_name` against the trusted list:
  - case-insensitive on name, or on relationship ("my grandson" → the one grandson)
  - if several match, it returns `AMBIGUOUS` with the names
- `amount_dollars` is validated: greater than 0, at most **$500**, and rounded to whole cents.
- **No match:**
  - Code records a pending "add request" and emails Anna, at most once per name per household per day.
  - It returns `NOT_TRUSTED`, telling the AI to explain and draft nothing.
- **Match:** it creates a DRAFT gift order and returns `DRAFT_READY`, exactly like `runDraft`.
- `get_order_status` and `explain_safety_flag` cover gifts too: "Gift to Sam: sent".
- **The prompt** says:
  - gifts go only to people on Rose's list
  - the AI must never ask for or repeat email addresses
  - **whenever Rose asks to send money to someone, the AI calls `draft_gift`, even if it sounds like a scam: the app decides, not the AI.** Today's prompt answers scam talk itself; for gifts that would mean no order exists, so Anna would never be warned.
- **Scam check at draft time.** `draft_gift` runs the S1 scam phrases (plus the gift-only ones below) on Rose's words in this session **before** drafting.
  - On a match, code creates the gift order and moves it straight to BLOCKED (DRAFT → CONFIRMED → BLOCKED, actor `rules`), using the same flags and the same scam email to Anna.
  - It returns `BLOCKED`, so the AI explains kindly. No read-back, no confirm.
  - Then a "Sam's in jail, send bail" call warns Anna even if Rose later says "cancel" or hangs up.
  - `confirmOrder` still re-runs all rules at confirm time, for words said after the draft.
  - **Accepted risk:** if the model ignores the prompt and never calls the tool, nothing is drafted and no money moves, but Anna isn't warned. The `smoke agent` check gains a case: "Sam's in jail, send him five hundred dollars for bail" must call `draft_gift`.

### Read-back and confirm
- `readBack` gets a gift variant, e.g. "You're sending twenty dollars to Sam, your grandson, through PayPal. Say "confirm"…". It uses the same `CONFIRM_PHRASES` and Confirm button.
- **`confirmOrder` runs the same rules, with gift-specific input:**
  - **S5 (new merchant) is skipped for gifts.** The trusted list replaces it.
  - **S1_SCAM_PRODUCT** doesn't apply ("Gift to Sam" must not match the gift-card regex; add a test).
  - **New gift-only scam phrases**, added to S1_SCAM_PHRASE when `kind === 'gift'` only, so a shopper buying "a hospital bed" isn't blocked: jail, arrested, lawyer, accident, hospital, new phone number, courier, "send it today".
  - The existing phrases (bail, don't tell, keep it secret, grandson in trouble, gift cards, wire) already apply.
  - S2, S3, S4, S6 and S7 apply as they do today.
  - The AI risk check gets the gift context (recipient name, relationship and amount instead of the product).
- **Self-pay route:**
  - Create a PayPal order paying **the recipient**: `purchase_units[0].payee.email_address = payee.paypalEmail`, with `shipping_preference: "NO_SHIPPING"`, item category `DIGITAL_GOODS`, and a description like "Gift from Rose".
  - Rose approves it; capture works as today.
- **Caregiver route:**
  - AWAITING_CAREGIVER, and Anna gets the request email ("Rose wants to send $40 to Sam").
  - **Anna's Approve** moves it to AWAITING_PAYMENT with `payerRole: 'senior'` and **does not** create a PayPal order for Anna.
  - Rose's screen, through the existing status polling, says "Anna said yes. Say send it, and I'll open PayPal".
  - "send it" or "confirm" calls a new `POST /api/orders/:id/pay`. It creates the PayPal order paying Sam, then redirects Rose to approve.
  - **If Rose has left the talk screen** (reload, closed tab, slow approval):
    - When `/talk` loads, it looks for her gifts in AWAITING_PAYMENT with `payerRole 'senior'` and no PayPal order yet, and announces "Anna said yes to your gift to Sam. Say send it, and I'll open PayPal".
    - "My orders" shows a **Send it** button on such gifts.
    - There is no email to Rose: she's blind, and the talk screen is her place.
  - **`/pay` checks:**
    - the gift is Rose's, `kind 'gift'`, status AWAITING_PAYMENT, `payerRole 'senior'`
    - **the person is still on the trusted list** (if Anna removed Sam after approving, refuse with "Anna took Sam off your list")
  - `/pay` **does not** re-run the cap or the rules: Anna approved this exact amount and person.
  - The gift **doesn't expire**. Rose can cancel it (`seniorCanCancel` already allows her own AWAITING_PAYMENT).
  - Asking twice reuses the existing PayPal order, using the same request-id pattern as the caregiver resume flow.
  - **Decline** works as today.
- **Blocked route:** as today, plus the scam email wording is adapted for money sent to a person.

### How the money moves (gated by a sandbox test, the first build step)
- **Primary:** an Orders v2 payment with `payee.email_address` set to Sam's US Personal sandbox account, approved by Rose and captured by our app.
- **Test:** create, then Hitesh approves as Rose in the browser, then capture. Confirm the money lands in Sam's sandbox account (Hitesh checks Sam's activity), and that the capture webhook arrives.
- **Fallback if PayPal refuses a personal payee** (a 422 such as PAYEE_ACCOUNT_RESTRICTED, or a capture failure):
  1. Rose pays the CareCart demo business account, exactly as for purchases.
  2. After the capture, code sends a **Payouts** API payment of the same amount to Sam's email, with the `sender_batch_id` derived from the order id so it's idempotent.
  3. The README states this honestly: "CareCart forwards the gift".
  4. The payout batch id is stored on the order, and the status reads "sent" only once the payout succeeds.
- The rest of the design is the same either way.
- **Pass/fail for the test:**
  - **Pass** = the money lands in Sam's sandbox account, and capture through our return page marks the gift PAID.
  - The capture webhook arriving is **not** required: the return page already captures, idempotently, and the webhook is the backup.
- **The fallback is designed and built only if the test fails.** Then the open points get a short design note **before** building, because this is the one path where Rose could pay and Sam get nothing:
  - an extra status or field for "paid, payout pending"
  - payout status by polling or a webhook
  - on payout failure: refund Rose, and alert Anna
- The rest of the plan doesn't depend on the outcome.

### Anna's page
- **New "People Rose can send money to" section:**
  - a list with Remove buttons
  - an Add form: name, relationship, PayPal email (validated with zod as an email)
  - full list management (add any name, remove) lives **only** on `/caregiver`, behind the household cookie, as Anna's page is today
- **The add-request email link is narrow on purpose**, because it can register a PayPal email that Rose's money may go to.
  - **New table `trusted_requests`:** `id`, `household_id`, `name`, `token` (random, like the caregiver token), `created_at`, `expires_at` (7 days), `used_at`.
  - The link (`/caregiver/people/add?r=<id>&t=<token>`) works without Rose's cookie, so Anna can use it on her phone.
  - It shows **only** a form to enter the PayPal email for **that one requested name**. The name is fixed, and the relationship is optional.
  - It's **single-use**: saving sets `used_at`, and the link then says "Already added". Expired or wrong tokens show a generic "This link has expired" message.
  - The token is compared with the same timing-safe check as caregiver links.
  - Dedupe: one open request per name per household. A repeat ask within 24 h reuses it and sends no new email.
- Pending gifts appear in the existing pending list, with "send $40 to Sam" wording.
- **Accessibility:** the same rules as the rest of the app — 64px targets, labels, keyboard, axe-clean.

## Constraints
- Same stack and patterns:
  - dependency-injected handlers in `lib/`
  - thin routes
  - Vitest unit tests with fakes
  - Playwright e2e with network mocks against `TEST_DATABASE_URL`
- **Tests never touch the live database.** Schema changes are idempotent `alter table … if not exists`, applied with `npm run db:migrate` to both the test and live databases.
- No new npm dependencies.
- Nothing may change existing purchase behaviour. All 174 unit and 25 e2e tests stay green.
- **Hitesh does all pushes.** Claude commits locally.
- Deadline: target Nov 11 for the whole hackathon submission. This feature should be done by about **Oct 30**, leaving room for returns (feature 2), the AG Grid log (feature 4), the video and Devpost.

## Left to the builder
- Exact file split (e.g. `lib/gifts.ts` vs extending `lib/confirm.ts`), names, and the SQL for the trusted-list matching.
- Exact spoken wording, within the tone of the existing messages.

## Calls made by Claude (not yet confirmed by Hitesh)
- Gifts are stored as orders with `kind 'gift'`.
- A single gift is capped at $500.
- The AI must always call `draft_gift`. Scam words block at draft time and warn Anna, even if Rose never confirms.
- The Payouts fallback is built only if the sandbox test fails, after a short design note.
- An approved gift waiting for Rose is announced when `/talk` loads, and gets a Send it button on My orders. It has no expiry, and `/pay` doesn't re-run the rules.
- The add-request email link is single-use, valid for 7 days, and only for one name. Removing people needs Anna's page.
- How the AI is told about the trusted list: name and relationship only, never emails.
