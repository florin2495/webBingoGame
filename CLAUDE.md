@AGENTS.md

# webBingoGame - project notes for Claude

## Accounts and deploy
- GitHub: personal account **florin2495** only (repo `florin2495/webBingoGame`, private). Never the work account.
  Local git identity is pinned in `.git/config`.
- Every push to `main` deploys to production on Vercel: https://web-bingo-game.vercel.app
- Feedback (`POST /api/feedback`) writes to `hub_feedback` (owned by florin2495/hailataticu-hub, slug `bingo`); this game must not be deployed before that table exists (it exists: verified 2026-11-09).
- Ask the user before pushing (= deploying), unless they explicitly say to deploy.
- **Before every push, bump the patch version** in `package.json` (and `npm install --package-lock-only`).
  It is shown in-game next to "Setări". Current: see `package.json`.
- Functions run in `fra1` (Frankfurt, `vercel.json` `{ "regions": ["fra1"] }`), next to the Supabase DB. Never remove it: the Vercel default `iad1` (Washington) makes every DB query cross the Atlantic (1-2 s per request instead of ~0.3 s).

## Database (Supabase project `vgpcagpqbeiqplfidmwo`)
There is ONE database, shared by local dev (`.env.local`) and production.
Migrations are run by hand in the Supabase SQL editor - nothing records them in the DB,
so this list is the source of truth. **Update it whenever the user confirms a migration ran.**

| Migration | Applied to the live DB | Notes |
| --- | --- | --- |
| `supabase/schema.sql` (initial) | yes | |
| `supabase/migrations/002_activity_hints.sql` | yes (2026-11-06) | `rooms.last_activity_at`, `players.hints_used` |
| `supabase/migrations/003_five_hints.sql` | yes (2026-11-06, verified) | `hints_used` check 0..5 |
| `supabase/migrations/004_classicbingo_prefix.sql` | yes (2026-11-06, verified) | renames all tables/constraints/indexes to `classicbingo_*`; breaks code < 1.2.3, deploy 1.2.3 right after |
| `supabase/migrations/005_pending_kick.sql` | yes (2026-11-07, verified) | `classicbingo_players.kick_requested_at` (pending kick with 10 s "Ignoră"); run BEFORE deploying the code that reads it - until then every players query (and local dev, same DB) fails |
| `supabase/migrations/006_reconnect.sql` | yes (2026-11-07, verified: service role 200, anon 401) | `classicbingo_players.last_seen_at`, `device_hash` + index (rejoin the same seat). Run BEFORE deploying the code that reads it - `PLAYER_COLUMNS` selects `last_seen_at`, so every players query fails until then |
| `supabase/migrations/007_shows_by_size.sql` | yes (2026-11-08, via `D:\_DEv\ALL_MIGRATIONS.sql`, run before 008 in the same script; not verified separately: a check constraint can't be read without a write) | `hints_used` check 0..25 ("Show" count by size: 5, 8x8 15, 9x9 20, 10x10 25). Run BEFORE deploying: an 8x8+ room hits the old check on its 6th Show |
| `supabase/migrations/008_seats_spectators.sql` | yes (2026-11-08, via `D:\_DEv\ALL_MIGRATIONS.sql`; verified 2026-11-09: `seat` and `classicbingo_spectators` readable with the service role) | `classicbingo_players.seat` (host-chosen order, rotated each round) + `classicbingo_spectators` table. Run BEFORE deploying: `PLAYER_COLUMNS` selects `seat`, so every players query (and local dev, same DB) fails until then |
| hub `hub_leaderboard`, `hub_leaderboard_rounds` | yes (owned by the hub repo, `000_Startup` migration 002; verified 2026-11-09: both tables readable with the service role) | Bingo only writes to them (`src/lib/server/leaderboard.ts`, best effort: if the tables are missing it logs and the game goes on). Do not deploy the reporting code before the hub migration ran |

Rules for schema changes:
- The Supabase project is shared by all hub mini-games: every object of this game is prefixed `classicbingo_`
  (tables, constraints, indexes). Table names live in `T` in `src/lib/server/db.ts`.
- New migration = new numbered file in `supabase/migrations/`, additive / backward compatible when possible,
  and the same change folded into `supabase/schema.sql` (used for fresh projects).
- Code that needs a migration must not be pushed until the user has run it. Verify it by effect with the
  service key from `.env.local` (e.g. select the new column, or try a value the new constraint allows).
- Never print or commit the keys in `.env.local`.

## Rejoin the same seat
- `src/lib/reconnect.ts`: every player or spectator request stamps `last_seen_at` (at most every 10 s, `touchSeen` in
  `requireViewer`, `src/lib/server/room.ts`);
  re-joining with an existing nickname reclaims that seat (same player id, new token) from the same device
  (`device_hash`, from the browser's `bingo:device` id) or once the seat has been unseen for 45 s, also mid-game.
  `/state` exposes only a derived `connected` flag ("deconectat" badge); never select `token_hash`/`device_hash`
  into `PLAYER_COLUMNS`.

## Seats, spectators, leaderboard (feedback 2026-11-08, shared contracts in `D:\_DEv\FEEDBACK_PLAN.md`)
- Play order = `classicbingo_players.seat` (lowest first = first caller). Host reorders in the lobby with `POST /reorder { order }`
  (full permutation, lobby only); `new-round` rotates the seats one step so the starter changes every round.
- Joining a room that is `playing`/`finished` makes you a spectator (`classicbingo_spectators`, max 16, public state only,
  `role: "spectator"` in `/state`, every player route answers 403 via `requireMember`; `requireViewer` lets spectators through for
  `/state`, `/leave`, `/queue`). `POST /queue` toggles "Intră la runda următoare"; `new-round` (or `/queue` while the room is already in
  the lobby) promotes queued spectators in queue order while there are seats (`promoteQueued`: same id and token, so the session stays valid).
  Rejoin works for spectators too (`join` with the same nickname reclaims the spectator row).
- Called numbers can never be un-ticked (`/mark` answers 409 for `marked: false` on a called number; the client ignores the tap).
- "Show" count = `hintsPerRound(size)` in `game.ts` (5; 8x8 15, 9x9 20, 10x10 25).
- `reportRound` (validate win, or last player wins after leaves) writes `hub_leaderboard` (player_key = lowercased nickname).

## Testing (GitHub Actions, manual only)
All checks run in GitHub Actions, never locally unless the user explicitly asks. Every workflow is `workflow_dispatch`
only (no automatic trigger, the user's choice): nothing gates a push, and Vercel deploys `main` regardless.
Start one with `gh workflow run <file> --ref main`, then `gh run watch` (or the Actions tab, "Run workflow").
| Workflow | Runs |
| --- | --- |
| `.github/workflows/check.yml` "Check code" | `npx next typegen` + `npx tsc --noEmit` (typegen first, so route types in `.next/types` are checked), `npx eslint src`, `npx next build`. Every step runs even if an earlier one failed |
| `.github/workflows/unit-tests.yml` "Unit tests" | `npm test` (Vitest: `src/lib/game.test.ts`, `kick.test.ts`, `reconnect.test.ts`; pure logic, no DB) |
| `.github/workflows/e2e.yml` "E2E" | `node scripts/e2e.mjs <base_url>` (input, default production `https://games.hailatat.icu/classicbingo`); one run at a time |
| `.github/workflows/e2e-ui.yml` "E2E UI (Playwright)" | `npx playwright test` (`playwright.config.ts`, tests in `tests/ui/*.e2e.ts`) against `base_url` (`E2E_BASE_URL`, default production), on desktop Chromium and an emulated iPhone 13 (WebKit). Same concurrency group as "E2E". On failure the report (traces, screenshots, videos) is uploaded as the `playwright-report` artifact |

- E2E needs the repo secrets `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (only for the cleanup safety net;
  locally the script falls back to `.env.local`). It checks that the deployed client JS contains the `package.json`
  version of the checked-out ref, so run it on `main` after the Vercel deploy of that version has finished.
- What E2E does: checks page / `_next` assets / version / manifest / icons / `room/XXXXXX` over HTTP and that
  `web-bingo-game.vercel.app/classicbingo` serves the same build, then drives the real API (production DB) with 3 players:
  create (password), join, wrong password, rejoin (saved token, same device, old token dead, mid-game), settings, boards,
  ready, start, spectators (join a running room, 403 on player routes, queue toggle and order, spectator rejoin),
  out-of-turn / illegal calls, private boards and marks, called numbers cannot be un-ticked, hint, kick with "Ignoră", skip,
  full game to a validated win, reveal, new round (seats rotated, queued spectators promoted), host reorder, pending kick
  enforced, leave mid-game (last one wins), lobby kick. Rooms are named `e2e-test-…` and deleted at the end; it never
  calls `/api/feedback`.
- What E2E UI does (`tests/ui/game.e2e.ts`): two browser contexts (= two devices) create a 3x3 room, join by link,
  generate boards, ready, start, and play to a validated win. Every call must appear on the other screen within 5 s
  without a reload (polling is 15 s, so this checks Realtime), marks get `data-state` "mine"/"marked", then the BINGO
  pop-up, revealed cards, new round followed live, both leave. Rooms are `e2e-test-ui-…`; a leftover is deleted with the
  service key from the same repo secrets.
- Playwright files are `*.e2e.ts`, never `*.spec.ts` / `*.test.ts` (Vitest would pick those up).
- The UI tests find elements by `data-testid` (`my-board`, `called-list` items with `data-number`, `turn-badge`,
  `generate-board`, `ready`, `start-game`, `validate`, `new-round`, `revealed-board`, `home-submit`, `join-submit`, `leave`),
  grid cells by `aria-label` "Numărul N" and their `data-state` (`Grid.tsx`). Renaming or removing one breaks `tests/ui`.
