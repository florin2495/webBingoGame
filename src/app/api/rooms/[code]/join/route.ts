import { enforceExpiredKicks } from "@/lib/server/kicks";
import { MAX_PLAYERS, MAX_SPECTATORS, NICKNAME_MAX } from "@/lib/game";
import { seatBusyMessage, seatClaim } from "@/lib/reconnect";
import { notifyRoom } from "@/lib/server/broadcast";
import { hashDeviceId, hashToken, newPlayerToken, verifyPassword } from "@/lib/server/crypto";
import { db, T } from "@/lib/server/db";
import { cleanText, fail, handle, isUniqueViolation, readJson } from "@/lib/server/http";
import { getRoomByCode, touchRoom } from "@/lib/server/room";

async function maxSeat(roomId: string): Promise<number> {
  const { data, error } = await db()
    .from(T.players)
    .select("seat")
    .eq("room_id", roomId)
    .order("seat", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.seat as number | undefined) ?? -1;
}

interface SeatRow {
  id: string;
  nickname: string;
  token_hash: string;
  device_hash: string | null;
  last_seen_at: string;
}

// POST /api/rooms/[code]/join  { nickname, password?, deviceId? }
// Joining a room that already started (playing / finished) makes you a spectator (max MAX_SPECTATORS).
// A nickname that already has a seat in the room reclaims that seat (same player id, board, marks, hints and
// place in the turn order; new token) when the request comes from the same device or the seat has been
// disconnected for 45 s - also mid-game.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const body = await readJson(req);
    const nickname = cleanText(body.nickname, "Nickname-ul", 1, NICKNAME_MAX);
    const deviceHash = hashDeviceId(body.deviceId);
    // Enforce host kicks whose 10 s are over first, so a reclaim cannot undo an expired kick.
    const room = await enforceExpiredKicks(await getRoomByCode(code), code);

    if (room.password_hash) {
      const password = typeof body.password === "string" ? body.password : "";
      if (!(await verifyPassword(password, room.password_hash))) fail(403, "Parolă greșită.");
    }

    const { data: seats, error: seatsError } = await db()
      .from(T.players)
      .select("id, nickname, token_hash, device_hash, last_seen_at")
      .eq("room_id", room.id);
    if (seatsError) throw seatsError;
    const rows = (seats ?? []) as SeatRow[];

    const { data: specs, error: specsError } = await db()
      .from(T.spectators)
      .select("id, nickname, token_hash, device_hash, last_seen_at")
      .eq("room_id", room.id);
    if (specsError) throw specsError;
    const spectatorRows = (specs ?? []) as SeatRow[];

    // An existing seat (player or spectator) with this nickname is reclaimed: same id, new token.
    const sameNick = (p: SeatRow) => p.nickname.toLowerCase() === nickname.toLowerCase();
    const existingPlayer = rows.find(sameNick);
    const existingSpectator = existingPlayer ? undefined : spectatorRows.find(sameNick);
    const existing = existingPlayer ?? existingSpectator;
    if (existing) {
      if (seatClaim(existing, deviceHash, Date.now()) === "busy") fail(409, seatBusyMessage(existing.nickname));
      const token = newPlayerToken();
      // Conditional on the old token: two reclaims at once -> only one wins, the other gets a 409.
      const { data, error } = await db()
        .from(existingPlayer ? T.players : T.spectators)
        .update({
          token_hash: hashToken(token),
          device_hash: deviceHash ?? existing.device_hash,
          ...(existingPlayer ? { kick_requested_at: null } : {}),
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("token_hash", existing.token_hash)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) fail(409, "Locul tocmai a fost reluat de altcineva. Mai încearcă o dată.");
      await touchRoom(room.id);
      await notifyRoom(room.id, "player_rejoined");
      return { code: room.code, playerId: existing.id, token, role: existingPlayer ? "player" : "spectator" };
    }

    if (room.status !== "lobby") {
      // Room already running: watch it, and queue for the next round with "Intră la runda următoare".
      if (spectatorRows.length >= MAX_SPECTATORS) {
        fail(409, `Jocul a început deja și camera are deja ${MAX_SPECTATORS} spectatori (maximum). Încearcă mai târziu.`);
      }
      const specToken = newPlayerToken();
      const { data: spec, error: specError } = await db()
        .from(T.spectators)
        .insert({ room_id: room.id, nickname, token_hash: hashToken(specToken), device_hash: deviceHash })
        .select("id")
        .single();
      if (isUniqueViolation(specError)) fail(409, "Nickname-ul e deja folosit în cameră.");
      if (specError) throw specError;
      await touchRoom(room.id);
      await notifyRoom(room.id, "spectator_joined");
      return { code: room.code, playerId: spec.id, token: specToken, role: "spectator" };
    }
    if (rows.length >= MAX_PLAYERS) fail(409, `Camera e plină (maxim ${MAX_PLAYERS} jucători).`);

    const token = newPlayerToken();
    const { data, error } = await db()
      .from(T.players)
      .insert({
        room_id: room.id,
        nickname,
        token_hash: hashToken(token),
        device_hash: deviceHash,
        seat: (await maxSeat(room.id)) + 1,
      })
      .select("id")
      .single();
    if (isUniqueViolation(error)) fail(409, "Nickname-ul e deja folosit în cameră.");
    if (error) throw error;

    await touchRoom(room.id);
    await notifyRoom(room.id, "player_joined");
    return { code: room.code, playerId: data.id, token, role: "player" };
  });
}
