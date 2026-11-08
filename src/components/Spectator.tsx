"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { MAX_PLAYERS } from "@/lib/game";
import type { PublicSpectator, RoomState } from "@/lib/types";
import { RevealedBoards } from "./Game";
import { PlayerList } from "./PlayerList";
import { Button, Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
}

/** Read-only view for someone who joined a room that was already running. Public state only. */
export function SpectatorView({ state, token, refresh }: Props) {
  const { room, called, players, spectators, queued, me } = state;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nick = new Map(players.map((p) => [p.id, p.nickname]));
  const winnerName = room.winnerPlayerId ? nick.get(room.winnerPlayerId) : null;
  const queuePos = spectators.filter((s) => s.queued).findIndex((s) => s.id === me.id) + 1;

  async function toggleQueue() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/rooms/${room.code}/queue`, { token, body: {} });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  const status =
    room.status === "lobby"
      ? "Camera e în lobby: jucătorii își pregătesc matricile."
      : room.status === "playing"
        ? "Jocul e în desfășurare. Vezi numerele strigate, dar nu poți juca runda asta."
        : `Runda s-a terminat${winnerName ? `: a câștigat ${winnerName}` : ""}.`;

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950">
        <h2 className="font-bold">👀 Ești spectator</h2>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{status}</p>
        <Button className="mt-3 w-full" variant={queued ? "secondary" : "primary"} disabled={busy} onClick={() => void toggleQueue()}>
          {queued ? "Ești în coadă · apasă ca să renunți" : "Intră la runda următoare"}
        </Button>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {queued
            ? `Ești al ${queuePos}-lea în coadă. Joci de la runda următoare dacă sunt locuri (maximum ${MAX_PLAYERS} jucători).`
            : "Apasă ca să joci de la runda următoare. Vezi doar ce e public: nu vezi matricile jucătorilor."}
        </p>
        <ErrorText>{error}</ErrorText>
      </Card>

      {room.status === "finished" && state.reveal && <RevealedBoards state={state} />}

      <Card>
        <h2 className="mb-2 font-bold">
          Numere strigate <span className="font-normal text-zinc-500">({called.length})</span>
        </h2>
        {called.length === 0 ? (
          <p className="text-sm text-zinc-500">Încă nimic.</p>
        ) : (
          <ol className="flex flex-wrap gap-1.5">
            {[...called].reverse().map((c) => (
              <li key={c.seq} className="flex items-baseline gap-1 rounded-md bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                <span className="text-[10px] text-zinc-500">#{c.seq}</span>
                <span className="font-bold tabular-nums">{c.number}</span>
                <span className="max-w-16 truncate text-[10px] text-zinc-500">{c.playerId ? nick.get(c.playerId) : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">{room.status === "lobby" ? "Jucători" : "Ordinea turelor"}</h2>
        <PlayerList state={state} mode={room.status === "lobby" ? "lobby" : "game"} />
      </Card>
    </div>
  );
}

/** Who is watching (and who is queued for the next round). Shown to everyone in the room. */
export function SpectatorList({ spectators, meId }: { spectators: PublicSpectator[]; meId: string }) {
  if (spectators.length === 0) return null;
  return (
    <Card className="py-3">
      <h2 className="mb-1 text-sm font-bold">
        Spectatori <span className="font-normal text-zinc-500">({spectators.length})</span>
      </h2>
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {spectators.map((s) => (
          <li
            key={s.id}
            className={`rounded-md px-2 py-1 ${s.queued ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 dark:bg-zinc-900"}`}
          >
            {s.nickname}
            {s.id === meId && <span className="text-zinc-500"> (tu)</span>}
            {s.queued && " · în coadă"}
          </li>
        ))}
      </ul>
    </Card>
  );
}
