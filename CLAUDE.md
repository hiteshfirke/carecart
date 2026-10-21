@AGENTS.md

# Working on CareCart

## Communication
- **Always reply in caveman mode at the ultra level** (`/caveman ultra`), in every session, from the first message. Don't drift back to normal prose over long sessions.
- Code, commit messages, PR text, security warnings and step-by-step instructions where order matters stay in normal, clear prose.

## Rules
- Never push, create repos or open PRs: commit locally, tell the user to push, then check the Vercel build.
- Tests must never touch the live database: they use `TEST_DATABASE_URL` (`carecart_test`).
- Project state, lessons and the resume checklist live in the Obsidian hub: `~/Documents/vault/01-Specs-and-PRDs/PRD-CareCart-PayPal-Hackathon.md`.
