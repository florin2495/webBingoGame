import { MIN_PLAYERS_TO_START } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { listPlayers, requireHost, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/start - host only, every player ready. Fixes the turn order (= seat order).
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "lobby");

    const players = await listPlayers(room.id);
    if (players.length < MIN_PLAYERS_TO_START) fail(409, `Ai nevoie de cel puțin ${MIN_PLAYERS_TO_START} jucători.`);
    const notReady = players.filter((p) => !p.ready);
    if (notReady.length > 0) fail(409, `Nu sunt toți ready: ${notReady.map((p) => p.nickname).join(", ")}.`);

    // A new game starts clean: no pending kick survives it.
    const { error: kickError } = await db().from(T.players).update({ kick_requested_at: null }).eq("room_id", room.id);
    if (kickError) throw kickError;

    // Conditional update: only one start can win, and only from the lobby.
    const { data, error } = await db()
      .from(T.rooms)
      .update({
        status: "playing",
        // Seat order (listPlayers sorts by seat): the first one calls first. The host sits at seat 0 in round 1 and
        // can reorder in the lobby; new-round rotates the seats so the starter changes every round.
        turn_order: players.map((p) => p.id),
        turn_offset: 0,
        winner_player_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", room.id)
      .eq("status", "lobby")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Jocul a fost deja pornit.");

    await notifyRoom(room.id, "game_started");
    return { ok: true };
  });
}
