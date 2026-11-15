import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_ABANDONED_MS } from "@/lib/game";
import { cleanupAbandonedRooms } from "./room";

// cleanupAbandonedRooms with the Supabase client mocked: every query is recorded, selects answer h.selectResult,
// deletes answer h.deleteResult.
type Recorded = { table: string; calls: [string, unknown[]][] };
type Result = { data?: unknown; error: unknown };

const h = vi.hoisted(() => ({
  queries: [] as { table: string; calls: [string, unknown[]][] }[],
  selectResult: { data: [], error: null } as { data?: unknown; error: unknown },
  deleteResult: { error: null } as { data?: unknown; error: unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("./kicks", () => ({ enforceExpiredKicks: vi.fn() }));
vi.mock("./db", () => {
  const methods = ["select", "delete", "update", "insert", "eq", "in", "lt", "limit", "order", "maybeSingle", "single"];
  const fakeQuery = (table: string) => {
    const entry = { table, calls: [] as [string, unknown[]][] };
    h.queries.push(entry);
    const q: Record<string, unknown> = {};
    for (const m of methods) {
      q[m] = (...args: unknown[]) => {
        entry.calls.push([m, args]);
        return q;
      };
    }
    q.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(entry.calls.some(([m]) => m === "delete") ? h.deleteResult : h.selectResult).then(resolve, reject);
    return q;
  };
  return {
    T: { rooms: "classicbingo_rooms", players: "classicbingo_players", spectators: "classicbingo_spectators" },
    PLAYER_COLUMNS: "id",
    SPECTATOR_COLUMNS: "id",
    db: () => ({ from: fakeQuery }),
  };
});

const NOW = Date.parse("2026-11-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const CUTOFF = ago(ROOM_ABANDONED_MS);
const OLD = ago(ROOM_ABANDONED_MS + 60_000);

const room = (id: string, players: (string | null)[], spectators: (string | null)[] = []) => ({
  id,
  last_activity_at: OLD,
  players: players.map((last_seen_at) => ({ last_seen_at })),
  spectators: spectators.map((last_seen_at) => ({ last_seen_at })),
});
const deletes = (): Recorded[] => h.queries.filter((q) => q.calls.some(([m]) => m === "delete"));
const call = (q: Recorded, method: string) => q.calls.find(([m]) => m === method)?.[1];

beforeEach(() => {
  h.queries.length = 0;
  h.selectResult = { data: [], error: null };
  h.deleteResult = { error: null };
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("cleanupAbandonedRooms", () => {
  it("selects only rooms idle for longer than ROOM_ABANDONED_MS", async () => {
    await cleanupAbandonedRooms();
    expect(h.queries[0].table).toBe("classicbingo_rooms");
    expect(call(h.queries[0], "lt")).toEqual(["last_activity_at", CUTOFF]);
    expect(deletes()).toHaveLength(0);
  });

  it("keeps a room with a recently seen player or spectator", async () => {
    h.selectResult = {
      data: [room("p", [OLD, ago(30_000)]), room("s", [OLD], [ago(ROOM_ABANDONED_MS - 1_000)])],
      error: null,
    };
    await cleanupAbandonedRooms();
    expect(deletes()).toHaveLength(0);
  });

  it("deletes only the silent rooms, re-checking the activity cutoff in the delete", async () => {
    h.selectResult = {
      data: [room("silent", [OLD, null], [OLD]), room("empty", []), room("live", [ago(5_000)])],
      error: null,
    };
    await cleanupAbandonedRooms();
    const del = deletes();
    expect(del).toHaveLength(1);
    expect(del[0].table).toBe("classicbingo_rooms");
    expect(call(del[0], "in")).toEqual(["id", ["silent", "empty"]]);
    expect(call(del[0], "lt")).toEqual(["last_activity_at", CUTOFF]);
  });

  it("logs a select error instead of throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.selectResult = { data: null, error: { message: "boom" } };
    await expect(cleanupAbandonedRooms()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });

  it("logs a delete error instead of throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.selectResult = { data: [room("silent", [OLD])], error: null };
    h.deleteResult = { error: { message: "boom" } };
    await expect(cleanupAbandonedRooms()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    expect(deletes()).toHaveLength(1);
  });
});
