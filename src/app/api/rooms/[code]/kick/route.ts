import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";
import { removePlayer } from "@/lib/server/membership";
import { requireHost, requireMember } from "@/lib/server/room";

// POST /api/rooms/[code]/kick  { playerId } - host removes another player.
// Lobby / finished game, or a player not taking part in the running game: removed at once.
// A player in the running game's turn order only gets a pending kick (10 s to press "Ignoră",
// see /kick/ignore); lazy expiry (enforceExpiredKicks) then removes them through removePlayer.
// Not a ban: identity is a browser token, so a kicked player could rejoin a lobby under a
// new nickname. A room password is the real access control.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/kick">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);

    const body = await readJson(req);
    const targetId = typeof body.playerId === "string" ? body.playerId : "";
    if (targetId === player.id) fail(400, "Nu te poți scoate singur. Folosește „Părăsește camera”.");

    const { data: target, error } = await db()
      .from(T.players)
      .select("id")
      .eq("id", targetId)
      .eq("room_id", room.id)
      .maybeSingle();
    if (error && error.code !== "22P02") throw error; // 22P02 = malformed uuid
    if (!target) fail(404, "Jucătorul nu mai e în cameră.");

    if (room.status === "playing" && room.turn_order.includes(targetId)) {
      // Only starts the countdown; a second kick on an already pending player changes nothing.
      const { error: pendingError } = await db()
        .from(T.players)
        .update({ kick_requested_at: new Date().toISOString() })
        .eq("id", targetId)
        .is("kick_requested_at", null);
      if (pendingError) throw pendingError;
      await notifyRoom(room.id, "kick_pending");
      return { ok: true, pending: true };
    }

    await removePlayer(room, targetId, "player_kicked");
    return { ok: true };
  });
}
