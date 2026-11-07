"use client";

import { useContext, useState } from "react";
import { api } from "@/lib/client/api";
import { secondsLeft, StateClockContext, useKickCountdown } from "@/lib/client/kick";
import type { RoomState } from "@/lib/types";
import { ErrorText } from "./ui";

interface Props {
  state: RoomState;
  mode: "lobby" | "game";
  /** When given and the caller is host, a "Scoate" (kick) button is shown next to other players. */
  token?: string;
  refresh?: () => Promise<void>;
}

/** Shown next to a player not seen for 45 s (phone in the background, closed tab, no network). */
export function OfflineBadge({ connected }: { connected: boolean | undefined }) {
  if (connected !== false) return null;
  return (
    <span className="shrink-0 rounded bg-zinc-200 px-1.5 text-[10px] font-semibold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      deconectat
    </span>
  );
}

/** "iese în N s" next to a player whose kick is pending (live countdown, refreshes once at 0). */
function KickBadge({ remainingMs, refresh }: { remainingMs: number; refresh?: () => Promise<void> }) {
  const receivedAt = useContext(StateClockContext);
  const left = useKickCountdown(remainingMs, receivedAt, () => void refresh?.()) ?? 0;
  return (
    <span className="text-xs font-semibold text-rose-600 dark:text-rose-400" role="status">
      iese în {secondsLeft(left)} s
    </span>
  );
}

export function PlayerList({ state, mode, token, refresh }: Props) {
  const { players, me, room } = state;
  const canKick = Boolean(token) && room.hostPlayerId === me.id;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function kick(id: string, nickname: string) {
    if (!token) return;
    const midGame =
      room.status === "playing"
        ? " Are 10 secunde să refuze; dacă nu, e scos și, dacă e tura lui, tura trece la următorul."
        : "";
    if (!window.confirm(`Scoți jucătorul ${nickname} din cameră?${midGame}`)) return;
    setBusy(id);
    setError("");
    try {
      await api(`/api/rooms/${room.code}/kick`, { token, body: { playerId: id } });
      await refresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
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
                <OfflineBadge connected={p.connected} />
              </span>
              <span className="flex shrink-0 items-center gap-2">
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
                {p.kickRemainingMs !== null && <KickBadge remainingMs={p.kickRemainingMs} refresh={refresh} />}
                {canKick && p.id !== me.id && (
                  <button
                    type="button"
                    onClick={() => void kick(p.id, p.nickname)}
                    disabled={busy !== null}
                    className="min-h-8 rounded-md border border-rose-300 px-2 text-xs font-semibold text-rose-600 disabled:opacity-40 dark:border-rose-800 dark:text-rose-400"
                    aria-label={`Scoate pe ${p.nickname}`}
                  >
                    {busy === p.id ? "…" : "Scoate"}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <ErrorText>{error}</ErrorText>
    </>
  );
}
