// Shared steps for the Playwright UI tests (tests/ui/*.e2e.ts). Not a test file itself (no .e2e.ts suffix).
// Rooms are named "e2e-test-ui-…"; a leftover is deleted with the service key (env) as a safety net.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** A change has to show up on another screen within this, without a reload. Polling alone takes up to 15 s. */
export const REALTIME_MS = 5_000;

export interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
  board: number[];
}

/** Rows, columns and the 2 diagonals of an n x n grid (cell indexes). */
function allLines(n: number): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  lines.push(Array.from({ length: n }, (_, i) => i * n + i));
  lines.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
  return lines;
}
const linesDone = (board: number[], size: number, called: Set<number>) =>
  allLines(size).filter((l) => l.every((i) => called.has(board[i]))).length;

/** A separate browser context = a separate device (own localStorage session), with the project's device settings. */
export async function newPlayer(browser: Browser, name: string): Promise<Player> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    locale: use.locale,
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  return { name, context, page: await context.newPage(), board: [] };
}

export const cell = (p: Player, n: number) =>
  p.page.getByTestId("my-board").getByRole("button", { name: `Numărul ${n}`, exact: true });
export const calledItem = (p: Player, n: number) => p.page.getByTestId("called-list").locator(`li[data-number="${n}"]`);

export async function readBoard(p: Player, size: number): Promise<number[]> {
  const cells = p.page.getByTestId("my-board").getByRole("button");
  await expect(cells).toHaveCount(size * size);
  return (await cells.allTextContents()).map(Number);
}

/** Host creates a room from the home page; returns its code. */
export async function createRoom(host: Player, size: number): Promise<string> {
  const page = host.page;
  await page.goto("./");
  await page.getByLabel("Numele camerei").fill(`e2e-test-ui-${Date.now().toString(36)}`);
  await page.getByLabel("Nickname-ul tău").fill(host.name);
  await page.getByLabel("Matrice N×N").selectOption(String(size));
  await page.getByLabel("Linii pentru câștig").selectOption("1");
  await page.getByTestId("home-submit").click();
  await page.waitForURL(/\/room\/[A-Z2-9]{6}$/);
  await expect(page.getByTestId("generate-board")).toBeVisible();
  return page.url().match(/\/room\/([A-Z2-9]{6})$/)![1];
}

/** Opens the invite link and joins with the player's nickname (lands in the lobby or as a spectator). */
export async function joinRoom(p: Player, code: string): Promise<void> {
  await p.page.goto(`room/${code}`);
  await p.page.getByLabel("Nickname-ul tău").fill(p.name);
  await p.page.getByTestId("join-submit").click();
  await expect(p.page.getByTestId("join-submit")).toBeHidden();
}

/** Every player generates a board and gets ready, then the host (players[0]) starts. */
export async function prepareAndStart(players: Player[], size: number): Promise<void> {
  for (const p of players) {
    await p.page.getByTestId("generate-board").click();
    p.board = await readBoard(p, size);
    expect(new Set(p.board).size).toBe(size * size);
    await p.page.getByTestId("ready").click();
    await expect(p.page.getByText("Blocată · ready")).toBeVisible();
  }
  const host = players[0];
  await expect(host.page.getByTestId("start-game")).toBeEnabled({ timeout: REALTIME_MS });
  await host.page.getByTestId("start-game").click();
  await expect(host.page.getByTestId("turn-badge")).toHaveText("Tura ta");
  for (const p of players.slice(1)) {
    await expect(p.page.getByTestId("turn-badge")).toContainText(`Tura lui ${host.name}`, { timeout: REALTIME_MS });
  }
}

/** Calls `n` on the caller's screen (their turn) and waits for the server to accept it. */
export async function callNumber(caller: Player, code: string, n: number): Promise<void> {
  await expect(caller.page.getByTestId("turn-badge")).toHaveText("Tura ta", { timeout: REALTIME_MS });
  await Promise.all([
    caller.page.waitForResponse((r) => r.url().endsWith(`/api/rooms/${code}/call`) && r.ok()),
    cell(caller, n).click(),
  ]);
  await expect(cell(caller, n)).toHaveAttribute("data-state", "mine");
}

/**
 * Plays round-robin (players in seat order) until someone validates a line. Every call must reach the other
 * players live; they tick it. `watchers` (spectators) must see every call live too. Returns the winner.
 */
export async function playToWin(players: Player[], size: number, code: string, watchers: Player[] = []): Promise<Player> {
  const called = new Set<number>();
  let turn = 0;
  while (called.size < size * size) {
    const caller = players[turn % players.length];
    const pick = caller.board
      .filter((x) => !called.has(x))
      .sort((x, y) => linesDone(caller.board, size, new Set([...called, y])) - linesDone(caller.board, size, new Set([...called, x])))[0];
    await callNumber(caller, code, pick);
    called.add(pick);

    for (const w of watchers) await expect(calledItem(w, pick)).toBeVisible({ timeout: REALTIME_MS });
    for (const other of players.filter((p) => p !== caller)) {
      await expect(calledItem(other, pick)).toBeVisible({ timeout: REALTIME_MS });
      await Promise.all([
        other.page.waitForResponse((r) => r.url().endsWith(`/api/rooms/${code}/mark`) && r.ok()),
        cell(other, pick).click(),
      ]);
      await expect(cell(other, pick)).toHaveAttribute("data-state", "marked");
    }

    for (const p of [caller, ...players.filter((x) => x !== caller)]) {
      if (linesDone(p.board, size, called) === 0) continue;
      await p.page.getByTestId("validate").click();
      await expect(p.page.getByRole("dialog", { name: "Câștigător" })).toBeVisible();
      return p;
    }
    turn++;
  }
  throw new Error("every number was called and nobody won");
}

/** Leaves through the "Părăsește" button (accepting the confirm), in the given order. */
export async function leaveAll(players: Player[]): Promise<void> {
  for (const p of players) {
    p.page.once("dialog", (d) => void d.accept());
    await p.page.getByTestId("leave").click();
    await expect(p.page.getByTestId("home-submit")).toBeVisible();
  }
}

/** The page must not scroll sideways (the usual mobile layout bug). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
}

/** Safety net: delete the room straight in the DB if the UI flow did not close it. */
export async function deleteRoom(code: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`cleanup: no Supabase env, delete room ${code} by hand if it is still there`);
    return;
  }
  const res = await fetch(`${url}/rest/v1/classicbingo_rooms?code=eq.${code}&name=like.e2e-test-ui-*`, {
    method: "DELETE",
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  console.log(`cleanup: room ${code} delete = ${res.status}`);
}

/** Runs `body` with fresh players; always closes their browsers and deletes the room if it was left open. */
export async function withPlayers(
  browser: Browser,
  names: string[],
  body: (players: Player[], room: { code: string; closed: boolean }) => Promise<void>,
): Promise<void> {
  const players = await Promise.all(names.map((n) => newPlayer(browser, n)));
  const room = { code: "", closed: false };
  try {
    await body(players, room);
  } finally {
    if (room.code && !room.closed) await deleteRoom(room.code);
    for (const p of players) await p.context.close();
  }
}
