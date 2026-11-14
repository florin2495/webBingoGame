import "server-only";
import {
  currentTurnIndex,
  hintsPerRound,
  isRoomAbandoned,
  isRoomExpired,
  minutesLabel,
  ROOM_ABANDONED_MS,
  ROOM_IDLE_MINUTES,
} from "@/lib/game";
import { kickRemainingMs } from "@/lib/kick";
import { isConnected, LAST_SEEN_TOUCH_MS } from "@/lib/reconnect";
import type { CalledNumber, PublicPlayer, PublicSpectator, RevealedBoard, RoomState } from "@/lib/types";
import { hashToken } from "./crypto";
import { db, PLAYER_COLUMNS, SPECTATOR_COLUMNS, type PlayerRow, type RoomRow, type SpectatorRow, T } from "./db";
import { fail } from "./http";
import { enforceExpiredKicks } from "./kicks";

const ROOM_COLUMNS =
  "id, code, name, password_hash, size, lines_to_win, status, round, turn_order, turn_offset, host_player_id, winner_player_id, last_activity_at";

const GONE = `Camera nu există sau a fost închisă după ${minutesLabel(ROOM_IDLE_MINUTES)} de inactivitate.`;

export function normalizeCode(code: string): string {
  const c = decodeURIComponent(code).trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(c)) fail(404, GONE);
  return c;
}

export async function getRoomByCode(code: string): Promise<RoomRow> {
  const { data, error } = await db().from(T.rooms).select(ROOM_COLUMNS).eq("code", normalizeCode(code)).maybeSingle();
  if (error) throw error;
  if (!data) fail(404, GONE);
  const room = data as RoomRow;
  // Lazy expiry: Vercel Hobby has no frequent cron, so idle rooms are closed when touched.
  if (isRoomExpired(room.status, room.last_activity_at)) {
    await db().from(T.rooms).delete().eq("id", room.id).eq("last_activity_at", room.last_activity_at);
    fail(404, GONE);
  }
  return room;
}

/** Deletes every lobby/finished room idle for longer than ROOM_IDLE_MINUTES. */
export async function cleanupExpiredRooms(): Promise<void> {
  const cutoff = new Date(Date.now() - ROOM_IDLE_MINUTES * 60_000).toISOString();
  const { error } = await db().from(T.rooms).delete().in("status", ["lobby", "finished"]).lt("last_activity_at", cutoff);
  if (error) console.error("cleanup failed", error);
}

/**
 * Deletes rooms in ANY status (also "playing") with no activity for ROOM_ABANDONED_MS and no player or
 * spectator seen within it (see isRoomAbandoned). Best effort: a failure is logged, never thrown.
 */
export async function cleanupAbandonedRooms(): Promise<void> {
  const now = Date.now();
  const cutoff = new Date(now - ROOM_ABANDONED_MS).toISOString();
  const { data, error } = await db()
    .from(T.rooms)
    .select(
      "id, last_activity_at, players:classicbingo_players!classicbingo_players_room_id_fkey(last_seen_at), spectators:classicbingo_spectators!classicbingo_spectators_room_id_fkey(last_seen_at)",
    )
    .lt("last_activity_at", cutoff)
    .limit(200);
  if (error) {
    console.error("abandoned cleanup (select) failed", error);
    return;
  }
  type Seen = { last_seen_at: string | null }[] | null;
  const ids = (data ?? [])
    .filter((r) => {
      const seen = [...((r.players as Seen) ?? []), ...((r.spectators as Seen) ?? [])].map((m) => m.last_seen_at);
      return isRoomAbandoned(r.last_activity_at as string, seen, now);
    })
    .map((r) => r.id as string);
  if (ids.length === 0) return;
  // Re-check the activity cutoff in the delete itself, so a room touched meanwhile survives.
  const { error: delError } = await db().from(T.rooms).delete().in("id", ids).lt("last_activity_at", cutoff);
  if (delError) console.error("abandoned cleanup (delete) failed", delError);
}

/** Records activity on a room, restarting its idle timer. */
export async function touchRoom(roomId: string): Promise<void> {
  const { error } = await db().from(T.rooms).update({ last_activity_at: new Date().toISOString() }).eq("id", roomId);
  if (error) throw error;
}

/**
 * Resolves the caller from the x-player-token header and checks they belong to the room.
 * Every member-only route goes through here.
 */
export async function requireMember(req: Request, code: string): Promise<{ room: RoomRow; player: PlayerRow }> {
  const { room, player } = await requireViewer(req, code);
  if (!player) fail(403, "Ești spectator: nu poți face asta. Intră la runda următoare ca să joci.");
  return { room, player };
}

/**
 * Like requireMember, but also lets spectators through (state, leave, queue). Exactly one of
 * `player` / `spectator` is set.
 */
export async function requireViewer(
  req: Request,
  code: string,
): Promise<{ room: RoomRow; player: PlayerRow | null; spectator: SpectatorRow | null }> {
  const token = req.headers.get("x-player-token");
  if (!token || token.length > 200) fail(401, "Nu ești în această cameră.");
  const room = await enforceExpiredKicks(await getRoomByCode(code), code);
  const tokenHash = hashToken(token);
  const { data, error } = await db()
    .from(T.players)
    .select(PLAYER_COLUMNS)
    .eq("token_hash", tokenHash)
    .eq("room_id", room.id)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    const player = data as PlayerRow;
    await touchSeen(T.players, player);
    return { room, player, spectator: null };
  }
  const { data: spec, error: specError } = await db()
    .from(T.spectators)
    .select(SPECTATOR_COLUMNS)
    .eq("token_hash", tokenHash)
    .eq("room_id", room.id)
    .maybeSingle();
  if (specError) throw specError;
  if (!spec) fail(401, "Nu ești în această cameră.");
  const spectator = spec as SpectatorRow;
  await touchSeen(T.spectators, spectator);
  return { room, player: null, spectator };
}

/** Presence heartbeat: stamps last_seen_at at most every LAST_SEEN_TOUCH_MS. Best effort, never throws. */
async function touchSeen(table: string, row: { id: string; last_seen_at: string }): Promise<void> {
  const now = Date.now();
  if (now - Date.parse(row.last_seen_at) < LAST_SEEN_TOUCH_MS) return;
  row.last_seen_at = new Date(now).toISOString();
  const { error } = await db().from(table).update({ last_seen_at: row.last_seen_at }).eq("id", row.id);
  if (error) console.error("presence touch failed", error);
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
    .from(T.players)
    .select(PLAYER_COLUMNS)
    .eq("room_id", roomId)
    .order("seat", { ascending: true })
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlayerRow[];
}

/** Spectators, queued ones first (in queue order), then the rest by arrival. */
export async function listSpectators(roomId: string): Promise<SpectatorRow[]> {
  const { data, error } = await db().from(T.spectators).select(SPECTATOR_COLUMNS).eq("room_id", roomId);
  if (error) throw error;
  const rows = (data ?? []) as SpectatorRow[];
  const at = (r: SpectatorRow) => Date.parse(r.queued_at ?? r.joined_at);
  return rows.sort((a, b) => Number(b.queued_at !== null) - Number(a.queued_at !== null) || at(a) - at(b));
}

export async function listCalled(roomId: string, round: number): Promise<CalledNumber[]> {
  const { data, error } = await db()
    .from(T.calledNumbers)
    .select("seq, number, player_id")
    .eq("room_id", roomId)
    .eq("round", round)
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ seq: r.seq, number: r.number, playerId: r.player_id }));
}

export async function getBoard(playerId: string, round: number): Promise<number[] | null> {
  const { data, error } = await db()
    .from(T.boards)
    .select("cells")
    .eq("player_id", playerId)
    .eq("round", round)
    .maybeSingle();
  if (error) throw error;
  return (data?.cells as number[] | undefined) ?? null;
}

export async function getMarks(playerId: string, round: number): Promise<number[]> {
  const { data, error } = await db().from(T.marks).select("number").eq("player_id", playerId).eq("round", round);
  if (error) throw error;
  return (data ?? []).map((r) => r.number as number);
}

export function turnPlayerId(room: RoomRow, calledCount: number): string | null {
  if (room.status !== "playing" || room.turn_order.length === 0) return null;
  return room.turn_order[currentTurnIndex(calledCount, room.turn_offset, room.turn_order.length)] ?? null;
}

const toPublic = (p: PlayerRow, now: number): PublicPlayer => ({
  id: p.id,
  nickname: p.nickname,
  isHost: p.is_host,
  ready: p.ready,
  kickRemainingMs: kickRemainingMs(p.kick_requested_at, now),
  connected: isConnected(p.last_seen_at, now),
});

/** All boards and marks of a round. Only ever sent to clients once the game is finished. */
async function revealRound(roomId: string, round: number): Promise<RevealedBoard[]> {
  const [boards, marks] = await Promise.all([
    db().from(T.boards).select("player_id, cells").eq("room_id", roomId).eq("round", round),
    db().from(T.marks).select("player_id, number").eq("room_id", roomId).eq("round", round),
  ]);
  if (boards.error) throw boards.error;
  if (marks.error) throw marks.error;
  return (boards.data ?? []).map((b) => ({
    playerId: b.player_id as string,
    board: b.cells as number[],
    marks: (marks.data ?? []).filter((m) => m.player_id === b.player_id).map((m) => m.number as number),
  }));
}

const toPublicSpectator = (s: SpectatorRow, now: number): PublicSpectator => ({
  id: s.id,
  nickname: s.nickname,
  queued: s.queued_at !== null,
  connected: isConnected(s.last_seen_at, now),
});

/**
 * State for a viewer. A spectator gets the public part only: no board, no marks, no hints; the reveal of all
 * boards exists only once the round is finished (the same moment the players get it).
 */
export async function buildState(room: RoomRow, viewer: PlayerRow | SpectatorRow): Promise<RoomState> {
  const now = Date.now();
  const me = "seat" in viewer ? viewer : null;
  const spec = "seat" in viewer ? null : viewer;
  const [players, spectators, called, board, marks, reveal] = await Promise.all([
    listPlayers(room.id),
    listSpectators(room.id),
    listCalled(room.id, room.round),
    me ? getBoard(me.id, room.round) : Promise.resolve(null),
    me ? getMarks(me.id, room.round) : Promise.resolve([] as number[]),
    room.status === "finished" ? revealRound(room.id, room.round) : Promise.resolve(null),
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
    players: ordered.map((p) => toPublic(p, now)),
    spectators: spectators.map((s) => toPublicSpectator(s, now)),
    role: me ? "player" : "spectator",
    queued: spec ? spec.queued_at !== null : false,
    me: me
      ? toPublic(me, now)
      : { id: viewer.id, nickname: viewer.nickname, isHost: false, ready: false, kickRemainingMs: null, connected: true },
    board,
    marks,
    called,
    hintsLeft: me ? Math.max(0, hintsPerRound(room.size) - (me.hints_used ?? 0)) : 0,
    reveal,
  };
}
