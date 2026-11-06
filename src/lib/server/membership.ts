import "server-only";
import { turnAfterLeave } from "@/lib/game";
import { notifyRoom } from "./broadcast";
import { db, type RoomRow, T } from "./db";
import { listCalled, listPlayers } from "./room";

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
