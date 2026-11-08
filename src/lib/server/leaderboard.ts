import "server-only";
import { db, PLAYER_COLUMNS, T, type PlayerRow, type RoomRow } from "./db";
import { isUniqueViolation } from "./http";

const GAME = "bingo";

/** Contract C: player_key = nickname, trimmed and lowercased (no accounts: same nickname = same person). */
export const playerKey = (nickname: string) => nickname.trim().toLowerCase().slice(0, 40);

/**
 * Reports a finished round to the hub leaderboard (hub_leaderboard, hub_leaderboard_rounds, owned by the hub):
 * +1 games for every participant, +1 wins for the winner(s). Idempotent per (game, room, round): the
 * hub_leaderboard_rounds row is inserted first, a second report of the same round does nothing.
 * Best effort: never throws, so a missing hub table or a DB hiccup cannot break the game.
 * The counters are read-then-written (no atomic increment in PostgREST), fine for a round-end event.
 */
export async function reportRound(room: RoomRow, participantIds: string[], winnerIds: string[]): Promise<void> {
  try {
    if (participantIds.length === 0) return;
    const { error: roundError } = await db()
      .from("hub_leaderboard_rounds")
      .insert({ game: GAME, room_code: room.code, round_no: room.round });
    if (isUniqueViolation(roundError)) return; // this round was already counted
    if (roundError) throw roundError;

    const { data, error } = await db().from(T.players).select(PLAYER_COLUMNS).in("id", participantIds);
    if (error) throw error;
    const players = (data ?? []) as PlayerRow[];
    if (players.length === 0) return;
    const winners = new Set(winnerIds);

    const keys = players.map((p) => playerKey(p.nickname));
    const { data: existing, error: readError } = await db()
      .from("hub_leaderboard")
      .select("player_key, wins, games")
      .eq("game", GAME)
      .in("player_key", keys);
    if (readError) throw readError;
    const current = new Map((existing ?? []).map((r) => [r.player_key as string, r as { wins: number; games: number }]));

    const now = new Date().toISOString();
    const rows = players.map((p) => {
      const key = playerKey(p.nickname);
      const row = current.get(key);
      return {
        game: GAME,
        player_key: key,
        display_name: p.nickname.trim().slice(0, 40),
        wins: (row?.wins ?? 0) + (winners.has(p.id) ? 1 : 0),
        games: (row?.games ?? 0) + 1,
        updated_at: now,
      };
    });
    const { error: upsertError } = await db().from("hub_leaderboard").upsert(rows, { onConflict: "game,player_key" });
    if (upsertError) throw upsertError;
  } catch (err) {
    console.error("leaderboard report failed", err);
  }
}
