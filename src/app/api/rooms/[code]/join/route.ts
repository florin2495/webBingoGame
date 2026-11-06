import { NICKNAME_MAX } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { hashToken, newPlayerToken, verifyPassword } from "@/lib/server/crypto";
import { db, T } from "@/lib/server/db";
import { cleanText, fail, handle, isUniqueViolation, readJson } from "@/lib/server/http";
import { getRoomByCode, touchRoom } from "@/lib/server/room";

const MAX_PLAYERS = 12;

// POST /api/rooms/[code]/join  { nickname, password? }
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const body = await readJson(req);
    const nickname = cleanText(body.nickname, "Nickname-ul", 1, NICKNAME_MAX);
    const room = await getRoomByCode(code);

    if (room.password_hash) {
      const password = typeof body.password === "string" ? body.password : "";
      if (!(await verifyPassword(password, room.password_hash))) fail(403, "Parolă greșită.");
    }
    if (room.status !== "lobby") fail(409, "Jocul a început deja. Intră după runda curentă.");

    const { count, error: countError } = await db()
      .from(T.players)
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_PLAYERS) fail(409, `Camera e plină (maxim ${MAX_PLAYERS} jucători).`);

    const token = newPlayerToken();
    const { data, error } = await db()
      .from(T.players)
      .insert({ room_id: room.id, nickname, token_hash: hashToken(token) })
      .select("id")
      .single();
    if (isUniqueViolation(error)) fail(409, "Nickname-ul e deja folosit în cameră.");
    if (error) throw error;

    await touchRoom(room.id);
    await notifyRoom(room.id, "player_joined");
    return { code: room.code, playerId: data.id, token };
  });
}
