import "server-only";
import { currentTurnIndex } from "@/lib/game";
import type { CalledNumber, PublicPlayer, RoomState } from "@/lib/types";
import { hashToken } from "./crypto";
import { db, PLAYER_COLUMNS, type PlayerRow, type RoomRow } from "./db";
import { fail } from "./http";

const ROOM_COLUMNS =
  "id, code, name, password_hash, size, lines_to_win, status, round, turn_order, turn_offset, host_player_id, winner_player_id";

export function normalizeCode(code: string): string {
  const c = decodeURIComponent(code).trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(c)) fail(404, "Camera nu există.");
  return c;
}

export async function getRoomByCode(code: string): Promise<RoomRow> {
  const { data, error } = await db().from("rooms").select(ROOM_COLUMNS).eq("code", normalizeCode(code)).maybeSingle();
  if (error) throw error;
  if (!data) fail(404, "Camera nu există.");
  return data as RoomRow;
}

/**
 * Resolves the caller from the x-player-token header and checks they belong to the room.
 * Every member-only route goes through here.
 */
export async function requireMember(req: Request, code: string): Promise<{ room: RoomRow; player: PlayerRow }> {
  const token = req.headers.get("x-player-token");
  if (!token || token.length > 200) fail(401, "Nu ești în această cameră.");
  const room = await getRoomByCode(code);
  const { data, error } = await db()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("token_hash", hashToken(token))
    .eq("room_id", room.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) fail(401, "Nu ești în această cameră.");
  return { room, player: data as PlayerRow };
}

export function requireHost(room: RoomRow, player: PlayerRow) {
  if (room.host_player_id !== player.id) fail(403, "Doar creatorul camerei poate face asta.");
}

export function requireStatus(room: RoomRow, ...allowed: RoomRow["status"][]) {
  if (!allowed.includes(room.status)) {
    const msg: Record<RoomRow["status"], string> = {
      lobby: "Jocul nu a început încă.",
      playing: "Jocul este în desfășurare.",
      finished: "Jocul s-a terminat.",
    };
    fail(409, msg[room.status]);
  }
}

export async function listPlayers(roomId: string): Promise<PlayerRow[]> {
  const { data, error } = await db()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlayerRow[];
}

export async function listCalled(roomId: string, round: number): Promise<CalledNumber[]> {
  const { data, error } = await db()
    .from("called_numbers")
    .select("seq, number, player_id")
    .eq("room_id", roomId)
    .eq("round", round)
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ seq: r.seq, number: r.number, playerId: r.player_id }));
}

export async function getBoard(playerId: string, round: number): Promise<number[] | null> {
  const { data, error } = await db()
    .from("boards")
    .select("cells")
    .eq("player_id", playerId)
    .eq("round", round)
    .maybeSingle();
  if (error) throw error;
  return (data?.cells as number[] | undefined) ?? null;
}

export async function getMarks(playerId: string, round: number): Promise<number[]> {
  const { data, error } = await db().from("marks").select("number").eq("player_id", playerId).eq("round", round);
  if (error) throw error;
  return (data ?? []).map((r) => r.number as number);
}

export function turnPlayerId(room: RoomRow, calledCount: number): string | null {
  if (room.status !== "playing" || room.turn_order.length === 0) return null;
  return room.turn_order[currentTurnIndex(calledCount, room.turn_offset, room.turn_order.length)] ?? null;
}

const toPublic = (p: PlayerRow): PublicPlayer => ({
  id: p.id,
  nickname: p.nickname,
  isHost: p.is_host,
  ready: p.ready,
});

export async function buildState(room: RoomRow, me: PlayerRow): Promise<RoomState> {
  const [players, called, board, marks] = await Promise.all([
    listPlayers(room.id),
    listCalled(room.id, room.round),
    getBoard(me.id, room.round),
    getMarks(me.id, room.round),
  ]);

  let ordered = players;
  if (room.status !== "lobby" && room.turn_order.length > 0) {
    const pos = new Map(room.turn_order.map((id, i) => [id, i]));
    ordered = [...players].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      size: room.size,
      linesToWin: room.lines_to_win,
      status: room.status,
      round: room.round,
      hasPassword: room.password_hash !== null,
      hostPlayerId: room.host_player_id,
      winnerPlayerId: room.winner_player_id,
      currentTurnPlayerId: turnPlayerId(room, called.length),
    },
    players: ordered.map(toPublic),
    me: toPublic(me),
    board,
    marks,
    called,
  };
}
