"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import {
  LINES_MAX,
  LINES_MIN,
  MIN_PLAYERS_TO_START,
  minutesLabel,
  ROOM_IDLE_MINUTES,
  SIZE_MAX,
  SIZE_MIN,
} from "@/lib/game";
import type { RoomState } from "@/lib/types";
import { Grid } from "./Grid";
import { PlayerList } from "./PlayerList";
import { Button, Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
}

export function Lobby({ state, token, refresh }: Props) {
  const { room, me, players, board } = state;
  const total = room.size * room.size;
  const base = `/api/rooms/${room.code}`;

  const [manualRaw, setManual] = useState<(number | null)[] | null>(null);
  // If the host changes N mid-fill, the half-filled grid no longer fits: drop it.
  const manual = manualRaw?.length === total ? manualRaw : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    run(async () => {
      await api(`${base}/board`, { token, body: { generate: true } });
      setManual(null);
    });

  const startManual = () => {
    setError("");
    setManual(Array<number | null>(total).fill(null));
  };

  // Manual fill: the k-th tap writes k. Saved to the server as soon as the grid is complete.
  const placed = manual ? manual.filter((v) => v !== null).length : 0;
  function tapManual(_: number | null, index: number) {
    if (!manual || manual[index] !== null || busy) return;
    const next = [...manual];
    next[index] = placed + 1;
    setManual(next);
    if (placed + 1 === total) {
      void run(async () => {
        await api(`${base}/board`, { token, body: { cells: next } });
        setManual(null);
      });
    }
  }
  function undoManual() {
    if (!manual || placed === 0) return;
    setManual(manual.map((v) => (v === placed ? null : v)));
  }

  const ready = () => run(() => api(`${base}/ready`, { token, body: {} }));
  const start = () => run(() => api(`${base}/start`, { token, body: {} }));

  const readyCount = players.filter((p) => p.ready).length;
  const allReady = readyCount === players.length && players.length >= MIN_PLAYERS_TO_START;
  const isHost = room.hostPlayerId === me.id;

  return (
    <div className="flex flex-col gap-4">
      {isHost && <HostSettings key={`${room.size}-${room.linesToWin}`} state={state} token={token} refresh={refresh} />}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Matricea ta</h2>
          {me.ready ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              Blocată · ready
            </span>
          ) : manual ? (
            <span className="text-sm tabular-nums text-zinc-500">
              {placed}/{total}
            </span>
          ) : null}
        </div>

        {manual ? (
          <>
            <p className="mb-3 text-sm text-zinc-500">
              Apasă pătrățelele pe rând: prima apăsare pune 1, a doua 2, … până la {total}.
            </p>
            <Grid
              size={room.size}
              cells={manual}
              stateOf={(v) => (v === null ? "empty" : "plain")}
              onCellClick={tapManual}
              disabled={busy}
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={undoManual} disabled={busy || placed === 0}>
                Anulează
              </Button>
              <Button variant="secondary" onClick={startManual} disabled={busy || placed === 0}>
                Golește
              </Button>
              <Button variant="secondary" onClick={() => setManual(null)} disabled={busy}>
                Renunță
              </Button>
            </div>
          </>
        ) : board ? (
          <Grid size={room.size} cells={board} stateOf={() => "plain"} />
        ) : (
          <p className="py-6 text-center text-sm text-zinc-500">
            Nu ai încă o matrice. Generează una sau completeaz-o manual.
          </p>
        )}

        {!me.ready && !manual && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void generate()} disabled={busy}>
              {board ? "Generează alta" : "Generează matrice"}
            </Button>
            <Button variant="secondary" onClick={startManual} disabled={busy}>
              Completare manuală
            </Button>
          </div>
        )}

        {!me.ready && (
          <Button className="mt-3 w-full" onClick={() => void ready()} disabled={busy || !board || manual !== null}>
            I&apos;m ready
          </Button>
        )}
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Jucători</h2>
          <span className="text-sm tabular-nums text-zinc-500">
            {readyCount}/{players.length} ready
          </span>
        </div>
        <PlayerList state={state} mode="lobby" token={token} refresh={refresh} />
        {isHost ? (
          <>
            <Button className="mt-3 w-full" onClick={() => void start()} disabled={busy || !allReady}>
              Pornește jocul
            </Button>
            {!allReady && (
              <p className="mt-2 text-center text-xs text-zinc-500">
                {players.length < MIN_PLAYERS_TO_START
                  ? `Invită cel puțin încă un jucător (codul e sus, în dreapta).`
                  : "Poți porni când toți sunt ready."}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-center text-xs text-zinc-500">
            {players.find((p) => p.isHost)?.nickname ?? "Creatorul"} pornește jocul când toți sunt ready.
          </p>
        )}
        <p className="mt-2 text-center text-xs text-zinc-500">
          Runda {room.round} o începe <strong>{nextStarter(state)}</strong>. Camera se închide automat după{" "}
          {minutesLabel(ROOM_IDLE_MINUTES)} în care nimeni nu o are deschisă.
        </p>
      </Card>
    </div>
  );
}

/** Who calls first this round: the first player of the lobby list (seat order, the host can reorder it). */
function nextStarter(state: RoomState): string {
  return state.players[0]?.nickname ?? "host-ul";
}

/** Host-only rules editor, available whenever the room is in the lobby (incl. right after "Rundă nouă"). */
function HostSettings({ state, token, refresh }: Props) {
  const { room, players } = state;
  const [size, setSize] = useState(room.size);
  const [lines, setLines] = useState(room.linesToWin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = size !== room.size || lines !== room.linesToWin;
  const othersPrepared = players.some((p) => p.ready);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/rooms/${room.code}/settings`, { token, body: { size, linesToWin: lines } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  const select =
    "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <Card>
      <details open={room.round > 1 && !othersPrepared}>
        <summary className="cursor-pointer font-bold">Regulile rundei (doar tu le poți schimba)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Matrice N×N
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} className={select}>
              {Array.from({ length: SIZE_MAX - SIZE_MIN + 1 }, (_, i) => SIZE_MIN + i).map((n) => (
                <option key={n} value={n}>
                  {n}×{n} (1–{n * n})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Linii pentru câștig
            <select value={lines} onChange={(e) => setLines(Number(e.target.value))} className={select}>
              {Array.from({ length: LINES_MAX - LINES_MIN + 1 }, (_, i) => LINES_MIN + i).map((l) => (
                <option key={l} value={l}>
                  {l} {l === 1 ? "linie" : "linii"}
                </option>
              ))}
            </select>
          </label>
        </div>
        {dirty && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            {size !== room.size
              ? "Schimbarea dimensiunii șterge matricile deja pregătite. Toți vor trebui să le refacă și să apese din nou ready."
              : "Toți vor trebui să apese din nou ready."}
          </p>
        )}
        <Button className="mt-3 w-full" variant="secondary" onClick={() => void save()} disabled={busy || !dirty}>
          Salvează regulile
        </Button>
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </details>
    </Card>
  );
}
