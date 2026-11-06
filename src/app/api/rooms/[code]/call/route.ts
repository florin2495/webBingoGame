import { notifyRoom } from "@/lib/server/broadcast";
import { db } from "@/lib/server/db";
import { fail, handle, isUniqueViolation, readJson } from "@/lib/server/http";
import { listCalled, requireMember, requireStatus, turnPlayerId } from "@/lib/server/room";

// POST /api/rooms/[code]/call  { number } - only the player whose turn it is.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/call">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireStatus(room, "playing");

    const body = await readJson(req);
    const number = Number(body.number);
    const max = room.size * room.size;
    if (!Number.isInteger(number) || number < 1 || number > max) fail(400, `Numărul trebuie să fie între 1 și ${max}.`);

    const called = await listCalled(room.id, room.round);
    if (turnPlayerId(room, called.length) !== player.id) fail(403, "Nu e tura ta.");
    if (called.some((c) => c.number === number)) fail(409, `Numărul ${number} a fost deja strigat.`);

    // seq = turn slot. unique(room, round, seq) rejects a concurrent call for the same turn,
    // unique(room, round, number) rejects a number called twice.
    const { error } = await db().from("called_numbers").insert({
      room_id: room.id,
      round: room.round,
      seq: called.length + 1,
      number,
      player_id: player.id,
    });
    if (isUniqueViolation(error)) fail(409, "Numărul a fost deja strigat sau tura s-a schimbat. Reîncarcă.");
    if (error) throw error;

    // The caller's own number is marked for them immediately (rule 7).
    const { error: markError } = await db()
      .from("marks")
      .upsert(
        { player_id: player.id, room_id: room.id, round: room.round, number },
        { onConflict: "player_id,round,number", ignoreDuplicates: true },
      );
    if (markError) throw markError;

    await notifyRoom(room.id, "number_called");
    return { ok: true };
  });
}
