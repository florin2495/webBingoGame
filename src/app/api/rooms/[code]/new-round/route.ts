import { notifyRoom } from "@/lib/server/broadcast";
import { db } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { requireHost, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/new-round - host only, after a finished game. Back to the lobby.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/new-round">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "finished");

    // Reset ready first: if the room update below fails, players just re-click ready.
    const { error: playersError } = await db()
      .from("players")
      .update({ ready: false, hints_used: 0 })
      .eq("room_id", room.id);
    if (playersError) throw playersError;

    const { data, error } = await db()
      .from("rooms")
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

    await notifyRoom(room.id, "new_round");
    return { ok: true };
  });
}
