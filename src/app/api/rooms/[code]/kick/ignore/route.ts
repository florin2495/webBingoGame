import { isKickExpired } from "@/lib/kick";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/room";

// POST /api/rooms/[code]/kick/ignore - the kicked player refuses: clears their own pending kick.
// requireMember already removed anyone whose kick expired (then this is a 401).
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/kick/ignore">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);

    if (player.kick_requested_at === null) return { ok: true, cleared: false }; // nothing pending
    if (isKickExpired(player.kick_requested_at, Date.now())) fail(409, "Prea târziu, ai fost scos.");

    const { data, error } = await db()
      .from(T.players)
      .update({ kick_requested_at: null })
      .eq("id", player.id)
      .eq("kick_requested_at", player.kick_requested_at)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Prea târziu, ai fost scos."); // claimed by the expiry in between

    await notifyRoom(room.id, "kick_ignored");
    return { ok: true, cleared: true };
  });
}
