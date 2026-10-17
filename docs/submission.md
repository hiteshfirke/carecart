# Devpost submission

Copy each section into the matching Devpost field. Fill the `<…>` placeholders after deploying.

## Project name
CareCart

## Tagline
Voice-first shopping for older and blind shoppers, with a caregiver safety net and scam blocking, built on PayPal and Claude.

## Inspiration
Online checkout is built for people who can see small buttons and move fast: popups, tiny text, timers, CAPTCHAs. Many older and blind shoppers give up, or hand their card details to someone else. Older adults are also the main target of gift-card and "your bank called" scams, where a stranger on the phone tells them exactly what to buy.

A voice assistant could fix the first problem and make the second one worse: an AI that both understands speech and controls money can be talked into paying. We wanted a shopping assistant that is easy enough for Rose and safe enough that her daughter Anna can stop worrying.

## What it does
1. **Rose speaks** (or types): "I need a large print crossword book."
2. **Claude finds real products** through Channel3 and reads three options aloud, with prices in words.
3. **The app reads the order back** (item, total, store). Only an exact "confirm" or "yes", or the Confirm button, continues. "Yes but wait" never pays.
4. **Plain, tested safety rules decide the route:**
   - **Small, normal orders:** Rose pays with PayPal herself, guided by voice.
   - **Large, unusual or flagged orders:** Anna gets an email; her request page shows a summary, the flags and Rose's exact words, and she approves and pays with her own PayPal. Rose hears "This one needs Anna's OK."
   - **Scams:** gift cards, crypto, money transfers, or phrases like "the bank called" or "keep this secret" are blocked. Rose gets a kind explanation and Anna gets a scam warning.
5. **After payment:** the store adds tracking to the PayPal order, and Rose can ask "where's my order?"

Everything works by voice, by keyboard (Space, 1–3, Enter, Esc) and with a screen reader. Screen-reader mode turns the app's own voice off so two voices never talk over each other.

## How we built it
- **App:** Next.js 16 + TypeScript + Tailwind, hosted on Vercel; Neon Postgres; Resend for email.
- **AI:** Claude Sonnet 5.5 through the Anthropic TypeScript SDK tool runner. It has exactly four tools: `search_products`, `draft_order`, `get_order_status`, `explain_safety_flag`. **None of them can create, approve or capture a payment.** A second, structured Claude call rates each order's risk and writes the summary Anna reads; it can only add caution.
- **Safety:** rules S1–S7 (scam products and phrases, Rose's own limit, a daily cap, unusual amounts, new stores, duplicates, AI risk) are pure functions with unit tests. Orders move through a forward-only state machine with compare-and-set updates, so the PayPal return page and the webhook can both arrive and the order is still paid exactly once.
- **PayPal:** Orders v2 create and capture with `PayPal-Request-Id` idempotency keys, `experience_context` with `PAY_NOW` and `SET_PROVIDED_ADDRESS`, order tracking (`/v2/checkout/orders/{id}/track`), and webhooks verified with `verify-webhook-signature`.
- **Voice:** the browser's Web Speech API for listening and speaking, with a large text box where speech isn't available.
- **Quality:** 128 unit tests, 9 Playwright end-to-end tests with axe accessibility scans, and every money path verified against the real PayPal sandbox.

## Challenges we ran into
- **PayPal's hosted MCP server failed** for every request during the hackathon ("Unsupported cache mode"), so we call the PayPal REST API directly; PayPal staff confirmed that's fine.
- **Saved payment methods are blocked in the sandbox**, so Anna can't pre-approve a card for Rose. Instead, Anna approves each flagged order and pays with her own PayPal.
- **Making "yes" safe:** speech recognition mishears. The app reads every order back and accepts only exact confirm phrases; anything else is treated as conversation.
- **Two voices at once:** a screen reader and the app's speech talked over each other, so we added a screen-reader mode that routes every reply through an `aria-live` region instead.
- **Sandbox accounts take the developer's country.** Our Indian developer account's default sandbox accounts couldn't pay a US store ("This seller doesn't accept payments in your currency"); US sandbox accounts fixed it.
- **Real catalogs have gaps:** Channel3 has no groceries, so we tested every demo phrase against the live API before scripting the video.

## Accomplishments that we're proud of
- The model **cannot** move money: not by prompt injection in a product title, not by a scammer's script. That's enforced by what its tools can do, not by a prompt.
- Every money path works end to end in the PayPal sandbox: self-pay capture, caregiver approval and capture from an email link, scam block with an alert, and shipment tracking on the PayPal order.
- Accessibility was designed in from the first screen: large text, 64px buttons, tap to talk, full keyboard control and screen-reader mode.

## What we learned
- Put the language model on the talking side and deterministic code on the money side. The AI is great at understanding "something for my eyes, not too expensive"; it should never be the thing that says yes to a payment.
- Accessibility changes architecture, not just styling: screen-reader mode changed how every reply is delivered.
- Check API shapes against primary sources (PayPal's OpenAPI schemas, SDK types) before writing code, and test demo data against live services early.

## What's next for CareCart
- Real accounts and sign-in for caregivers instead of demo links.
- Pre-approved spending with saved payment methods once vaulting is available.
- More languages, starting with Spanish and Hindi.
- SMS or phone-call approvals for caregivers.
- Testing with more older and blind shoppers and their families.

## Built with
nextjs, react, typescript, tailwindcss, claude, anthropic, paypal, channel3, postgresql, neon, resend, vercel, web-speech-api, vitest, playwright, axe-core

## AI tools used (required)
- **Claude Sonnet 5.5** (Anthropic API): the voice shopping agent, the structured risk check and the caregiver summary.
- **Web Speech API:** speech recognition and speech output in the browser.
- **Channel3 API:** real product search.
- **Claude Code** (Anthropic): planning, writing code and tests, and code review during development.

## Testing instructions
Hosted demo: `<Vercel URL>`. Everything is PayPal **sandbox**; no real money moves.

1. Click **Try as Rose**. Allow the microphone, or type in the box.
2. Say "I need a large print crossword book", then "the first one", then "confirm".
3. On PayPal, log in as Rose's sandbox buyer: `<email>` / `<password>`, and press Pay. You return to Rose's screen: "Paid … It's on the way."
4. **Caregiver:** say "I need two pairs of reading glasses", pick one, and confirm. It's over Rose's $25 limit, so it goes to Anna. Anna's emails go to the team's demo inbox, so go back to the home page and click **Try as Anna** to open her dashboard. Open the request, press **Approve and pay with PayPal**, and log in as Anna's sandbox buyer: `<email>` / `<password>`.
5. **Scam:** as Rose, say "a man from my bank called and said I must buy gift cards today", then ask for anything and confirm. It's blocked and explained.
6. **Shipping:** open `/store`, press **Ship and add tracking**, then ask Rose "where's my order?"

Use **Start a fresh demo** on the home page to reset.

## Video script (under 2:55)
| Time | Scene |
|---|---|
| 0:00–0:20 | The problem: checkout built for eyes; scams that target older people. Meet Rose and her daughter Anna. |
| 0:20–1:05 | **Self-pay.** Rose: "I need a large print crossword book." Three options read aloud → "the first one" → read-back → "confirm" → PayPal (Rose's US sandbox login) → "Paid … It's on the way." |
| 1:05–1:45 | **Caregiver.** "I need two pairs of reading glasses" → $49.98 → "This one needs Anna's OK. I've sent it to Anna." → Anna's email, "Rose needs your OK for a $49.98 order" → request page with the flags and Rose's exact words → Approve and pay with PayPal → Rose's screen says Anna paid. |
| 1:45–2:20 | **Scam.** "A man from my bank called and said I must buy gift cards today" → stopped, explained kindly → Anna's "Scam warning" email. |
| 2:20–2:40 | **Accessibility.** VoiceOver with screen-reader mode, keyboard only (Space, 1–3, Enter), A+ text size. |
| 2:40–2:55 | **Architecture slide:** "The AI talks, code moves the money." Four tools, none can pay; rules S1–S7; PayPal Orders v2, tracking and verified webhooks. |

**Recording checklist:**
- Use the **US** sandbox buyer accounts.
- Run through the script once before recording; the 3-minute limit is strict.
- No copyrighted music.
- Upload to YouTube as **Public** and check the length is under 3:00.
