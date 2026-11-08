import { isPermutationOf } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";
import { listPlayers, requireHost, requireMember, requireStatus, touchRoom } from "@/lib/server/room";

// POST /api/rooms/[code]/reorder  { order: [playerId, ...] } - host only, in the lobby (between rounds, never
// mid-round). `order` must be a full permutation of the players. Saved as seat 0..n-1: the first one calls first.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/reorder">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "lobby");

    const body = await readJson(req);
    const players = await listPlayers(room.id);
    if (!isPermutationOf(body.order, players.map((p) => p.id))) {
      fail(409, "Lista jucătorilor s-a schimbat între timp. Încearcă din nou.");
    }
    const order = body.order as string[];

    const results = await Promise.all(
      order.map((id, seat) => db().from(T.players).update({ seat }).eq("id", id).eq("room_id", room.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;

    await touchRoom(room.id);
    await notifyRoom(room.id, "players_reordered");
    return { ok: true };
  });
}
