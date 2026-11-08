@AGENTS.md

# webBingoGame - project notes for Claude

## Accounts and deploy
- GitHub: personal account **florin2495** only (repo `florin2495/webBingoGame`, private). Never the work account.
  Local git identity is pinned in `.git/config`.
- Every push to `main` deploys to production on Vercel: https://web-bingo-game.vercel.app
- Feedback (`POST /api/feedback`) writes to `hub_feedback` (owned by florin2495/hailataticu-hub, slug `bingo`); this game must not be deployed before that table exists.
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
| `supabase/migrations/007_shows_by_size.sql` | **NO - to run** | `hints_used` check 0..25 ("Show" count by size: 5, 8x8 15, 9x9 20, 10x10 25). Run BEFORE deploying: an 8x8+ room hits the old check on its 6th Show |
| `supabase/migrations/008_seats_spectators.sql` | **NO - to run** | `classicbingo_players.seat` (host-chosen order, rotated each round) + `classicbingo_spectators` table. Run BEFORE deploying: `PLAYER_COLUMNS` selects `seat`, so every players query (and local dev, same DB) fails until then |
| hub `hub_leaderboard`, `hub_leaderboard_rounds` | owned by the hub repo (`000_Startup` migration 002) - **to run there** | Bingo only writes to them (`src/lib/server/leaderboard.ts`, best effort: if the tables are missing it logs and the game goes on). Do not deploy the reporting code before the hub migration ran |

Rules for schema changes:
- The Supabase project is shared by all hub mini-games: every object of this game is prefixed `classicbingo_`
  (tables, constraints, indexes). Table names live in `T` in `src/lib/server/db.ts`.
- New migration = new numbered file in `supabase/migrations/`, additive / backward compatible when possible,
  and the same change folded into `supabase/schema.sql` (used for fresh projects).
- Code that needs a migration must not be pushed until the user has run it. Verify it by effect with the
  service key from `.env.local` (e.g. select the new column, or try a value the new constraint allows).
- Never print or commit the keys in `.env.local`.

## Rejoin the same seat
- `src/lib/reconnect.ts`: every member request stamps `last_seen_at` (at most every 10 s, in `requireMember`);
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

## Testing
- `npm test` (Vitest, pure rules in `src/lib/game.ts`), `npx tsc --noEmit`, `npx eslint src`, `npx next build`.
- End-to-end: `node scripts/e2e.mjs [baseUrl]` (default production `https://games.hailatat.icu/classicbingo`;
  local: `http://localhost:3000/classicbingo`). Checks page / `_next` assets / version / manifest / icons /
  `room/XXXXXX` over HTTP and that `web-bingo-game.vercel.app/classicbingo` serves the same build, then drives the
  real API with 3 players: create (password), join, wrong password, rejoin (saved token, same device, old token dead,
  mid-game), settings, boards, ready, start, out-of-turn / illegal calls, private boards and marks, hint, kick with
  "Ignoră", skip, full game to a validated win, reveal, new round, pending kick enforced, leave mid-game (last one
  wins), lobby kick. Rooms are named `e2e-test-…` and deleted at the end; it never calls `/api/feedback`.
