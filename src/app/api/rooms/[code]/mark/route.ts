import { db, T } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";
import { getBoard, listCalled, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/mark  { number, marked } - manual tick on the caller's own board.
// Marking a number that was not called is allowed (paper rules); validation catches it.
// A called number can no longer be un-ticked (by anyone): only never-called numbers can be.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/mark">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireStatus(room, "playing");

    const body = await readJson(req);
    const number = Number(body.number);
    const max = room.size * room.size;
    if (!Number.isInteger(number) || number < 1 || number > max) fail(400, `Numărul trebuie să fie între 1 și ${max}.`);
    if (typeof body.marked !== "boolean") fail(400, "Cerere invalidă.");

    const board = await getBoard(player.id, room.round);
    if (!board) fail(409, "Nu ai o matrice în runda asta.");

    if (!body.marked) {
      const called = await listCalled(room.id, room.round);
      if (called.some((c) => c.number === number)) fail(409, `Numărul ${number} a fost strigat: nu mai poate fi debifat.`);
    }

    const marks = db().from(T.marks);
    const { error } = body.marked
      ? await marks.upsert(
          { player_id: player.id, room_id: room.id, round: room.round, number },
          { onConflict: "player_id,round,number", ignoreDuplicates: true },
        )
      : await marks.delete().eq("player_id", player.id).eq("round", room.round).eq("number", number);
    if (error) throw error;

    // Marks are private - no broadcast.
    return { ok: true };
  });
}
