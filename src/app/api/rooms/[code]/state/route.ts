import { PRESENCE_TOUCH_MS } from "@/lib/game";
import { handle } from "@/lib/server/http";
import { buildState, requireMember, touchRoom } from "@/lib/server/room";

// GET /api/rooms/[code]/state - full state for the calling member (own board only).
// Every open room page polls this, so it doubles as a presence heartbeat for the idle timer.
export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]/state">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    if (Date.now() - new Date(room.last_activity_at).getTime() > PRESENCE_TOUCH_MS) {
      await touchRoom(room.id);
    }
    return buildState(room, player);
  });
}
