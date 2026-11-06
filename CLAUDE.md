@AGENTS.md

# webBingoGame - project notes for Claude

## Accounts and deploy
- GitHub: personal account **florin2495** only (repo `florin2495/webBingoGame`, private). Never the work account.
  Local git identity is pinned in `.git/config`.
- Every push to `main` deploys to production on Vercel: https://web-bingo-game.vercel.app
- Ask the user before pushing (= deploying), unless they explicitly say to deploy.
- **Before every push, bump the patch version** in `package.json` (and `npm install --package-lock-only`).
  It is shown in-game next to "Setări". Current: see `package.json`.

## Database (Supabase project `vgpcagpqbeiqplfidmwo`)
There is ONE database, shared by local dev (`.env.local`) and production.
Migrations are run by hand in the Supabase SQL editor - nothing records them in the DB,
so this list is the source of truth. **Update it whenever the user confirms a migration ran.**

| Migration | Applied to the live DB | Notes |
| --- | --- | --- |
| `supabase/schema.sql` (initial) | yes | |
| `supabase/migrations/002_activity_hints.sql` | yes (2026-11-06) | `rooms.last_activity_at`, `players.hints_used` |
| `supabase/migrations/003_five_hints.sql` | yes (2026-11-06, verified) | `hints_used` check 0..5 |

Rules for schema changes:
- New migration = new numbered file in `supabase/migrations/`, additive / backward compatible when possible,
  and the same change folded into `supabase/schema.sql` (used for fresh projects).
- Code that needs a migration must not be pushed until the user has run it. Verify it by effect with the
  service key from `.env.local` (e.g. select the new column, or try a value the new constraint allows).
- Never print or commit the keys in `.env.local`.

## Testing
- `npm test` (Vitest, pure rules in `src/lib/game.ts`), `npx tsc --noEmit`, `npx eslint src`, `npx next build`.
- End-to-end: drive the real API with two or three players (create, join, board, ready, start, call, mark,
  hint, validate, new-round, settings, leave, kick, idle expiry) against `npm run dev` and, after deploy,
  against production. Delete the test rooms afterwards.
