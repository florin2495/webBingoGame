"use client";

import type { Session } from "@/lib/types";

const key = (code: string) => `bingo:session:${code.toUpperCase()}`;

// In-memory fallback when localStorage is unavailable (private mode, blocked storage).
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

/** For useSyncExternalStore: fires on writes in this tab and on `storage` events from other tabs. */
export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Raw stored string - a stable snapshot value for useSyncExternalStore. */
export function readSessionRaw(code: string): string | null {
  try {
    return localStorage.getItem(key(code)) ?? memory.get(key(code)) ?? null;
  } catch {
    return memory.get(key(code)) ?? null;
  }
}

export function parseSession(raw: string | null | undefined): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return typeof s.token === "string" && typeof s.playerId === "string" ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: Session) {
  const value = JSON.stringify(session);
  memory.set(key(code), value);
  try {
    localStorage.setItem(key(code), value);
  } catch {
    // memory fallback already set
  }
  listeners.forEach((l) => l());
}

export function clearSession(code: string) {
  memory.delete(key(code));
  try {
    localStorage.removeItem(key(code));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = { ok: true }>(
  path: string,
  opts: { token?: string; body?: unknown; method?: "GET" | "POST" } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["x-player-token"] = opts.token;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError(0, "Nu am conexiune la server.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(res.status, data.error ?? `Eroare ${res.status}`);
  return data as T;
}
