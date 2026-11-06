// Pure game rules - shared by server and client, no I/O.

export const SIZE_MIN = 3;
export const SIZE_MAX = 10;
export const SIZE_DEFAULT = 7;
export const LINES_MIN = 1;
export const LINES_MAX = 3;
export const MIN_PLAYERS_TO_START = 2;
export const NICKNAME_MAX = 10;
/**
 * Lobby/finished rooms are closed (deleted) after this long without activity. Activity includes
 * presence: every open room page polls /state, which refreshes the timer (see PRESENCE_TOUCH_MS),
 * so a room only closes once nobody has it open.
 */
export const ROOM_IDLE_MINUTES = 2;
/** /state refreshes last_activity_at at most this often, to keep DB writes low. */
export const PRESENCE_TOUCH_MS = 20_000;

/** "2 minute" / "60 de minute" (Romanian numeral agreement). */
export function minutesLabel(n: number): string {
  return `${n} ${n >= 20 ? "de " : ""}${n === 1 ? "minut" : "minute"}`;
}
export const HINTS_PER_ROUND = 5;
export const HINT_HIGHLIGHT_MS = 5000;

export function isRoomExpired(status: string, lastActivityAt: string | Date, now = Date.now()): boolean {
  if (status !== "lobby" && status !== "finished") return false;
  return now - new Date(lastActivityAt).getTime() > ROOM_IDLE_MINUTES * 60_000;
}

/**
 * Turn order for a round: host first, then everyone else in join order,
 * rotated so round 1 starts with the host, round 2 with the next player, etc.
 */
export function roundTurnOrder(playerIdsByJoin: string[], hostId: string | null, round: number): string[] {
  const base = hostId && playerIdsByJoin.includes(hostId)
    ? [hostId, ...playerIdsByJoin.filter((id) => id !== hostId)]
    : [...playerIdsByJoin];
  if (base.length === 0) return base;
  const shift = (((round - 1) % base.length) + base.length) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
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
