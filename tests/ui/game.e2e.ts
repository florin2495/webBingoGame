// Scenario 1: two real browsers play a live game on the deployed site: create, join by link, boards, ready, start,
// every call reaches the other player through Realtime (well under the 15 s polling fallback), marks, a validated
// win, the BINGO pop-up, the revealed cards, a new round followed live, leave. Runs on every project.
import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, leaveAll, playToWin, prepareAndStart, REALTIME_MS, withPlayers } from "./helpers";

const SIZE = 3;

test("two players play a live game to a validated win", async ({ browser }) => {
  await withPlayers(browser, ["Ana", "Bob"], async (players, room) => {
    const [host, guest] = players;

    await test.step("host creates a 3x3 room, the guest joins by link", async () => {
      room.code = await createRoom(host, SIZE);
      await joinRoom(guest, room.code);
      await expect(guest.page.getByTestId("generate-board")).toBeVisible();
      await expect(host.page.getByText("0/2 ready")).toBeVisible({ timeout: REALTIME_MS });
    });

    await test.step("both generate a board and get ready, host starts", () => prepareAndStart(players, SIZE));

    const winner = await test.step("play until a validated win, every call live", () => playToWin(players, SIZE, room.code));

    await test.step("both see the BINGO pop-up, then the revealed cards", async () => {
      const loser = winner === host ? guest : host;
      await expect(winner.page.getByRole("dialog", { name: "Câștigător" })).toContainText("Ai câștigat!");
      await expect(loser.page.getByRole("dialog", { name: "Câștigător" })).toContainText(`${winner.name} a câștigat!`, {
        timeout: REALTIME_MS,
      });
      for (const p of players) {
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
      await leaveAll([guest, host]);
      room.closed = true;
    });
  });
});
