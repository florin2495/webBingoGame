import { hintsPerRound } from "@/lib/game";
import { db, T } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { getBoard, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/hint - spends one of the caller's hintsPerRound(size) hints.
// The highlight itself is computed on the client (the called list is public anyway);
// the server only enforces the per-round limit.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/hint">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireStatus(room, "playing");
    if (!(await getBoard(player.id, room.round))) fail(409, "Nu ai o matrice în runda asta.");

    const limit = hintsPerRound(room.size);
    const used = player.hints_used ?? 0;
    if (used >= limit) fail(409, `Ai folosit toate cele ${limit} ajutoare din runda asta.`);

    // Optimistic increment: a double tap cannot spend two hints for one read.
    const { data, error } = await db()
      .from(T.players)
      .update({ hints_used: used + 1 })
      .eq("id", player.id)
      .eq("hints_used", used)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Ajutorul a fost deja folosit. Încearcă din nou.");

    return { hintsLeft: limit - used - 1 };
  });
}
