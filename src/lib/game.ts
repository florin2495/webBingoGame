// Pure game rules - shared by server and client, no I/O.

export const SIZE_MIN = 3;
export const SIZE_MAX = 10;
export const SIZE_DEFAULT = 7;
export const LINES_MIN = 1;
export const LINES_MAX = 3;
export const MIN_PLAYERS_TO_START = 2;
export const NICKNAME_MAX = 10;
export const MAX_PLAYERS = 12;
export const MAX_SPECTATORS = 16;
/**
 * Lobby/finished rooms are closed (deleted) after this long without activity. Activity includes
 * presence: every open room page polls /state, which refreshes the timer (see PRESENCE_TOUCH_MS),
 * so a room only closes once nobody has it open.
 */
export const ROOM_IDLE_MINUTES = 10;
/** /state refreshes last_activity_at at most this often, to keep DB writes low. */
export const PRESENCE_TOUCH_MS = 20_000;

/** "2 minute" / "60 de minute" (Romanian numeral agreement). */
export function minutesLabel(n: number): string {
  return `${n} ${n >= 20 ? "de " : ""}${n === 1 ? "minut" : "minute"}`;
}
/** "Show" hints per round: 5, more on big grids (8x8: 15, 9x9: 20, 10x10: 25). Max = HINTS_MAX (DB check, migration 007). */
export const HINTS_MAX = 25;
export function hintsPerRound(size: number): number {
  return size >= 8 ? (size - 8) * 5 + 15 : 5;
}
export const HINT_HIGHLIGHT_MS = 5000;

export function isRoomExpired(status: string, lastActivityAt: string | Date, now = Date.now()): boolean {
  if (status !== "lobby" && status !== "finished") return false;
  return now - new Date(lastActivityAt).getTime() > ROOM_IDLE_MINUTES * 60_000;
}

/**
 * Play order for the next round = the seat order (lowest seat first, ties by join time; the caller sorts).
 * Round 1: host first, then join order (the host sits at seat 0) unless the host reorders. At every
 * new round the seats rotate one step (see rotateSeats), so the first caller changes unless reordered.
 */
export function rotateSeats(idsBySeat: string[]): string[] {
  return idsBySeat.length < 2 ? [...idsBySeat] : [...idsBySeat.slice(1), idsBySeat[0]];
}

/** True iff `order` is a permutation of `ids` (same ids, each once). */
export function isPermutationOf(order: unknown, ids: readonly string[]): order is string[] {
  if (!Array.isArray(order) || order.length !== ids.length) return false;
  const want = new Set(ids);
  const seen = new Set<string>();
  for (const id of order) {
    if (typeof id !== "string" || !want.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/** Queued spectators (oldest first) that fit in the free seats. `queue` is already ordered by queue time. */
export function promotable<T>(queue: readonly T[], playerCount: number, maxPlayers = MAX_PLAYERS): T[] {
  return queue.slice(0, Math.max(0, maxPlayers - playerCount));
}

export function isValidSize(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= SIZE_MIN && (n as number) <= SIZE_MAX;
}

export function isValidLinesToWin(l: unknown): l is number {
  return Number.isInteger(l) && (l as number) >= LINES_MIN && (l as number) <= LINES_MAX;
}

/** Fisher-Yates shuffle of 1..n*n, row-major. `random` is injectable for tests. */
export function generateBoard(n: number, random: () => number = Math.random): number[] {
  const cells = Array.from({ length: n * n }, (_, i) => i + 1);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

/** True iff `cells` contains exactly the integers 1..n*n, each once. */
export function isValidBoard(cells: unknown, n: number): cells is number[] {
  if (!Array.isArray(cells) || cells.length !== n * n) return false;
  const seen = new Set<number>();
  for (const c of cells) {
    if (!Number.isInteger(c) || c < 1 || c > n * n || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}

/** All lines of an n x n grid as lists of cell indexes: rows, columns, 2 main diagonals. */
export function allLines(n: number): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  lines.push(Array.from({ length: n }, (_, i) => i * n + i));
  lines.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
  return lines;
}

/**
 * Number of lines where every cell is marked by the player AND was really called.
 * A line containing a falsely marked (not called) number does not count.
 */
export function countValidLines(
  cells: number[],
  n: number,
  marked: ReadonlySet<number>,
  called: ReadonlySet<number>,
): number {
  return allLines(n).filter((line) =>
    line.every((idx) => marked.has(cells[idx]) && called.has(cells[idx])),
  ).length;
}

/** Lines fully marked by the player, regardless of whether the numbers were called (used for the sound cue). */
export function countMarkedLines(cells: number[], n: number, marked: ReadonlySet<number>): number {
  return allLines(n).filter((line) => line.every((idx) => marked.has(cells[idx]))).length;
}

/**
 * Turn order after `leavingId` leaves a running game. Whoever had the turn keeps it;
 * if the leaver had it, it passes to the next player in the old order. The new offset
 * makes currentTurnIndex(calledCount, offset, newOrder.length) point at that player.
 */
export function turnAfterLeave(
  order: string[],
  offset: number,
  calledCount: number,
  leavingId: string,
): { order: string[]; offset: number; currentId: string | null } {
  const newOrder = order.filter((id) => id !== leavingId);
  if (newOrder.length === 0) return { order: newOrder, offset: 0, currentId: null };

  let currentId: string | null = order.length ? order[currentTurnIndex(calledCount, offset, order.length)] : null;
  if (currentId === leavingId || currentId === null) {
    const i = order.indexOf(leavingId);
    const after = [...order.slice(i + 1), ...order.slice(0, i)];
    currentId = after.find((id) => newOrder.includes(id)) ?? newOrder[0];
  }
  const target = newOrder.indexOf(currentId);
  const len = newOrder.length;
  return { order: newOrder, offset: (((target - calledCount) % len) + len) % len, currentId };
}

/** Index into turn_order of the player whose turn it is. */
export function currentTurnIndex(calledCount: number, turnOffset: number, playerCount: number): number {
  if (playerCount <= 0) return -1;
  return (((calledCount + turnOffset) % playerCount) + playerCount) % playerCount;
}
