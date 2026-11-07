import "server-only";
import { isKickExpired, KICK_EXPIRY_MS } from "@/lib/kick";
import { db, T } from "./db";
import { removePlayer } from "./membership";
import { getRoomByCode } from "./room";
import type { RoomRow } from "./db";

/**
 * Lazy enforcement of pending kicks (serverless: no timers). Runs from requireMember, i.e. at the
 * start of /state and of every room route. Each expired kick is CLAIMED first (kick_requested_at set
 * back to null only if it still has the value we read), so concurrent requests remove a player once.
 * Returns the room, re-read when something was removed. If the room was closed by the removal
 * (last player out) the re-read throws the usual 404.
 */
export async function enforceExpiredKicks(room: RoomRow, code: string): Promise<RoomRow> {
  const cutoff = new Date(Date.now() - KICK_EXPIRY_MS).toISOString();
  const { data, error } = await db()
    .from(T.players)
    .select("id, kick_requested_at")
    .eq("room_id", room.id)
    .not("kick_requested_at", "is", null)
    .lt("kick_requested_at", cutoff);
  if (error) throw error;
  const expired = (data ?? []).filter((p) => isKickExpired(p.kick_requested_at as string, Date.now()));
  if (expired.length === 0) return room;

  let current = room;
  let closed = false;
  for (const p of expired) {
    const { data: claimed, error: claimError } = await db()
      .from(T.players)
      .update({ kick_requested_at: null })
      .eq("id", p.id)
      .eq("kick_requested_at", p.kick_requested_at)
      .select("id");
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) continue; // someone else claimed it, or it was ignored
    try {
      const { roomClosed } = await removePlayer(current, p.id as string, "player_kicked");
      if (roomClosed) {
        closed = true;
        break;
      }
      current = await getRoomByCode(code); // turn order / host / status changed
    } catch (err) {
      // Removal failed: put the pending kick back so the next request retries it.
      await db().from(T.players).update({ kick_requested_at: p.kick_requested_at }).eq("id", p.id).is("kick_requested_at", null);
      throw err;
    }
  }
  return closed ? getRoomByCode(code) : current; // closed room: throws the usual 404
}
