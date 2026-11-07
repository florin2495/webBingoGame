"use client";

import type { Session } from "@/lib/types";

const SESSION_PREFIX = "bingo:session:";
const DEVICE_KEY = "bingo:device";
const key = (code: string) => `${SESSION_PREFIX}${code.toUpperCase()}`;

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

/** Every room this browser holds a session for (localStorage plus the memory fallback). */
export function listSessions(): { code: string; session: Session }[] {
  const keys = new Set(memory.keys());
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.add(k);
    }
  } catch {
    // memory only
  }
  const out: { code: string; session: Session }[] = [];
  for (const k of keys) {
    if (!k.startsWith(SESSION_PREFIX)) continue;
    const code = k.slice(SESSION_PREFIX.length);
    const session = parseSession(readSessionRaw(code));
    if (session) out.push({ code, session });
  }
  return out;
}

function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context (plain-http LAN dev); build a v4 UUID by hand.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Stable random id of this browser, sent on create/join so the same device can reclaim its seat. */
export function deviceId(): string {
  let id: string | null | undefined = memory.get(DEVICE_KEY);
  try {
    id = localStorage.getItem(DEVICE_KEY) ?? id;
  } catch {
    // memory fallback
  }
  if (!id) {
    id = randomUuid();
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      // memory fallback below
    }
  }
  memory.set(DEVICE_KEY, id);
  return id;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Base path of this zone ("/classicbingo"); fetch() does not apply Next's basePath. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix a root-relative URL ("/api/...") with the base path. */
export function withBase(path: string): string {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
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
    res = await fetch(withBase(path), {
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
