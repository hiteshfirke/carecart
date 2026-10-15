# Devpost submission

## Tagline
Voice-first shopping for older and blind shoppers, with a caregiver safety net built on PayPal.

## Inspiration / problem
Online checkout is built for eyes: popups, tiny buttons, CAPTCHAs. Older adults are also the main target of gift-card and "your bank called" scams.

## What it does
(the 5-step flow, self-pay vs caregiver vs blocked, screen-reader mode)

## How we built it
Next.js + TypeScript on Vercel. Claude Sonnet 5.5 (tool runner) runs the conversation with 4 tools, none of which can pay. Safety rules, the order state machine and all PayPal calls are plain unit-tested code. PayPal: Orders v2 (create/capture with idempotency keys), order tracking, verified webhooks. Channel3 for products. Neon Postgres, Resend.

## Tools used (required)
- Claude Sonnet 5.5 (Anthropic API): conversation agent, structured risk check, caregiver summary
- Web Speech API: speech recognition and synthesis
- Channel3 API: product search
- PayPal REST APIs (sandbox): Orders v2, Tracking, Webhooks

## Testing instructions
Hosted demo: <url>. Click "Try as Rose". PayPal sandbox buyer for Rose: <email>/<password>. Caregiver Anna: <email>/<password>. All sandbox-only.

## Video script (≤ 2:55)
0:00–0:20 Problem: checkout built for eyes; scams target seniors.
0:20–1:05 Rose orders tea by voice → read-back → PayPal → "Paid, it's on the way."
1:05–1:45 $65 monitor → "needs Anna's OK" → Anna's email + phone approve (side by side).
1:45–2:25 Gift-card scam → stopped, explained kindly, Anna alerted.
2:25–2:55 Screen-reader mode + keyboard, architecture slide "AI talks, code pays", who it's for.
No copyrighted music. Upload to YouTube as Public.
