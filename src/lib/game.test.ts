import { describe, expect, it } from "vitest";
import {
  allLines,
  countMarkedLines,
  isRoomAbandoned,
  isRoomExpired,
  minutesLabel,
  ROOM_ABANDONED_MS,
  ROOM_IDLE_MINUTES,
  rotateSeats,
  isPermutationOf,
  promotable,
  turnAfterLeave,
  countValidLines,
  currentTurnIndex,
  generateBoard,
  HINTS_MAX,
  hintsPerRound,
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

describe("seats", () => {
  it("rotateSeats moves the first player to the end, so the starter changes every round", () => {
    expect(rotateSeats(["a", "b", "c"])).toEqual(["b", "c", "a"]);
    expect(rotateSeats(rotateSeats(rotateSeats(["a", "b", "c"])))).toEqual(["a", "b", "c"]);
    expect(rotateSeats(["a"])).toEqual(["a"]);
    expect(rotateSeats([])).toEqual([]);
  });
  it("isPermutationOf accepts only a full reordering", () => {
    const ids = ["a", "b", "c"];
    expect(isPermutationOf(["c", "a", "b"], ids)).toBe(true);
    expect(isPermutationOf(["a", "b"], ids)).toBe(false);
    expect(isPermutationOf(["a", "a", "b"], ids)).toBe(false);
    expect(isPermutationOf(["a", "b", "x"], ids)).toBe(false);
    expect(isPermutationOf(["a", "b", 3], ids)).toBe(false);
    expect(isPermutationOf("abc", ids)).toBe(false);
  });
  it("promotable takes the queue in order, as many as there are free seats", () => {
    expect(promotable(["q1", "q2", "q3"], 10)).toEqual(["q1", "q2"]);
    expect(promotable(["q1", "q2"], 12)).toEqual([]);
    expect(promotable(["q1"], 3)).toEqual(["q1"]);
  });
});

describe("room expiry", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  it(`expires idle lobby and finished rooms after ${ROOM_IDLE_MINUTES} minutes`, () => {
    expect(isRoomExpired("lobby", ago(ROOM_IDLE_MINUTES + 0.5), now)).toBe(true);
    expect(isRoomExpired("finished", ago(ROOM_IDLE_MINUTES + 0.5), now)).toBe(true);
    expect(isRoomExpired("lobby", ago(ROOM_IDLE_MINUTES - 0.5), now)).toBe(false);
  });
  it("labels minutes in Romanian", () => {
    expect(minutesLabel(2)).toBe("2 minute");
    expect(minutesLabel(10)).toBe("10 minute");
    expect(minutesLabel(60)).toBe("60 de minute");
    expect(minutesLabel(1)).toBe("1 minut");
  });
  it("never expires a game in progress", () => {
    expect(isRoomExpired("playing", "2026-11-05T00:00:00Z", now)).toBe(false);
  });
});

describe("abandoned rooms (any status)", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const sec = (s: number) => new Date(now - s * 1000).toISOString();
  it(`is abandoned after ${ROOM_ABANDONED_MS / 1000} s with nobody seen`, () => {
    expect(isRoomAbandoned(sec(121), [sec(300), sec(200)], now)).toBe(true);
    expect(isRoomAbandoned(sec(121), [], now)).toBe(true);
    expect(isRoomAbandoned(sec(121), [null], now)).toBe(true);
  });
  it("is kept while the last activity is recent", () => {
    expect(isRoomAbandoned(sec(119), [], now)).toBe(false);
  });
  it("is kept while any player or spectator was seen recently", () => {
    expect(isRoomAbandoned(sec(600), [sec(600), sec(30)], now)).toBe(false);
  });
});

describe("marked lines (sound cue)", () => {
  it("counts lines regardless of called numbers", () => {
    expect(countMarkedLines([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, new Set([1, 2, 3]))).toBe(1);
    expect(countMarkedLines([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, new Set([1, 2]))).toBe(0);
  });
});

describe("leaving a running game", () => {
  const order = ["a", "b", "c", "d"];
  const turnOf = (r: { order: string[]; offset: number }, called: number) =>
    r.order[currentTurnIndex(called, r.offset, r.order.length)];

  it("keeps the turn with the current player when someone else leaves", () => {
    // 5 called, offset 0 -> index 1 -> "b" has the turn
    const r = turnAfterLeave(order, 0, 5, "d");
    expect(r.currentId).toBe("b");
    expect(turnOf(r, 5)).toBe("b");
    expect(turnOf(r, 6)).toBe("c"); // then continues in order
    expect(turnOf(r, 7)).toBe("a");
  });

  it("passes the turn to the next player when the current one leaves", () => {
    const r = turnAfterLeave(order, 0, 5, "b");
    expect(r.order).toEqual(["a", "c", "d"]);
    expect(turnOf(r, 5)).toBe("c");
  });

  it("wraps around when the last player in order leaves on their turn", () => {
    const r = turnAfterLeave(order, 0, 3, "d");
    expect(turnOf(r, 3)).toBe("a");
  });

  it("honours an existing skip offset", () => {
    const r = turnAfterLeave(order, 2, 1, "a"); // index 3 -> "d" has the turn
    expect(turnOf(r, 1)).toBe("d");
  });

  it("returns an empty order when nobody is left", () => {
    expect(turnAfterLeave(["a"], 0, 0, "a")).toEqual({ order: [], offset: 0, currentId: null });
  });
});

describe("hintsPerRound", () => {
  it("is 5 up to 7x7 and grows on 8x8 (15), 9x9 (20), 10x10 (25)", () => {
    for (const n of [3, 4, 5, 6, 7]) expect(hintsPerRound(n)).toBe(5);
    expect(hintsPerRound(8)).toBe(15);
    expect(hintsPerRound(9)).toBe(20);
    expect(hintsPerRound(10)).toBe(25);
    expect(hintsPerRound(10)).toBe(HINTS_MAX);
  });
});
