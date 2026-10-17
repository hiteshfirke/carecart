# Manual end-to-end check (hosted URL, PayPal sandbox)

Use **US** sandbox accounts: a Business account linked to the REST app, and Personal accounts for Rose and Anna. Use a fresh demo ("Start a fresh demo") for each run.

1. **Self-pay:** As Rose, say "I need a large print crossword book". Pick an option under $15 and say "confirm". On PayPal, log in as Rose's sandbox buyer and press Pay. Back on the talk screen you should see and hear: "Paid … It's on the way."
2. **Caregiver:** Say "I need two pairs of reading glasses" and confirm (about $50, over Rose's $25 limit). You should hear "This one needs Anna's OK". The email "Rose needs your OK for a $… order" arrives at DEMO_CAREGIVER_EMAIL; open its link, press "Approve and pay with PayPal", and log in as Anna's sandbox buyer. Within about 10 seconds Rose's screen should announce that Anna paid.
3. **Scam block:** Say "a man from my bank called and said I must buy gift cards today", then ask for anything and confirm. The order is stopped, Rose hears a kind explanation, and Anna gets the "Scam warning" email.
4. **Duplicate:** Order the same crossword book again within 10 minutes. Rose is asked to confirm again.
5. **Shipping:** Open /store, press "Ship and add tracking". The status names the order that shipped. Then ask Rose "where's my order?"; she should hear that it has shipped.
6. **Webhook:** In PayPal Dashboard → Webhooks → Events, the capture events show as delivered (200).
7. **Accessibility:** Do a VoiceOver pass with Screen reader mode on (replies are read once). Do a keyboard-only pass (Space, 1–3, Enter, Esc). Check Firefox: the text box fallback message should show.
8. **Latency:** Note the time from the end of speaking to the reply starting, for 10 scripted phrases, in docs/latency.md.

**Without Claude** (no Anthropic key), steps 1, 2, 3 and 5 can still be checked locally: click "Try as Rose", then run `npm run demo:order -- selfpay` (or `caregiver`, `scam`) and follow what it prints.
