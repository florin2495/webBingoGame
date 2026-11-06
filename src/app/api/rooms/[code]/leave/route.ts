import { turnAfterLeave } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { listCalled, listPlayers, requireMember } from "@/lib/server/room";

// POST /api/rooms/[code]/leave - the caller leaves the room for good (any status).
//  - last player out: the room is deleted
//  - host leaves: host passes to the next player in join order
//  - during a game: the leaver is removed from the turn order; whoever had the turn keeps it,
//    or it passes to the next player. If fewer than 2 players remain, the last one wins.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    const now = new Date().toISOString();

    const remaining = (await listPlayers(room.id)).filter((p) => p.id !== player.id);
    if (remaining.length === 0) {
      const { error } = await db().from("rooms").delete().eq("id", room.id);
      if (error) throw error;
      return { ok: true, roomClosed: true };
    }

    const newHostId = room.host_player_id === player.id ? remaining[0].id : room.host_player_id;
    const update: Record<string, unknown> = { host_player_id: newHostId, updated_at: now, last_activity_at: now };

    if (room.status === "playing" && room.turn_order.includes(player.id)) {
      const called = await listCalled(room.id, room.round);
      const next = turnAfterLeave(room.turn_order, room.turn_offset, called.length, player.id);
      update.turn_order = next.order;
      update.turn_offset = next.offset;
      if (next.order.length < 2) {
        update.status = "finished";
        update.winner_player_id = next.order[0] ?? null;
      }
    }

    // Update the room first so the host / turn never points at a deleted player.
    const { error: roomError } = await db().from("rooms").update(update).eq("id", room.id);
    if (roomError) throw roomError;

    if (newHostId !== room.host_player_id && newHostId) {
      const { error } = await db().from("players").update({ is_host: true }).eq("id", newHostId);
      if (error) throw error;
    }

    // Cascades to the leaver's boards and marks; their called numbers stay (player_id -> null).
    const { error: deleteError } = await db().from("players").delete().eq("id", player.id);
    if (deleteError) throw deleteError;

    await notifyRoom(room.id, "player_left");
    return { ok: true, roomClosed: false };
  });
}
