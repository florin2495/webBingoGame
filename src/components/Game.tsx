"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import type { RoomState } from "@/lib/types";
import { Grid } from "./Grid";
import { PlayerList } from "./PlayerList";
import { Button, Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
}

export function Game({ state, token, refresh }: Props) {
  const { room, me, players, board, called } = state;
  const base = `/api/rooms/${room.code}`;
  const playing = room.status === "playing";
  const isHost = room.hostPlayerId === me.id;
  const myTurn = playing && room.currentTurnPlayerId === me.id;
  const total = room.size * room.size;

  const [selected, setSelected] = useState<number | null>(null);
  // Optimistic marks not yet confirmed by the server: number -> desired marked state.
  const [pending, setPending] = useState<Map<number, boolean>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ won: boolean; message: string } | null>(null);

  const calledSet = useMemo(() => new Set(called.map((c) => c.number)), [called]);
  const marked = useMemo(() => {
    const s = new Set(state.marks);
    pending.forEach((want, n) => (want ? s.add(n) : s.delete(n)));
    return s;
  }, [state.marks, pending]);
  const nick = useMemo(() => new Map(players.map((p) => [p.id, p.nickname])), [players]);

  // A selection is only meaningful while it is still my turn and the number is still free.
  const pick = myTurn && selected !== null && !calledSet.has(selected) ? selected : null;
  const last = called.at(-1);
  const turnName = room.currentTurnPlayerId ? nick.get(room.currentTurnPlayerId) : null;
  const winnerName = room.winnerPlayerId ? nick.get(room.winnerPlayerId) : null;

  async function toggleMark(n: number) {
    const want = !marked.has(n);
    setPending((p) => new Map(p).set(n, want));
    try {
      await api(`${base}/mark`, { token, body: { number: n, marked: want } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
    } finally {
      setPending((p) => {
        const next = new Map(p);
        if (next.get(n) === want) next.delete(n);
        return next;
      });
    }
  }

  function onCell(value: number | null) {
    if (value === null || !playing) return;
    setError("");
    if (myTurn && !calledSet.has(value)) {
      setSelected(pick === value ? null : value);
      return;
    }
    void toggleMark(value);
  }

  async function act(fn: () => Promise<unknown>) {
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

  const callNumber = () =>
    act(async () => {
      if (pick === null) return;
      await api(`${base}/call`, { token, body: { number: pick } });
      setSelected(null);
    });

  const validate = () =>
    act(async () => {
      const r = await api<{ won: boolean; message: string }>(`${base}/validate`, { token, body: {} });
      setResult(r);
    });

  return (
    <div className="flex flex-col gap-4">
      {room.status === "finished" ? (
        <Card className="border-amber-300 bg-amber-50 text-center dark:border-amber-700 dark:bg-amber-950">
          <p className="text-2xl font-black">
            {room.winnerPlayerId === me.id ? "🏆 Ai câștigat!" : `🏆 ${winnerName ?? "Cineva"} a câștigat!`}
          </p>
          {isHost ? (
            <Button className="mt-3 w-full" disabled={busy} onClick={() => void act(() => api(`${base}/new-round`, { token, body: {} }))}>
              Rundă nouă
            </Button>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Așteaptă ca host-ul să pornească o rundă nouă.</p>
          )}
        </Card>
      ) : (
        <Card className={myTurn ? "border-indigo-400 ring-2 ring-indigo-400" : ""}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-500">Tura</p>
              <p className={`text-lg font-bold ${myTurn ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                {myTurn ? "Tura ta!" : (turnName ?? "—")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase text-zinc-500">Ultimul strigat</p>
              <p className="text-3xl font-black tabular-nums">{last ? last.number : "—"}</p>
            </div>
          </div>
          {myTurn && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {called.length >= total
                ? "Toate numerele au fost strigate."
                : pick === null
                  ? "Alege din matricea ta un număr nestrigat."
                  : `Ai ales ${pick}. Confirmă mai jos.`}
            </p>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Matricea ta</h2>
          <span className="text-xs text-zinc-500">Bifezi singur numerele strigate</span>
        </div>
        {board ? (
          <Grid
            size={room.size}
            cells={board}
            stateOf={(v) => (v !== null && v === pick ? "selected" : v !== null && marked.has(v) ? "marked" : "plain")}
            onCellClick={playing ? onCell : undefined}
          />
        ) : (
          <p className="py-6 text-center text-sm text-zinc-500">
            Ai intrat după ce jocul a pornit. Vei juca din runda următoare.
          </p>
        )}

        {playing && board && (
          <div className="mt-3 flex flex-col gap-2">
            {myTurn && (
              <Button onClick={() => void callNumber()} disabled={busy || pick === null}>
                {pick === null ? "Alege un număr" : `Strigă ${pick}`}
              </Button>
            )}
            <Button variant="secondary" onClick={() => void validate()} disabled={busy}>
              Validează ({room.linesToWin} {room.linesToWin === 1 ? "linie" : "linii"})
            </Button>
          </div>
        )}
        <div className="mt-2 flex flex-col gap-1">
          {result && (
            <p
              role="status"
              className={`text-sm font-semibold ${result.won ? "text-emerald-600" : "text-rose-600 dark:text-rose-400"}`}
            >
              {result.message}
            </p>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">
          Numere strigate <span className="font-normal text-zinc-500">({called.length})</span>
        </h2>
        {called.length === 0 ? (
          <p className="text-sm text-zinc-500">Încă nimic.</p>
        ) : (
          <ol className="flex flex-wrap gap-1.5">
            {[...called].reverse().map((c) => (
              <li
                key={c.seq}
                title={`#${c.seq} · ${c.playerId ? nick.get(c.playerId) : ""}`}
                className="flex items-baseline gap-1 rounded-md bg-zinc-100 px-2 py-1 dark:bg-zinc-900"
              >
                <span className="text-[10px] text-zinc-500">#{c.seq}</span>
                <span className="font-bold tabular-nums">{c.number}</span>
                <span className="max-w-16 truncate text-[10px] text-zinc-500">
                  {c.playerId ? nick.get(c.playerId) : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Ordinea turelor</h2>
        <PlayerList state={state} mode="game" />
        {isHost && playing && room.currentTurnPlayerId !== me.id && (
          <Button
            variant="secondary"
            className="mt-3 w-full text-sm"
            disabled={busy}
            onClick={() => void act(() => api(`${base}/skip`, { token, body: {} }))}
          >
            Sari tura lui {turnName}
          </Button>
        )}
      </Card>
    </div>
  );
}
