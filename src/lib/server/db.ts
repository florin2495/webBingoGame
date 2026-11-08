import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Table names. The Supabase project is shared by several mini-games (the hub),
 * so every ClassicBingo table carries the classicbingo_ prefix (migration 004).
 */
export const T = {
  rooms: "classicbingo_rooms",
  players: "classicbingo_players",
  boards: "classicbingo_boards",
  calledNumbers: "classicbingo_called_numbers",
  marks: "classicbingo_marks",
  spectators: "classicbingo_spectators",
} as const;

let admin: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS - must never be imported from client code. */
export function db(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export interface RoomRow {
  id: string;
  code: string;
  name: string;
  password_hash: string | null;
  size: number;
  lines_to_win: number;
  status: "lobby" | "playing" | "finished";
  round: number;
  turn_order: string[];
  turn_offset: number;
  host_player_id: string | null;
  winner_player_id: string | null;
  last_activity_at: string;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  nickname: string;
  is_host: boolean;
  ready: boolean;
  hints_used: number;
  kick_requested_at: string | null;
  joined_at: string;
  /** Presence stamp, touched by requireMember. Needs migration 006_reconnect.sql. */
  last_seen_at: string;
  /** Play order, lowest first (migration 008). */
  seat: number;
}

/** A viewer of a room that was already running (migration 008). */
export interface SpectatorRow {
  id: string;
  room_id: string;
  nickname: string;
  queued_at: string | null;
  joined_at: string;
  last_seen_at: string;
}

/** Never add token_hash / device_hash here: these rows feed the public state. */
export const PLAYER_COLUMNS = "id, room_id, nickname, is_host, ready, hints_used, kick_requested_at, joined_at, last_seen_at, seat";
export const SPECTATOR_COLUMNS = "id, room_id, nickname, queued_at, joined_at, last_seen_at";
