// Scenario 2: someone opens the invite link of a running game. They become a spectator (no board, no player
// buttons), the players see them live, they see every call live, they queue for the next round, see the end of
// the round, and the host's "Rundă nouă" turns them into a player. Desktop Chromium only: it checks game logic and
// Realtime, the device does not matter (scenario 1 already runs on WebKit).
import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, leaveAll, playToWin, prepareAndStart, REALTIME_MS, withPlayers } from "./helpers";

const SIZE = 3;

test("a late joiner watches as a spectator and plays from the next round", async ({ browser }) => {
  test.skip(test.info().project.name !== "desktop-chromium", "game logic, one browser is enough");

  await withPlayers(browser, ["Ana", "Bob", "Cris"], async (players, room) => {
    const [host, guest, spectator] = players;

    await test.step("two players start a 3x3 game", async () => {
      room.code = await createRoom(host, SIZE);
      await joinRoom(guest, room.code);
      await prepareAndStart([host, guest], SIZE);
    });

    await test.step("a third person joins mid-game and becomes a spectator", async () => {
      await joinRoom(spectator, room.code);
      const sp = spectator.page;
      await expect(sp.getByText("👀 Ești spectator")).toBeVisible();
      await expect(sp.getByTestId("spectator-status")).toContainText("Jocul e în desfășurare");
      for (const id of ["my-board", "validate", "generate-board", "ready"]) await expect(sp.getByTestId(id)).toHaveCount(0);
      for (const p of [host, guest]) {
        await expect(p.page.getByTestId("spectator-list")).toContainText(spectator.name, { timeout: REALTIME_MS });
      }
    });

    await test.step("the spectator queues for the next round, the players see it live", async () => {
      await spectator.page.getByTestId("queue-toggle").click();
      await expect(spectator.page.getByTestId("queue-toggle")).toContainText("Ești în coadă");
      await expect(host.page.getByTestId("spectator-list")).toContainText(`${spectator.name} · în coadă`, {
        timeout: REALTIME_MS,
      });
    });

    const winner = await test.step("the round is played; the spectator sees every call live", () =>
      playToWin([host, guest], SIZE, room.code, [spectator]),
    );

    await test.step("the spectator sees the end of the round", async () => {
      await expect(spectator.page.getByTestId("spectator-status")).toContainText(`a câștigat ${winner.name}`, {
        timeout: REALTIME_MS,
      });
      await expect(spectator.page.getByText("Cardurile celorlalți")).toBeVisible();
    });

    await test.step("new round: the queued spectator becomes a player", async () => {
      await host.page.getByRole("button", { name: "Vezi cardurile" }).click();
      await host.page.getByTestId("new-round").click();
      await expect(spectator.page.getByTestId("generate-board")).toBeVisible({ timeout: REALTIME_MS });
      await expect(spectator.page.getByText("👀 Ești spectator")).toHaveCount(0);
      await expect(host.page.getByText("0/3 ready")).toBeVisible();
      await expect(host.page.getByTestId("spectator-list")).toHaveCount(0);
    });

    await test.step("everyone leaves, the room closes", async () => {
      await leaveAll([spectator, guest, host]);
      room.closed = true;
    });
  });
});
