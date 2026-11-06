import { generateBoard, isValidBoard } from "@/lib/game";
import { db, T } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";
import { requireMember, requireStatus, touchRoom } from "@/lib/server/room";

// POST /api/rooms/[code]/board  { generate: true } | { cells: number[] }
// Saves the caller's board for the current round. Locked once the player is ready.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/board">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireStatus(room, "lobby");
    if (player.ready) fail(409, "Matricea e blocată după „I'm ready”.");

    const body = await readJson(req);
    let cells: number[];
    if (body.generate === true) {
      cells = generateBoard(room.size);
    } else if (isValidBoard(body.cells, room.size)) {
      cells = body.cells;
    } else {
      fail(400, `Matricea trebuie să conțină exact numerele 1–${room.size * room.size}, fiecare o singură dată.`);
    }

    const { error } = await db()
      .from(T.boards)
      .upsert(
        { player_id: player.id, room_id: room.id, round: room.round, cells, updated_at: new Date().toISOString() },
        { onConflict: "player_id,round" },
      );
    if (error) throw error;
    await touchRoom(room.id);
    return { board: cells };
  });
}
