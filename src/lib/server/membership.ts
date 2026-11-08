import "server-only";
import { turnAfterLeave } from "@/lib/game";
import { notifyRoom } from "./broadcast";
import { MAX_PLAYERS, promotable } from "@/lib/game";
import { db, type RoomRow, type SpectatorRow, T } from "./db";
import { reportRound } from "./leaderboard";
import { listCalled, listPlayers, listSpectators } from "./room";

/**
 * Removes a player from a room (used by both "leave" and the host's "kick").
 *  - last player out: the room is deleted
 *  - host removed: host passes to the next player in join order
 *  - during a game: removed from the turn order; whoever had the turn keeps it, or it moves to
 *    the next player. If fewer than 2 players remain in the game, the last one wins.
 */
export async function removePlayer(room: RoomRow, playerId: string, reason: string): Promise<{ roomClosed: boolean }> {
  const now = new Date().toISOString();
  const remaining = (await listPlayers(room.id)).filter((p) => p.id !== playerId);

  if (remaining.length === 0) {
    const { error } = await db().from(T.rooms).delete().eq("id", room.id);
    if (error) throw error;
    return { roomClosed: true };
  }

  const newHostId = room.host_player_id === playerId ? remaining[0].id : room.host_player_id;
  const update: Record<string, unknown> = { host_player_id: newHostId, updated_at: now, last_activity_at: now };

  if (room.status === "playing" && room.turn_order.includes(playerId)) {
    const called = await listCalled(room.id, room.round);
    const next = turnAfterLeave(room.turn_order, room.turn_offset, called.length, playerId);
    update.turn_order = next.order;
    update.turn_offset = next.offset;
    if (next.order.length < 2) {
      update.status = "finished";
      update.winner_player_id = next.order[0] ?? null;
    }
  }

  // Update the room first so the host / turn never points at a deleted player.
  const { error: roomError } = await db().from(T.rooms).update(update).eq("id", room.id);
  if (roomError) throw roomError;

  // The round ended because everyone else left: the last player wins (counts for the leaderboard).
  if (update.status === "finished" && update.winner_player_id) {
    await reportRound(room, room.turn_order, [update.winner_player_id as string]);
  }

  if (newHostId && newHostId !== room.host_player_id) {
    const { error } = await db().from(T.players).update({ is_host: true }).eq("id", newHostId);
    if (error) throw error;
  }

  // Cascades to the player's boards and marks; their called numbers stay (player_id -> null).
  const { error: deleteError } = await db().from(T.players).delete().eq("id", playerId);
  if (deleteError) throw deleteError;

  await notifyRoom(room.id, reason);
  return { roomClosed: false };
}

/**
 * Turns queued spectators into players, in queue order, while there are free seats (the others stay
 * spectators and keep their place in the queue). The new player keeps the spectator's id and token, so the
 * browser session stays valid; seats go after the existing players. Returns how many were promoted.
 */
export async function promoteQueued(roomId: string): Promise<number> {
  const players = await listPlayers(roomId);
  const queue = (await listSpectators(roomId)).filter((s) => s.queued_at !== null);
  const chosen = promotable(queue, players.length, MAX_PLAYERS);
  let seat = players.reduce((m, p) => Math.max(m, p.seat), -1) + 1;
  let promoted = 0;
  for (const s of chosen) {
    const { data: row, error: readError } = await db()
      .from(T.spectators)
      .select("token_hash, device_hash")
      .eq("id", s.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) continue; // left in the meantime
    const { error } = await db().from(T.players).insert({
      id: s.id,
      room_id: roomId,
      nickname: s.nickname,
      token_hash: row.token_hash,
      device_hash: row.device_hash,
      seat: seat++,
      last_seen_at: s.last_seen_at,
    });
    if (error) throw error;
    const { error: deleteError } = await db().from(T.spectators).delete().eq("id", s.id);
    if (deleteError) throw deleteError;
    promoted++;
  }
  return promoted;
}

/** A spectator (or a rejected promotion) leaves: just removes the row. */
export async function removeSpectator(spectator: SpectatorRow): Promise<void> {
  const { error } = await db().from(T.spectators).delete().eq("id", spectator.id);
  if (error) throw error;
}

