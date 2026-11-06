import { isValidLinesToWin, isValidSize } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";
import { requireHost, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/settings  { size?, linesToWin? } - host only, in the lobby.
// Changing N deletes this round's boards (they no longer fit). Any change resets "ready"
// so everyone confirms under the new rules.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/settings">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "lobby");

    const body = await readJson(req);
    const size = body.size === undefined ? room.size : Number(body.size);
    const linesToWin = body.linesToWin === undefined ? room.lines_to_win : Number(body.linesToWin);
    if (!isValidSize(size)) fail(400, "Dimensiunea matricei trebuie să fie între 3 și 10.");
    if (!isValidLinesToWin(linesToWin)) fail(400, "Numărul de linii pentru câștig trebuie să fie între 1 și 3.");
    if (size === room.size && linesToWin === room.lines_to_win) return { ok: true, changed: false };

    // Only applies if the room is still in the lobby with the settings we read.
    const { data, error } = await db()
      .from(T.rooms)
      .update({
        size,
        lines_to_win: linesToWin,
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", room.id)
      .eq("status", "lobby")
      .eq("size", room.size)
      .eq("lines_to_win", room.lines_to_win)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Setările s-au schimbat între timp sau jocul a pornit. Reîncarcă.");

    if (size !== room.size) {
      const { error: boardsError } = await db().from(T.boards).delete().eq("room_id", room.id).eq("round", room.round);
      if (boardsError) throw boardsError;
    }
    const { error: readyError } = await db().from(T.players).update({ ready: false }).eq("room_id", room.id);
    if (readyError) throw readyError;

    await notifyRoom(room.id, "settings_changed");
    return { ok: true, changed: true };
  });
}
