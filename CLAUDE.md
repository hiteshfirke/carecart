@AGENTS.md

## What
Voice-first shopping + send-money-to-family for elderly/blind (Rose) + caregiver (Anna). PayPal sandbox. Next.js 16, Neon, Groq/Claude. AI talks, code moves money: 5 tools, none pay. PayPal AI Hackathon, due Nov 11. Live: carecart-seven.vercel.app.

## Status
2026-10-24.
- Done: shopping (live). Send-money feature (trusted list, gift read-back, Anna OK, Rose sends, scam block at draft, direct payee), on branch `feat/send-money`, not merged. Unit 277, e2e 39 green.
- Next: merge + push, `DEMO_FAMILY_EMAIL` on Vercel, live manual checks (`docs/manual-test.md` Part 13), video, Devpost by Nov 11.

# Working on CareCart

## Communication
- **Always reply in caveman mode at the ultra level** (`/caveman ultra`), in every session, from the first message. Don't drift back to normal prose over long sessions.
- Code, commit messages, PR text, security warnings and step-by-step instructions where order matters stay in normal, clear prose.

## Rules
- Never push, create repos or open PRs: commit locally, tell the user to push, then check the Vercel build.
- Tests must never touch the live database: they use `TEST_DATABASE_URL` (`carecart_test`).
- Project state, lessons and the resume checklist live in the Obsidian hub: `~/Documents/vault/01-Specs-and-PRDs/PRD-CareCart-PayPal-Hackathon.md`.
