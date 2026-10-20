# Agent latency log (date, model, ms per turn)

| Date | Call | ms | Notes |
|---|---|---|---|
| 2026-10-16 | Channel3 search "green tea", 3 options | 2060 | From India to the US API, via `npm run smoke channel3` |
| 2026-10-18 | Agent turn: "I need a large print crossword book" (Groq `openai/gpt-oss-120b`, search_products + Channel3) | 4500 | `/api/agent`, local dev, India to US APIs |
| 2026-10-18 | Agent turn: "the first one" (draft_order) | 4000 | |
| 2026-10-18 | Agent turn: plain chat, no tool | 1800 | |
| 2026-10-18 | Confirm: AI risk check (Groq) + PayPal create order | 4900 | `/api/orders/[id]/confirm` |
| 2026-10-20 | Region move iad1 → sin1 (next to Neon ap-southeast-1), measured from India on the live site | | |
| 2026-10-20 | Chat-only agent turn, before → after | 2200 → 1100 | Database queries no longer cross the world |
| 2026-10-20 | Orders page warm, before → after | 750 → 230 | |
| 2026-10-20 | Phone transcription (upload + Whisper), before → after | 1150 → 510 | |
| 2026-10-20 | Search turn (Groq + Channel3 from Singapore), live | 2300–3300 | Was 4000–4500 |
