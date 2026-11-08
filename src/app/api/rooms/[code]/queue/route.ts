import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { promoteQueued } from "@/lib/server/membership";
import { requireViewer, touchRoom } from "@/lib/server/room";

// POST /api/rooms/[code]/queue - spectator only. Toggles "Intră la runda următoare": queued spectators become
// players when the next round is set up (new-round), in queue order, while there are free seats; the rest stay
// spectators. Between rounds, when the room is already in the lobby, a free seat is taken at once.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/queue">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, spectator } = await requireViewer(req, code);
    if (!spectator) fail(409, "Ești deja jucător în cameră.");

    const queued = spectator.queued_at === null;
    const { error } = await db()
      .from(T.spectators)
      .update({ queued_at: queued ? new Date().toISOString() : null })
      .eq("id", spectator.id);
    if (error) throw error;

    let joined = false;
    if (queued && room.status === "lobby") joined = (await promoteQueued(room.id)) > 0;

    await touchRoom(room.id);
    await notifyRoom(room.id, joined ? "player_joined" : "spectator_queue");
    return { ok: true, queued, joined };
  });
}
