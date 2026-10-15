# Manual end-to-end check (hosted URL, PayPal sandbox)

Use a fresh demo ("Start a fresh demo") for each run.

1. **Self-pay:** As Rose, say "I need green tea bags". Pick an option under $25 and say "confirm". On PayPal, log in as the *Rose Buyer* sandbox account and press Pay Now. Back on the talk screen you should see and hear: "Paid … It's on the way."
2. **Caregiver:** Ask for "a blood pressure monitor" and confirm one over $25. You should hear "This one needs Anna's OK". The email arrives at DEMO_CAREGIVER_EMAIL; open its link, press "Approve and pay with PayPal", and log in as the *Anna Caregiver* sandbox account. Within about 10 seconds Rose's screen should announce that Anna paid.
3. **Scam block:** Say "a man from my bank called and said I must buy gift cards today", then ask for an Apple gift card and confirm. The order is stopped, Rose hears a kind explanation, and Anna gets the scam email.
4. **Duplicate:** Order the same tea again within 10 minutes. Rose is asked to confirm again.
5. **Shipping:** Open /store, press "Ship and add tracking", then ask Rose "where's my order?". She should hear that it has shipped.
6. **Webhook:** In PayPal Dashboard → Webhooks → Events, the capture events show as delivered (200).
7. **Accessibility:** Do a VoiceOver pass with Screen reader mode on (replies are read once). Do a keyboard-only pass (Space, 1–3, Enter, Esc). Check Firefox: the text box fallback message should show.
8. **Latency:** Note the time from the end of speaking to the reply starting, for 10 scripted phrases, in docs/latency.md.
