import { db } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";

const GAME = "bingo";
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? null;

// POST /api/feedback - store a short player message in the hub's shared hub_feedback table.
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    // Honeypot: real users never fill it. Pretend success, store nothing.
    if (typeof body.website === "string" && body.website.trim() !== "") return { ok: true };

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 1 || message.length > 1000) fail(400, "Mesajul trebuie să aibă 1-1000 caractere.");
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (nickname.length > 40) fail(400, "Nickname-ul poate avea cel mult 40 caractere.");

    const { error } = await db()
      .from("hub_feedback")
      .insert({ game: GAME, message, nickname: nickname || null, app_version: VERSION });
    if (error) throw error;
    return { ok: true };
  });
}
