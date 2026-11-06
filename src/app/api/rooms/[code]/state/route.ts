import { handle } from "@/lib/server/http";
import { buildState, requireMember } from "@/lib/server/room";

// GET /api/rooms/[code]/state - full state for the calling member (own board only).
export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]/state">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    return buildState(room, player);
  });
}
