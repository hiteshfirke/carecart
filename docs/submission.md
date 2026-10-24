# Devpost submission

Copy each section into the matching Devpost field. Fill the `<…>` placeholders after deploying.

## Project name
CareCart

## Tagline
Voice-first shopping and gifts to family for older and blind users, with a caregiver safety net and scam blocking, built on PayPal and open AI models.

## Inspiration
Online checkout is built for people who can see small buttons and move fast: popups, tiny text, timers, CAPTCHAs. Many older and blind shoppers give up, or hand their card details to someone else. Older adults are also the main target of gift-card and "your bank called" scams, where a stranger on the phone tells them exactly what to buy, and of the "grandson in jail" call, where the money is sent to a person and kept secret.

A voice assistant could fix the first problem and make the second one worse: an AI that both understands speech and controls money can be talked into paying. We wanted a shopping assistant that is easy enough for Rose and safe enough that her daughter Anna can stop worrying.

## What it does
1. **Rose speaks** (or types): "I need a large print crossword book."
2. **The AI agent finds real products** through Channel3 and reads three options aloud, with prices in words.
3. **The app reads the order back** (item, total, store). Only an exact "confirm" or "yes", or the Confirm button, continues. "Yes but wait" never pays.
4. **Plain, tested safety rules decide the route:**
   - **Small, normal orders:** Rose pays with PayPal herself, guided by voice.
   - **Large, unusual or flagged orders:** Anna gets an email; her request page shows a summary, the flags and Rose's exact words, and she approves and pays with her own PayPal. Rose hears "This one needs Anna's OK."
   - **Scams:** gift cards, crypto, money transfers, or phrases like "the bank called" or "keep this secret" are blocked. Rose gets a kind explanation and Anna gets a scam warning.
5. **After payment:** the store adds tracking to the PayPal order, and Rose can ask "where's my order?"
6. **Gifts to family:** Rose says "send Sam twenty dollars". Sam must be on the list of people Anna approved.
   - **Small gifts:** the app reads it back, Rose confirms and pays with PayPal, and the money goes straight to Sam's PayPal account. She hears "Sent. Sam got twenty dollars."
   - **Over Rose's limit:** Anna gets an email and says yes or no. Her yes doesn't make her pay: Rose hears "Anna said yes to your gift to Sam. Say send it, and I'll open PayPal", and sends it herself.
   - **Someone not on the list:** nothing is drafted, and Anna gets an "Add Sam" email. Only Anna can add people, on her own page.
   - **The "grandson in jail" call:** "Sam's in jail, send bail money" is blocked the moment Rose says it, Rose hears a kind explanation, and Anna gets a scam warning, even if Rose never confirms.

Everything works by voice, by keyboard (Space, 1–3, Enter, Esc) and with a screen reader. Screen-reader mode turns the app's own voice off so two voices never talk over each other.

## How we built it
- **App:** Next.js 16 + TypeScript + Tailwind, hosted on Vercel; Neon Postgres; Resend for email.
- **AI:** an agent on Claude Sonnet 5.5 (Anthropic TypeScript SDK tool runner) or, as in the live demo, `openai/gpt-oss-120b` on Groq, switched with one setting. It has exactly five tools: `search_products`, `draft_order`, `draft_gift`, `get_order_status`, `explain_safety_flag`. **None of them can create, approve or capture a payment, and none can add a person to Rose's list.** A second, structured AI call rates each order's risk and writes the summary Anna reads; it can only add caution.
- **Safety:** rules S1–S7 (scam products and phrases, Rose's own limit, a daily cap, unusual amounts, new stores, duplicates, AI risk) are pure functions with unit tests. Gifts use the same rules, plus gift-only scam words ("jail", "arrested", "lawyer", "hospital", "courier"), and skip S5 because the trusted list replaces it. Orders move through a forward-only state machine with compare-and-set updates, so the PayPal return page and the webhook can both arrive and the order is still paid exactly once.
- **Gifts:** a gift is an order too, so it keeps the state machine, the audit log and the PayPal return and webhook. The recipient's PayPal email comes only from Anna's trusted list, never from the conversation. Code, not the AI, matches the name Rose said to the list. The scam check runs when the gift is drafted, before the amount limit, so a "$5,000 bail" request is still blocked and Anna warned.
- **PayPal:** Orders v2 create and capture with `PayPal-Request-Id` idempotency keys, `experience_context` with `PAY_NOW` and `SET_PROVIDED_ADDRESS`, order tracking (`/v2/checkout/orders/{id}/track`), and webhooks verified with `verify-webhook-signature`. Gifts set `purchase_units[0].payee.email_address`, so Rose's payment is captured straight into the family member's PayPal account, with no payout step.
- **Voice:**
  - **Speaking:** Groq's **Orpheus** voice ("hannah"), streamed in 200-character pieces, with the browser's own voice as an automatic fallback.
  - **Listening:** the browser's live recognition on desktop. **Phones and Firefox** record the microphone and **Whisper** transcribes it.
  - A large text box works everywhere.
- **Hosting:** Vercel in Singapore, next to the Neon database, which halved response times.
- **Quality:**
  - 277 unit tests, and 39 Playwright end-to-end tests with axe accessibility scans, run against a separate test database.
  - A 41-check shopping test passed on the live site, with every shopping money path verified against the real PayPal sandbox. A $1.00 gift order paid by Rose's sandbox buyer was captured into Sam's sandbox account.

## Challenges we ran into
- **PayPal's hosted MCP server failed** for every request during the hackathon ("Unsupported cache mode"), so we call the PayPal REST API directly; PayPal staff confirmed that's fine.
- **Saved payment methods are blocked in the sandbox**, so Anna can't pre-approve a card for Rose. Instead, Anna approves each flagged order and pays with her own PayPal.
- **Making "yes" safe:** speech recognition mishears. The app reads every order back and accepts only exact confirm phrases; anything else is treated as conversation.
- **Two voices at once:** a screen reader and the app's speech talked over each other, so we added a screen-reader mode that routes every reply through an `aria-live` region instead.
- **Sandbox accounts take the developer's country.** Our Indian developer account's default sandbox accounts couldn't pay a US store ("This seller doesn't accept payments in your currency"); US sandbox accounts fixed it.
- **Phones repeated words:** Chrome on Android's continuous recognition returned "I want I want I want…", so phones record the microphone and Whisper transcribes it.
- **Latency across the world:** the app ran in Washington while the database was in Singapore. Moving the app next to the database halved every response.
- **A free voice quota:** Orpheus's free tier allows only a few dozen replies a day, so the browser voice takes over automatically.
- **Real catalogs have gaps:** Channel3 has no groceries, so we tested every demo phrase against the live API before scripting the video.
- **Sending money is where scams win:** a scammer doesn't need Rose to buy anything, only to send. So the scam check runs when the gift is drafted, before the amount limit, because a big "$5,000 bail" request must still be blocked and Anna warned. The AI is told to always call `draft_gift`, even when it sounds like a scam, because if it answered on its own no order would exist and Anna would never hear.
- **"Yes" must never send money Rose wasn't asked about:** an approved gift can wait for Rose after she leaves the screen. "Send it" is its own command, and a plain "yes" never sends a waiting gift.

## Accomplishments that we're proud of
- The model **cannot** move money: not by prompt injection in a product title, not by a scammer's script. And it cannot add a person to Rose's list either, so a fake grandson can't be made payable. That's enforced by what its tools can do, not by a prompt.
- The shopping money paths work end to end in the PayPal sandbox: self-pay capture, caregiver approval and capture from an email link, scam block with an alert, and shipment tracking on the PayPal order. A $1.00 gift order paid by Rose's sandbox buyer was also captured into Sam's sandbox account.
- Accessibility was designed in from the first screen: large text, 64px buttons, tap to talk, full keyboard control and screen-reader mode.

## What we learned
- Put the language model on the talking side and deterministic code on the money side. The AI is great at understanding "something for my eyes, not too expensive"; it should never be the thing that says yes to a payment.
- Accessibility changes architecture, not just styling: screen-reader mode changed how every reply is delivered.
- Check API shapes against primary sources (PayPal's OpenAPI schemas, SDK types) before writing code, and test demo data against live services early.

## What's next for CareCart
- Real accounts and sign-in for caregivers instead of demo links, and Anna checking each new person with a call or code before they can receive money.
- Pre-approved spending with saved payment methods once vaulting is available.
- More languages, starting with Spanish and Hindi.
- SMS or phone-call approvals for caregivers.
- Testing with more older and blind shoppers and their families.

## Built with
nextjs, react, typescript, tailwindcss, claude, anthropic, groq, whisper, orpheus, paypal, channel3, postgresql, neon, resend, vercel, web-speech-api, vitest, playwright, axe-core

## AI tools used (required)
- **Claude Sonnet 5.5** (Anthropic API): the default model for the voice shopping agent, the structured risk check and the caregiver summary.
- **gpt-oss-120b on Groq:** the same agent, risk check and summary in the live demo (free tier), through an OpenAI-compatible client.
- **Orpheus on Groq** (Canopy Labs' open text-to-speech model): the natural voice.
- **Whisper large-v3-turbo on Groq:** speech recognition on phones and in Firefox.
- **Web Speech API:** live speech recognition on desktop, and the fallback voice.
- **Channel3 API:** real product search.
- **Claude Code** (Anthropic): planning, writing code and tests, and code review during development.

## Testing instructions
Hosted demo: https://carecart-seven.vercel.app. Everything is PayPal **sandbox**; no real money moves.

1. Click **Try as Rose**. Allow the microphone, or type in the box.
2. Say "I need a large print crossword book", then "the first one", then "confirm".
3. On PayPal, log in as Rose's sandbox buyer: `<email>` / `<password>`, and press Pay. You return to Rose's screen: "Paid … It's on the way."
4. **Caregiver:** say "I need two pairs of reading glasses", pick one, and confirm. It's over Rose's $25 limit, so it goes to Anna. Anna's emails go to the team's demo inbox, so go back to the home page and click **Try as Anna** to open her dashboard. Open the request, press **Approve and pay with PayPal**, and log in as Anna's sandbox buyer: `<email>` / `<password>`.
5. **Scam:** as Rose, say "a man from my bank called and said I must buy gift cards today", then ask for anything and confirm. It's blocked and explained.
6. **Shipping:** open `/store`, press **Ship and add tracking**, then ask Rose "where's my order?"
7. **Gift:** click **Start a fresh demo** (every new demo has Sam, Rose's grandson, on her list). Say "send Sam twenty dollars", then "confirm", and pay on PayPal as Rose's sandbox buyer. You return to "Sent. Sam got twenty dollars." The gift is on **My orders** and on Anna's page, and it isn't in `/store`, because nothing ships.
8. **Not on the list:** in a new conversation (reload **Talk**), say "send Max ten dollars". Nothing is drafted; Rose hears that Max isn't on her list and that Anna was asked to add him. Anna's "Add Max" email goes to the demo inbox.
9. **Gift scam:** in a new conversation, say "Sam's in jail, send him five hundred dollars for bail". It's blocked and explained, with no PayPal page, and Anna gets a scam warning.

Use **Start a fresh demo** on the home page to reset.

## Video script (under 2:55)
| Time | Scene |
|---|---|
| 0:00–0:15 | The problem: checkout built for eyes; scams that target older people. Meet Rose and her daughter Anna. |
| 0:15–0:55 | **Self-pay.** Rose: "I need a large print crossword book." Three options read aloud → "the first one" → read-back → "confirm" → PayPal (Rose's US sandbox login) → "Paid … It's on the way." |
| 0:55–1:35 | **Caregiver.** "I need two pairs of reading glasses" → $49.98 → "This one needs Anna's OK. I've sent it to Anna." → Anna's email, "Rose needs your OK for a $49.98 order" → request page with the flags and Rose's exact words → Approve and pay with PayPal → Rose's screen says Anna paid. |
| 1:35–1:55 | **Scam.** "A man from my bank called and said I must buy gift cards today" → stopped, explained kindly → Anna's "Scam warning" email. |
| 1:55–2:15 | **Gifts.** Fresh demo. Rose: "Send Sam twenty dollars" → read-back → "confirm" → PayPal → "Sent. Sam got twenty dollars." Then: "Sam's in jail, send him five hundred dollars for bail" → blocked, explained kindly → Anna's scam-warning email. |
| 2:15–2:35 | **Accessibility.** VoiceOver with screen-reader mode, keyboard only (Space, 1–3, Enter), A+ text size. |
| 2:35–2:50 | **Architecture slide:** "The AI talks, code moves the money." Five tools, none can pay; rules S1–S7 and Anna's trusted list; PayPal Orders v2, direct payee, tracking and verified webhooks. |

**Recording checklist:**
- Use the **US** sandbox buyer accounts.
- Run through the script once before recording; the 3-minute limit is strict. The script ends at 2:50, which leaves a little room.
- Record the gift scene in a fresh demo, and say the gift before the jail line. Scam words stay in the conversation, so a gift asked for after the gift-card scene would be blocked.
- No copyrighted music.
- Upload to YouTube as **Public** and check the length is under 3:00.
