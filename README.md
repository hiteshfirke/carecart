# CareCart

**Pay for what you asked for, safely: voice-first shopping for older and blind shoppers, with a caregiver safety net on PayPal.**

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com).

- Live demo: _add your Vercel URL here_
- Demo video: _add your YouTube link here_

## How it works

1. **Rose speaks**: "I need some reading glasses." (She can also type.)
2. **The AI finds options**: Claude searches real products through Channel3 and reads three of them aloud, with prices in words.
3. **The app reads the order back**: item, total and store. Only an exact "confirm" / "yes" or the Confirm button continues.
4. **Safety rules run**: plain, unit-tested code decides the route.
5. **Payment**:
   - **Small, normal orders:** Rose pays with PayPal herself, with voice guidance.
   - **Large, unusual or flagged orders:** Anna, her caregiver, gets an email, reviews the request and pays with her own PayPal.
   - **Scams:** a gift card or "the bank told me to pay" is blocked, explained kindly, and Anna is alerted.

## Safety design: the AI talks, code moves the money

Claude has exactly four tools: `search_products`, `draft_order`, `get_order_status` and `explain_safety_flag`. **None of them can create, approve, capture or refund a payment.** Confirmation, the safety rules and every PayPal call live in ordinary, tested code.

| # | Rule | Result |
|---|---|---|
| S1 | Gift cards, prepaid cards, crypto or money transfers, or scam phrases ("the bank called", "IRS", "bail", "keep it secret", "grandson in trouble", …) | **Blocked**; Anna is alerted |
| S1 | The word "urgent" | Goes to Anna |
| S2 | Total over Rose's own limit (default $25) | Goes to Anna |
| S3 | Today's total would pass the daily cap (default $60) | Goes to Anna |
| S4 | More than 3× Rose's usual order (needs ≥ 3 past orders) | Goes to Anna |
| S5 | A store Rose hasn't used, over $15 | Goes to Anna |
| S6 | The same item ordered within 10 minutes | Rose is asked to confirm again |
| S7 | The AI risk check rates it high | Goes to Anna |

**The AI can only add caution, never remove it.** If the AI risk check fails, the rules alone decide.

## PayPal usage

- **Orders v2:** orders are created with `payment_source.paypal.experience_context` (`PAY_NOW`, `SET_PROVIDED_ADDRESS`) and captured on return. Every create and capture sends a `PayPal-Request-Id`, so a retried request never charges twice.
- **Order tracking:** `POST /v2/checkout/orders/{id}/track` adds the shipment to the PayPal order, which protects the seller in disputes.
- **Webhooks:** `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.DENIED`, verified with `/v1/notifications/verify-webhook-signature`. The raw event bytes are passed to verification unchanged.
- Order statuses only move forward. The webhook and the return page can both arrive, and the order is still marked paid exactly once.

The PayPal REST API is called directly. The hosted sandbox MCP server was failing for every hackathon participant at build time, and PayPal staff confirmed that direct REST calls are fine.

## AI tools used

- **Claude Sonnet 5.5** (Anthropic API, TypeScript SDK tool runner): the voice conversation agent, the structured risk check, and the summary sent to the caregiver.
- **Web Speech API** (built into the browser): speech recognition and speech output.
- **Channel3 API:** real product search.

## Accessibility

The target is WCAG 2.2 AA.
- Large text with A+ / A− controls, high contrast, buttons at least 64px tall, and a visible focus outline.
- Tap to talk (no holding a button down). Voice commands that always work: "repeat", "slower", "cancel", "help", "go back".
- **Keyboard:** Space = talk, 1–3 = pick an option, Enter = confirm, Esc = cancel.
- **Screen-reader mode:** the app's own voice turns off and replies are announced through an `aria-live` region, so two voices never talk over each other.
- Browsers without speech recognition get a large text box.
- axe-core checks run in the Playwright tests.

## Run locally

```bash
cp .env.example .env.local   # fill in every value
npm install
npm run db:migrate
npm run dev
```

**Tests:**

```bash
npm test          # unit tests (the database integration suite runs when DATABASE_URL is set)
npm run e2e       # Playwright + axe (needs DATABASE_URL)
```

## Testing the hosted demo

Open the demo and click **Try as Rose**. To pay, log in with the PayPal **sandbox** buyer accounts listed in the Devpost "Testing instructions" field. They are sandbox-only accounts; no real money moves.

## Limitations

- PayPal **sandbox only**.
- The demo store is the seller of record for Channel3 products.
- Emails go only to the configured `DEMO_CAREGIVER_EMAIL` (Resend's test sender).
- Demo households are reached by link and cookie, with no login. Anyone with a caregiver request link can act on it.
- English only.

## License

MIT
