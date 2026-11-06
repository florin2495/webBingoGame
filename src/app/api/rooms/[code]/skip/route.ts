import { notifyRoom } from "@/lib/server/broadcast";
import { db } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { requireHost, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/skip - host skips the current turn (e.g. a player left).
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/skip">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "playing");

    // Optimistic: only applies if nobody else changed the offset meanwhile.
    const { data, error } = await db()
      .from("rooms")
      .update({ turn_offset: room.turn_offset + 1, updated_at: new Date().toISOString() })
      .eq("id", room.id)
      .eq("status", "playing")
      .eq("turn_offset", room.turn_offset)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Tura s-a schimbat deja. Reîncarcă.");

    await notifyRoom(room.id, "turn_skipped");
    return { ok: true };
  });
}
