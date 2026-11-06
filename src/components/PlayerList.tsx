"use client";

import type { RoomState } from "@/lib/types";

export function PlayerList({ state, mode }: { state: RoomState; mode: "lobby" | "game" }) {
  const { players, me, room } = state;
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {players.map((p) => {
        const isTurn = mode === "game" && room.currentTurnPlayerId === p.id;
        const isWinner = room.winnerPlayerId === p.id;
        return (
          <li
            key={p.id}
            className={`flex items-center justify-between gap-2 py-2 ${isTurn ? "font-bold text-indigo-600 dark:text-indigo-400" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              {mode === "game" && (
                <span aria-hidden className="w-3 text-center">
                  {isTurn ? "▶" : ""}
                </span>
              )}
              <span className="truncate">
                {p.nickname}
                {p.id === me.id && <span className="text-zinc-500"> (tu)</span>}
              </span>
              {p.isHost && (
                <span className="rounded bg-zinc-200 px-1.5 text-[10px] font-semibold uppercase dark:bg-zinc-800">
                  host
                </span>
              )}
            </span>
            {mode === "lobby" ? (
              p.ready ? (
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">✓ ready</span>
              ) : (
                <span className="text-sm text-zinc-500">se pregătește…</span>
              )
            ) : isWinner ? (
              <span className="text-sm font-bold text-amber-600">🏆 BINGO</span>
            ) : isTurn ? (
              <span className="text-xs">la tură</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
