import { isValidBoard } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { getBoard, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/ready - only with a complete saved board; locks the board.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/ready">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireStatus(room, "lobby");
    if (player.ready) return { ok: true };

    const board = await getBoard(player.id, room.round);
    if (!board || !isValidBoard(board, room.size)) fail(409, "Completează sau generează matricea mai întâi.");

    const { error } = await db().from("players").update({ ready: true }).eq("id", player.id);
    if (error) throw error;

    await notifyRoom(room.id, "player_ready");
    return { ok: true };
  });
}
