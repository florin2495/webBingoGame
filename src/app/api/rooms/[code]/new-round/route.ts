import { rotateSeats } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { promoteQueued } from "@/lib/server/membership";
import { listPlayers, requireHost, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/new-round - host only, after a finished game. Back to the lobby; seats rotate, queued spectators join.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/new-round">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "finished");

    // Reset ready first: if the room update below fails, players just re-click ready.
    const { error: playersError } = await db()
      .from(T.players)
      .update({ ready: false, hints_used: 0, kick_requested_at: null })
      .eq("room_id", room.id);
    if (playersError) throw playersError;

    const { data, error } = await db()
      .from(T.rooms)
      .update({
        status: "lobby",
        round: room.round + 1,
        turn_order: [],
        turn_offset: 0,
        winner_player_id: null,
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", room.id)
      .eq("status", "finished")
      .eq("round", room.round)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Runda nouă a fost deja pornită.");

    // The first caller changes every round: seats rotate one step (the host can still reorder in the lobby).
    const seated = rotateSeats((await listPlayers(room.id)).map((p) => p.id));
    const rotated = await Promise.all(seated.map((id, seat) => db().from(T.players).update({ seat }).eq("id", id)));
    const rotateError = rotated.find((r) => r.error)?.error;
    if (rotateError) throw rotateError;

    // Queued spectators take the free seats, after the current players, in queue order.
    await promoteQueued(room.id);

    await notifyRoom(room.id, "new_round");
    return { ok: true };
  });
}
