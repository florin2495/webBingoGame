import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  joined_at: string;
}

export const PLAYER_COLUMNS = "id, room_id, nickname, is_host, ready, hints_used, joined_at";
