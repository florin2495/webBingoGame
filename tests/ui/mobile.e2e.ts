// Scenario 3 (phone only): the worst case for a small screen, a 10x10 board. No screen may scroll sideways, every
// cell must stay big enough to tap (WCAG 2.2 minimum target: 24 x 24 CSS px), and a real tap must call a number.
// Scenario 1 already plays a full game on the emulated iPhone; this one checks the layout.
import { expect, test } from "@playwright/test";
import {
  calledItem,
  cell,
  createRoom,
  expectNoHorizontalScroll,
  joinRoom,
  leaveAll,
  prepareAndStart,
  REALTIME_MS,
  withPlayers,
} from "./helpers";

const SIZE = 10;
const MIN_TAP_PX = 24;

test("10x10 board fits a phone screen and is tappable", async ({ browser }) => {
  test.skip(!test.info().project.use.isMobile, "phone layout only");

  await withPlayers(browser, ["Ana", "Bob"], async (players, room) => {
    const [host, guest] = players;

    await test.step("home page fits the screen", async () => {
      await host.page.goto("./");
      await expect(host.page.getByTestId("home-submit")).toBeVisible();
      await expectNoHorizontalScroll(host.page);
    });

    await test.step("lobby with a 10x10 board fits the screen", async () => {
      room.code = await createRoom(host, SIZE);
      await joinRoom(guest, room.code);
      await host.page.getByTestId("generate-board").click();
      await expect(host.page.getByTestId("my-board").getByRole("button")).toHaveCount(SIZE * SIZE);
      await expectNoHorizontalScroll(host.page);
    });

    await test.step("game screen fits, every cell is big enough to tap", async () => {
      await prepareAndStart(players, SIZE);
      for (const p of players) {
        await expectNoHorizontalScroll(p.page);
        const sizes = await p.page
          .getByTestId("my-board")
          .getByRole("button")
          .evaluateAll((els) => els.map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)));
        expect(sizes).toHaveLength(SIZE * SIZE);
        expect(Math.min(...sizes), `smallest cell on ${p.name}'s board`).toBeGreaterThanOrEqual(MIN_TAP_PX);
      }
    });

    await test.step("a tap calls a number, the other phone sees it live", async () => {
      const n = host.board[0];
      await expect(host.page.getByTestId("turn-badge")).toHaveText("Tura ta");
      await Promise.all([
        host.page.waitForResponse((r) => r.url().endsWith(`/api/rooms/${room.code}/call`) && r.ok()),
        cell(host, n).tap(), // a touch tap, not a mouse click
      ]);
      await expect(cell(host, n)).toHaveAttribute("data-state", "mine");
      await expect(calledItem(guest, n)).toBeVisible({ timeout: REALTIME_MS });
      await expectNoHorizontalScroll(guest.page);
    });

    await test.step("both leave (the last player standing wins), the room closes", async () => {
      await leaveAll([guest]);
      await expect(host.page.getByRole("dialog", { name: "Câștigător" })).toContainText("Ai câștigat!", { timeout: REALTIME_MS });
      await host.page.getByRole("button", { name: "Vezi cardurile" }).click();
      await leaveAll([host]);
      room.closed = true;
    });
  });
});
