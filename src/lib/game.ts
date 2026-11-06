// Pure game rules - shared by server and client, no I/O.

export const SIZE_MIN = 3;
export const SIZE_MAX = 10;
export const SIZE_DEFAULT = 7;
export const LINES_MIN = 1;
export const LINES_MAX = 3;
export const MIN_PLAYERS_TO_START = 2;

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

/** Index into turn_order of the player whose turn it is. */
export function currentTurnIndex(calledCount: number, turnOffset: number, playerCount: number): number {
  if (playerCount <= 0) return -1;
  return (((calledCount + turnOffset) % playerCount) + playerCount) % playerCount;
}
