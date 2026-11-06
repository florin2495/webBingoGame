import { isValidLinesToWin, isValidSize, SIZE_DEFAULT } from "@/lib/game";
import { hashPassword, hashToken, newPlayerToken, newRoomCode } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { cleanText, fail, handle, isUniqueViolation, readJson } from "@/lib/server/http";

// POST /api/rooms - create a room and its host player.
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const name = cleanText(body.name, "Numele camerei", 1, 40);
    const nickname = cleanText(body.nickname, "Nickname-ul", 1, 20);
    const size = body.size === undefined ? SIZE_DEFAULT : Number(body.size);
    const linesToWin = body.linesToWin === undefined ? 1 : Number(body.linesToWin);
    if (!isValidSize(size)) fail(400, "Dimensiunea matricei trebuie să fie între 3 și 10.");
    if (!isValidLinesToWin(linesToWin)) fail(400, "Numărul de linii pentru câștig trebuie să fie între 1 și 3.");

    let passwordHash: string | null = null;
    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length > 100) fail(400, "Parola e prea lungă.");
      passwordHash = await hashPassword(body.password);
    }

    let room: { id: string; code: string } | null = null;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      const { data, error } = await db()
        .from("rooms")
        .insert({ code: newRoomCode(), name, password_hash: passwordHash, size, lines_to_win: linesToWin })
        .select("id, code")
        .single();
      if (error && !isUniqueViolation(error)) throw error;
      room = data;
    }
    if (!room) fail(503, "Nu am putut genera un cod de cameră. Încearcă din nou.");

    const token = newPlayerToken();
    const { data: player, error: playerError } = await db()
      .from("players")
      .insert({ room_id: room.id, nickname, token_hash: hashToken(token), is_host: true })
      .select("id")
      .single();
    if (playerError) throw playerError;

    const { error: hostError } = await db().from("rooms").update({ host_player_id: player.id }).eq("id", room.id);
    if (hostError) throw hostError;

    return { code: room.code, playerId: player.id, token };
  });
}
