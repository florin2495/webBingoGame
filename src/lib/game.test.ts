import { describe, expect, it } from "vitest";
import {
  allLines,
  countMarkedLines,
  isRoomExpired,
  roundTurnOrder,
  countValidLines,
  currentTurnIndex,
  generateBoard,
  isValidBoard,
  isValidLinesToWin,
  isValidSize,
} from "./game";

describe("size / lines settings", () => {
  it("accepts N in 3..10 only", () => {
    expect(isValidSize(3)).toBe(true);
    expect(isValidSize(10)).toBe(true);
    expect(isValidSize(2)).toBe(false);
    expect(isValidSize(11)).toBe(false);
    expect(isValidSize(7.5)).toBe(false);
    expect(isValidSize("7")).toBe(false);
  });
  it("accepts L in 1..3 only", () => {
    expect(isValidLinesToWin(1)).toBe(true);
    expect(isValidLinesToWin(3)).toBe(true);
    expect(isValidLinesToWin(0)).toBe(false);
    expect(isValidLinesToWin(4)).toBe(false);
  });
});

describe("boards", () => {
  it("generates a valid permutation for every N", () => {
    for (let n = 3; n <= 10; n++) expect(isValidBoard(generateBoard(n), n)).toBe(true);
  });
  it("rejects duplicates, gaps, wrong length and out-of-range values", () => {
    expect(isValidBoard([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toBe(true);
    expect(isValidBoard([1, 1, 3, 4, 5, 6, 7, 8, 9], 3)).toBe(false);
    expect(isValidBoard([1, 2, 3, 4, 5, 6, 7, 8], 3)).toBe(false);
    expect(isValidBoard([0, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toBe(false);
    expect(isValidBoard([10, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toBe(false);
    expect(isValidBoard([1.5, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toBe(false);
    expect(isValidBoard("123456789", 3)).toBe(false);
  });
});

describe("lines", () => {
  it("has 2N+2 lines", () => {
    expect(allLines(3)).toHaveLength(8);
    expect(allLines(7)).toHaveLength(16);
  });

  // 1 2 3
  // 4 5 6
  // 7 8 9
  const board = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  it("counts a row, a column and a diagonal", () => {
    const all = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(countValidLines(board, 3, new Set([1, 2, 3]), all)).toBe(1); // row
    expect(countValidLines(board, 3, new Set([1, 4, 7]), all)).toBe(1); // column
    expect(countValidLines(board, 3, new Set([3, 5, 7]), all)).toBe(1); // anti-diagonal
    expect(countValidLines(board, 3, new Set([1, 2, 3, 5, 9]), all)).toBe(2); // row + diagonal
    expect(countValidLines(board, 3, all, all)).toBe(8);
  });

  it("does not count a line containing a marked but uncalled number", () => {
    const marked = new Set([1, 2, 3]);
    expect(countValidLines(board, 3, marked, new Set([1, 2]))).toBe(0);
  });

  it("does not count called but unmarked numbers (marking is manual)", () => {
    expect(countValidLines(board, 3, new Set([1, 2]), new Set([1, 2, 3]))).toBe(0);
  });
});

describe("turns", () => {
  it("rotates through players and honours skips", () => {
    expect(currentTurnIndex(0, 0, 3)).toBe(0);
    expect(currentTurnIndex(1, 0, 3)).toBe(1);
    expect(currentTurnIndex(3, 0, 3)).toBe(0);
    expect(currentTurnIndex(1, 1, 3)).toBe(2);
    expect(currentTurnIndex(0, 0, 0)).toBe(-1);
  });
});

describe("round turn order", () => {
  const ids = ["host", "b", "c"];
  it("round 1 starts with the host, then join order", () => {
    expect(roundTurnOrder(ids, "host", 1)).toEqual(["host", "b", "c"]);
  });
  it("rotates the first caller every round", () => {
    expect(roundTurnOrder(ids, "host", 2)).toEqual(["b", "c", "host"]);
    expect(roundTurnOrder(ids, "host", 3)).toEqual(["c", "host", "b"]);
    expect(roundTurnOrder(ids, "host", 4)).toEqual(["host", "b", "c"]);
  });
  it("puts the host first even if not first in join order", () => {
    expect(roundTurnOrder(["b", "host", "c"], "host", 1)).toEqual(["host", "b", "c"]);
  });
});

describe("room expiry", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  it("expires idle lobby and finished rooms after 60 minutes", () => {
    expect(isRoomExpired("lobby", "2026-11-06T10:59:00Z", now)).toBe(true);
    expect(isRoomExpired("finished", "2026-11-06T10:59:00Z", now)).toBe(true);
    expect(isRoomExpired("lobby", "2026-11-06T11:01:00Z", now)).toBe(false);
  });
  it("never expires a game in progress", () => {
    expect(isRoomExpired("playing", "2026-11-05T00:00:00Z", now)).toBe(false);
  });
});

describe("marked lines (sound cue)", () => {
  it("counts lines regardless of called numbers", () => {
    expect(countMarkedLines([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, new Set([1, 2, 3]))).toBe(1);
    expect(countMarkedLines([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, new Set([1, 2]))).toBe(0);
  });
});
