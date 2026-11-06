import { countValidLines } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { getBoard, getMarks, listCalled, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/validate - checks the caller's board + marks against called numbers.
// Wins with >= lines_to_win lines that are fully marked AND fully made of called numbers.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/validate">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireStatus(room, "playing");

    const [board, marks, called] = await Promise.all([
      getBoard(player.id, room.round),
      getMarks(player.id, room.round),
      listCalled(room.id, room.round),
    ]);
    if (!board) fail(409, "Nu ai o matrice în runda asta.");

    const lines = countValidLines(board, room.size, new Set(marks), new Set(called.map((c) => c.number)));
    if (lines < room.lines_to_win) {
      const wrong = marks.filter((m) => !called.some((c) => c.number === m)).length;
      return {
        won: false,
        lines,
        required: room.lines_to_win,
        message:
          `Validare eșuată: ai ${lines} ${lines === 1 ? "linie corectă" : "linii corecte"} din ${room.lines_to_win} necesare.` +
          (wrong > 0 ? ` Ai ${wrong} ${wrong === 1 ? "număr bifat care nu a fost strigat" : "numere bifate care nu au fost strigate"}.` : ""),
      };
    }

    // Conditional update: the first valid claim wins, later ones see status != playing.
    const { data, error } = await db()
      .from("rooms")
      .update({ status: "finished", winner_player_id: player.id, updated_at: new Date().toISOString() })
      .eq("id", room.id)
      .eq("status", "playing")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Jocul s-a terminat deja.");

    await notifyRoom(room.id, "game_won");
    return { won: true, lines, required: room.lines_to_win, message: "BINGO! Ai câștigat!" };
  });
}
