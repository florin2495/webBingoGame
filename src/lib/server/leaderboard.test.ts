import { describe, expect, it, vi } from "vitest";
import type { RoomRow } from "./db";
import { isTestRoom, playerKey, reportRound } from "./leaderboard";

const h = vi.hoisted(() => ({ db: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: h.db, PLAYER_COLUMNS: "id", T: { players: "classicbingo_players" } }));

describe("isTestRoom", () => {
  it("matches the rooms of scripts/e2e.mjs and tests/ui", () => {
    expect(isTestRoom("e2e-test-abc123")).toBe(true);
    expect(isTestRoom("e2e-test-ui-abc123")).toBe(true);
  });
  it("does not match real rooms", () => {
    expect(isTestRoom("Seara de bingo")).toBe(false);
    expect(isTestRoom("my e2e-test-room")).toBe(false);
    expect(isTestRoom("E2E-TEST-x")).toBe(false);
    expect(isTestRoom("")).toBe(false);
  });
});

describe("reportRound", () => {
  it("never touches the leaderboard for a test room", async () => {
    const room = { code: "ABCDEF", name: "e2e-test-xyz", round: 1 } as RoomRow;
    await reportRound(room, ["a", "b"], ["a"]);
    expect(h.db).not.toHaveBeenCalled();
  });
});

describe("playerKey", () => {
  it("trims and lowercases the nickname", () => {
    expect(playerKey("  Ana ")).toBe("ana");
  });
});
