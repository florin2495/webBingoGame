import { handle } from "@/lib/server/http";
import { notifyRoom } from "@/lib/server/broadcast";
import { removePlayer, removeSpectator } from "@/lib/server/membership";
import { requireViewer } from "@/lib/server/room";

// POST /api/rooms/[code]/leave - the caller (player or spectator) leaves the room for good (any status).
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player, spectator } = await requireViewer(req, code);
    if (!player) {
      await removeSpectator(spectator!);
      await notifyRoom(room.id, "spectator_left");
      return { ok: true, roomClosed: false };
    }
    const { roomClosed } = await removePlayer(room, player.id, "player_left");
    return { ok: true, roomClosed };
  });
}
