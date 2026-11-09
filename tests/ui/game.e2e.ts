// Two real browsers play a live game on the deployed site: create, join, boards, ready, start, every call must reach
// the other player through Realtime (well under the 15 s polling fallback), marks, a validated win, the BINGO pop-up,
// the revealed cards, a new round and leaving. Runs once per Playwright project (desktop Chromium, iPhone WebKit).
// Rooms are named "e2e-test-ui-…"; leftovers are deleted with the service key (env) as a safety net.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** A call has to show up on the other screen within this, without a reload. Polling alone takes up to 15 s. */
const REALTIME_MS = 5_000;
const SIZE = 3;

interface Player {
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
const linesDone = (board: number[], called: Set<number>) =>
  allLines(SIZE).filter((l) => l.every((i) => called.has(board[i]))).length;

/** A separate browser context = a separate device (own localStorage session), with the project's device settings. */
async function newPlayer(browser: Browser, name: string): Promise<Player> {
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

const cell = (p: Player, n: number) => p.page.getByTestId("my-board").getByRole("button", { name: `Numărul ${n}`, exact: true });
const calledItem = (p: Player, n: number) => p.page.getByTestId("called-list").locator(`li[data-number="${n}"]`);

async function readBoard(p: Player): Promise<number[]> {
  const cells = p.page.getByTestId("my-board").getByRole("button");
  await expect(cells).toHaveCount(SIZE * SIZE);
  return (await cells.allTextContents()).map(Number);
}

/** Safety net: delete the room straight in the DB if the UI flow did not close it. */
async function deleteRoom(code: string) {
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

test("two players play a live game to a validated win", async ({ browser }) => {
  const host = await newPlayer(browser, "Ana");
  const guest = await newPlayer(browser, "Bob");
  let code = "";
  let closed = false;

  try {
    await test.step("host creates a 3x3 room", async () => {
      const page = host.page;
      await page.goto("./");
      await page.getByLabel("Numele camerei").fill(`e2e-test-ui-${Date.now().toString(36)}`);
      await page.getByLabel("Nickname-ul tău").fill(host.name);
      await page.getByLabel("Matrice N×N").selectOption(String(SIZE));
      await page.getByLabel("Linii pentru câștig").selectOption("1");
      await page.getByTestId("home-submit").click();
      await page.waitForURL(/\/room\/[A-Z2-9]{6}$/);
      code = page.url().match(/\/room\/([A-Z2-9]{6})$/)![1];
      await expect(page.getByTestId("generate-board")).toBeVisible();
    });

    await test.step("guest joins by link and the host sees them live", async () => {
      await guest.page.goto(`room/${code}`);
      await guest.page.getByLabel("Nickname-ul tău").fill(guest.name);
      await guest.page.getByTestId("join-submit").click();
      await expect(guest.page.getByTestId("generate-board")).toBeVisible();
      await expect(host.page.getByText("0/2 ready")).toBeVisible({ timeout: REALTIME_MS });
    });

    await test.step("both generate a board and get ready, host starts", async () => {
      for (const p of [host, guest]) {
        await p.page.getByTestId("generate-board").click();
        p.board = await readBoard(p);
        expect(new Set(p.board).size).toBe(SIZE * SIZE);
        await p.page.getByTestId("ready").click();
        await expect(p.page.getByText("Blocată · ready")).toBeVisible();
      }
      await expect(host.page.getByTestId("start-game")).toBeEnabled({ timeout: REALTIME_MS });
      await host.page.getByTestId("start-game").click();
      await expect(host.page.getByTestId("turn-badge")).toHaveText("Tura ta");
      await expect(guest.page.getByTestId("turn-badge")).toContainText(`Tura lui ${host.name}`, { timeout: REALTIME_MS });
    });

    let winner: Player | null = null;
    await test.step("play: every call reaches the other player live, until a validated win", async () => {
      const called = new Set<number>();
      let caller = host; // seat 0 = host calls first in round 1
      while (!winner && called.size < SIZE * SIZE) {
        const other = caller === host ? guest : host;
        await expect(caller.page.getByTestId("turn-badge")).toHaveText("Tura ta", { timeout: REALTIME_MS });
        // The uncalled number that completes most of the caller's lines.
        const pick = caller.board
          .filter((x) => !called.has(x))
          .sort((x, y) => linesDone(caller.board, new Set([...called, y])) - linesDone(caller.board, new Set([...called, x])))[0];
        await Promise.all([
          caller.page.waitForResponse((r) => r.url().endsWith(`/api/rooms/${code}/call`) && r.ok()),
          cell(caller, pick).click(),
        ]);
        called.add(pick);
        await expect(cell(caller, pick)).toHaveAttribute("data-state", "mine");

        // Realtime: no reload, well under the polling interval.
        await expect(calledItem(other, pick)).toBeVisible({ timeout: REALTIME_MS });
        await Promise.all([
          other.page.waitForResponse((r) => r.url().endsWith(`/api/rooms/${code}/mark`) && r.ok()),
          cell(other, pick).click(),
        ]);
        await expect(cell(other, pick)).toHaveAttribute("data-state", "marked");

        for (const p of [caller, other]) {
          if (linesDone(p.board, called) === 0) continue;
          await p.page.getByTestId("validate").click();
          await expect(p.page.getByRole("dialog", { name: "Câștigător" })).toBeVisible();
          winner = p;
          break;
        }
        caller = other;
      }
      expect(winner, "someone completed a line").not.toBeNull();
    });

    await test.step("both see the BINGO pop-up, then the revealed cards", async () => {
      const w = winner!;
      const loser = w === host ? guest : host;
      await expect(w.page.getByRole("dialog", { name: "Câștigător" })).toContainText("Ai câștigat!");
      await expect(loser.page.getByRole("dialog", { name: "Câștigător" })).toContainText(`${w.name} a câștigat!`, {
        timeout: REALTIME_MS,
      });
      for (const p of [host, guest]) {
        await p.page.getByRole("button", { name: "Vezi cardurile" }).click();
        await expect(p.page.getByRole("dialog", { name: "Câștigător" })).toBeHidden();
        await expect(p.page.getByText("Cardurile celorlalți")).toBeVisible();
        await expect(p.page.getByTestId("revealed-board")).toHaveCount(1);
      }
    });

    await test.step("host starts a new round, the guest follows live", async () => {
      await host.page.getByTestId("new-round").click();
      await expect(host.page.getByTestId("generate-board")).toBeVisible();
      await expect(guest.page.getByTestId("generate-board")).toBeVisible({ timeout: REALTIME_MS });
    });

    await test.step("both leave, the room closes", async () => {
      for (const p of [guest, host]) {
        p.page.once("dialog", (d) => void d.accept());
        await p.page.getByTestId("leave").click();
        await expect(p.page.getByTestId("home-submit")).toBeVisible();
      }
      closed = true;
    });
  } finally {
    if (code && !closed) await deleteRoom(code);
    await host.context.close();
    await guest.context.close();
  }
});
