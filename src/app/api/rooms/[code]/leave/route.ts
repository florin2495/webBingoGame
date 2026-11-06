import { handle } from "@/lib/server/http";
import { removePlayer } from "@/lib/server/membership";
import { requireMember } from "@/lib/server/room";

// POST /api/rooms/[code]/leave - the caller leaves the room for good (any status).
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    const { roomClosed } = await removePlayer(room, player.id, "player_left");
    return { ok: true, roomClosed };
  });
}
