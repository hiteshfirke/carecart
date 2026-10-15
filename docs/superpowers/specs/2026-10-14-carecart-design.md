# CareCart: voice-first shopping with caregiver safety (PayPal AI Hackathon)

> The name "CareCart" is a working name and can be renamed at any time. This file is the design spec. After it's approved, the next step is a detailed implementation plan (writing-plans skill) in the project folder.

## Context
- **The hackathon:** Hitesh entered the PayPal AI Hackathon (https://paypalaihackathon.devpost.com).
  - Submissions close **Nov 12, 2026, 12:00 pm PT**; the target is to submit Nov 11.
  - The rules: build a working app that meaningfully uses PayPal (sandbox) and AI.
  - Judging criteria: tech, design, impact, originality, presentation.
  - Submission: a public open-source repo with a license, a hosted demo or runnable README, and a YouTube video under 3 minutes.
- **What's taken:** research of the web, the Devpost forum and the PayPal Developer Discord (Oct 14) showed the obvious ideas are already being built:
  - escrow / verified-work payments: Stood, Acquit, CollectPilot
  - open-source bounties: MergePay
  - spending controls for AI agents: Bursar
  - community funds: SarafuPay
  - bill splitting: SplitMind
  - dispute agents: several teams
- **The gap:** nobody is building **accessible, voice-first commerce for elderly and blind users with scam protection**.
- **Outcome wanted:** a polished, hosted demo aimed at the Most Impactful, Best Demo and Agentic Commerce prizes, Channel3's sponsor prize, and the overall prizes.

## Product in one line
Rose (elderly, or blind) shops by voice. The AI finds products and reads them out. Our **code** reads the order back, checks it with safety rules, and either lets Rose pay through PayPal or sends it to Anna (her caregiver) to approve and pay. A gift-card scam gets blocked and Anna is alerted.
**Principle: the AI talks; code moves the money. AI can add caution but can never remove it.**

## Decisions (locked)
| Area | Decision |
|---|---|
| Users | Elderly people plus a caregiver come first; blind and low-vision users second. Accessibility is built in from day one |
| Stack | Next.js (App Router) + TypeScript, one app, hosted on **Vercel** (no cold starts) |
| AI | **Claude Sonnet 5.5** (`claude-sonnet-5-5`) via `@anthropic-ai/sdk` with the tool runner (`betaZodTool` + `toolRunner`). Effort `low` to `medium`, tuned for voice speed. Server-side fallback on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Model ID kept in an env var |
| Voice | The browser's free Web Speech API: `SpeechRecognition` for input, `speechSynthesis` for output at a slow default rate |
| Products | **Channel3** product-search API. The seller of record is our sandbox "demo store" business account, and the README says so |
| Payments | PayPal REST called directly (Orders v2, tracking, webhooks). Not the hosted MCP server, which fails every call ("Unsupported cache mode") |
| Caregiver | A caregiver web dashboard plus a **Resend** email with a link. **The caregiver pays with their own PayPal**, because saving a payment method for later is blocked in the sandbox |
| Data | Neon Postgres (free tier, doesn't expire before judging ends Dec 15) |
| Language | English only in v1 |
| Demo access | Preset accounts: "Try as Rose" and "Try as Anna". No sign-up |

## Architecture
**Screens:**
- `/`: home page with the two demo-role buttons.
- `/talk`: Rose's screen. A big mic button (also Space), a large transcript, 3 option cards (also keys 1, 2, 3), a confirm button (also Enter), cancel (also Esc), A+ and A− text size, and a screen-reader-mode toggle.
- `/caregiver`: Anna's dashboard. Pending requests (AI summary, flags, Rose's exact words), **Approve and pay with PayPal** or Decline, limits settings, order history.
- `/caregiver/requests/[id]`: the page the email links to.
- `/orders`: status and tracking.

**Server routes:**
- `POST /api/agent`: runs the Claude tool runner. The AI has **only these tools**:
  - `search_products` (Channel3; returns title, price, merchant, image and id only)
  - `draft_order` (creates a DRAFT order in the database; it never calls PayPal)
  - `get_order_status`
  - `explain_safety_flag`
- `POST /api/orders/[id]/confirm`: called by the app after a clear "confirm" (regex: yes / confirm / pay) or a button press. Runs the safety rules and the AI risk check, then routes the order:
  - self-pay: creates the PayPal order and returns the approval link
  - caregiver: saves the request and sends the email
  - blocked: refuses
- `GET /api/paypal/return` and `/cancel`: collect the payment (`PayPal-Request-Id` for idempotency), or mark the order cancelled.
- `POST /api/paypal/webhook`: verifies the signature (`/v1/notifications/verify-webhook-signature`) and handles `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.DENIED`.
- `POST /api/caregiver/requests/[id]/approve` and `/decline`. Approve creates a PayPal order with Anna as the payer.
- `POST /api/store/orders/[id]/ship`: the demo store adds tracking (`POST /v2/checkout/orders/{id}/track`).

**Code layout:**

| Path | What it holds |
|---|---|
| `lib/safety/rules.ts` | pure functions, plus tests |
| `lib/orders/state.ts` | the order-status state machine, plus tests |
| `lib/paypal/*` | access-token caching, orders, capture, track, webhook verification |
| `lib/channel3.ts` | product search |
| `lib/agent/*` | prompt and tools |
| `lib/email.ts` | email sending |
| `lib/db/*` | database access |
| `hooks/useSpeech.ts` | browser speech in and out |
| `components/*` | UI components |

**Data:**

| Table | Main fields |
|---|---|
| `users` | role (senior or caregiver), name, email, address, caregiver_id, self_pay_limit (default **$25**), daily_cap (default **$60**), screen_reader_mode, speech_rate |
| `messages` | session_id, role, text, at. Kept for summaries and the scam-phrase rule |
| `orders` | user_id, product snapshot (JSON), qty, total, merchant, status, route, flags (JSON), ai_risk (JSON), paypal_order_id, capture_id, payer_role, tracking, timestamps |
| `order_events` | order_id, from, to, actor, at. An audit log of every status change |

## Order status (state machine)
- Main path: `DRAFT → CONFIRMED → (AWAITING_CAREGIVER | AWAITING_PAYMENT) → PAID → SHIPPED`.
- Exits: `DECLINED`, `CANCELLED`, `BLOCKED` (final).
- Statuses only ever move forward. Repeated webhooks or a second visit to the return page do nothing.

## Safety rules (plain code, unit-tested; checked at confirm)
| # | Rule | Result |
|---|---|---|
| S1 | The product is a gift card, prepaid card, crypto or wire/money transfer **or** Rose said a scam phrase in this session (`gift card`, `wire`, `bitcoin`, `IRS`, `bail`, `warrant`, `keep this secret`, `don't tell`, `urgent`, `account suspended/blocked`, `the bank said/called`, `grandson in trouble`) | **BLOCKED** (final). Rose gets a gentle explanation and Anna is alerted by email |
| S2 | total > self_pay_limit | → caregiver |
| S3 | today's paid total + total > daily_cap | → caregiver |
| S4 | at least 3 paid orders exist **and** total > 3 × the median of the last 10 | → caregiver |
| S5 | the merchant has never been paid before **and** total > $15 | → caregiver |
| S6 | the same product was ordered in the last 10 min | ask Rose to confirm again before continuing |
| S7 | the AI risk check (Claude structured output `{risk: low\|medium\|high, reasons[]}` over the transcript and the order) says `high` | → caregiver |

How the results combine: BLOCKED wins over caregiver, which wins over self-pay. The AI's flags are added to the summary Anna sees; **they can't downgrade a rule result.**

## Money flows
**Self-pay** (all rules pass):
1. `POST /v2/checkout/orders` with intent `CAPTURE`, payee = the demo store, items and Rose's address, and `experience_context` set to `{user_action: PAY_NOW, shipping_preference: SET_PROVIDED_ADDRESS, return_url, cancel_url}`.
2. The voice guides Rose to the PayPal page.
3. PayPal returns her to the app, and the payment is collected (`POST /v2/checkout/orders/{id}/capture`).
4. The app speaks the result. The webhook confirms it as well.

**Caregiver:**
1. The request is saved, and Claude writes a 2–3 sentence summary for Anna.
2. Resend emails Anna, and Rose hears *"sent to Anna"*.
3. Anna either approves (a PayPal order with Anna as the payer, then collect) or declines (with a reason that is spoken to Rose).
4. If Anna doesn't respond within 24 hours, a reminder email goes out.

**After payment:** the demo store's "Ship" button adds tracking to the PayPal order. *"Where's my order?"* reads the status and tracking.

**Note:** check the exact PayPal endpoint and field names against the current PayPal docs when writing the implementation plan.

## Accessibility (target: WCAG 2.2 AA)
**Elderly:**
- 22–24px base text with A+ and A−, high contrast, buttons at least 64px.
- One main action per screen, no time limits, tap-to-talk (not hold).
- Voice commands that always work: repeat / slower / cancel / help / go back.
- Amounts spoken as words, and every payment read back.

**Blind:**
- Semantic landmarks and headings, labels on every control.
- `aria-live` replies, and focus moves to new content.
- Full keyboard control: Space, 1–3, Enter, Esc.
- **Screen-reader mode:** the app's voice turns off and replies go to the screen reader only.
- Alt text on images; follows reduced-motion, contrast and dark-mode settings.

**Fallbacks:** if the browser has no speech recognition (Firefox) or the mic is denied, a large text input appears.

## Error handling
| Problem | What happens |
|---|---|
| Claude errors, times out or declines | Spoken retry prompt, one retry; refusal handled via `stop_reason` and the fallback |
| Channel3 slower than 5 s or down | Spoken apology; no crash |
| Creating the PayPal order fails | No charge; the order stays DRAFT; plain explanation |
| Rose cancels on the PayPal page | CANCELLED; *"No payment was made."* |
| Capture fails or is denied | Rose and Anna are told |
| Email fails | The request is still on the dashboard |
| Public demo cost | Per-session turn cap (30) and a daily AI-spend cap |

Channel3 product text is untrusted: the tools return only structured fields. All keys stay on the server.

## Build timeline
| When | Work | Done when |
|---|---|---|
| Oct 14–16, setup and quick tests | PayPal developer account (**first**: there's a known India phone problem; fallback is a teammate's account, which staff approved), sandbox accounts (demo store, Rose, Anna), Channel3 key, Anthropic key, Neon, Resend, Vercel, public GitHub repo with MIT license. Quick tests of Channel3 search, PayPal create→approve→capture, and Web Speech | All three work |
| Week 1, Oct 16–22: voice loop | `/talk`, `useSpeech`, the agent with search and draft, read-back and confirm, measure Sonnet's speed | "I need green tea" → 3 options spoken → pick → read-back |
| Week 2, Oct 23–29: money | Safety rules and state machine with tests, self-pay flow, caregiver flow and email, webhook, tracking and status | Both payment paths complete in the sandbox; the scam scenario is blocked |
| Week 3, Oct 30–Nov 5: quality | Screen-reader mode, keyboard, axe, error cases, rate limits, polish, test with a real elderly user | Accessibility checks pass; VoiceOver walkthrough OK |
| Week 4, Nov 6–11: ship | README (setup, test logins, architecture, the "AI talks, code pays" rule), deploy, video, Devpost text | Submitted by Nov 11 |

**Not in v1:** other languages, refunds (sandbox refunds return error 500, per Discord), saved payment methods (blocked in the sandbox), SMS.

## Verification
- **Unit tests (Vitest):** `lib/safety/rules.test.ts` covers each rule S1–S7, how results combine, and the edge cases (no history, exactly at the limit). `lib/orders/state.test.ts` covers that statuses only move forward and that repeats are harmless. Command: `npx vitest run`.
- **End-to-end tests (Playwright):**
  - the self-pay order, with a scripted sandbox PayPal approval
  - the caregiver approval
  - the gift-card scam being blocked
  - an `@axe-core/playwright` scan of `/talk` and `/caregiver`

  Command: `npx playwright test`.
- **Manual checks:** a 10-phrase voice script each week (speed and accuracy), a VoiceOver pass, a keyboard-only pass, and a run-through on the hosted Vercel URL before recording.
- **Submission check:** the Devpost checklist. Repo is public with the license visible, README has test logins and no secrets, the video is under 3 minutes and public on YouTube, and the AI tools are described.

## Open items (resolve in the implementation plan, not blockers)
- Channel3: API access and key, free limits, response fields. Ask in the Discord channel #channel3.
- Exact PayPal Orders v2 tracking-endpoint fields: check against the current docs.
- The project folder location on disk (proposed: `~/Documents/carecart`).

## Appendix: competitor table (Discord + Devpost forum, read 2026-10-14)
| Space | Teams already on it |
|---|---|
| Escrow / verified-work payments | Stood (v0.10, live), Acquit, CollectPilot, ShortWork |
| Open-source bounties | MergePay (live) |
| Spending controls for AI agents | Bursar (live), Hugo |
| Community funds / savings groups | SarafuPay, Unitus |
| Shopping agents | LXNORO (Channel3), PatronAI, Ansh |
| Dispute agents | Jonasoforo, SushantPatil, Hugo, Avi Singh, Volvik |
| Invoicing | CollectPilot, Kannan, Volvik |
| Bill split | SplitMind |
| Vendor-bill (accounts payable) agent | panther3523 |

**Staff signals:**
- Calling the REST API directly is OK.
- A hosted demo is preferred.
- An escrow concept is fine in the sandbox.
- Using a friend's developer account is OK.
- Legacy-migration tools were discouraged.
