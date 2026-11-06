"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { PREF_CONFIRM_CALL, PREF_SOUND, useBoolPref } from "@/lib/client/prefs";
import { countMarkedLines, countValidLines, HINT_HIGHLIGHT_MS, HINTS_PER_ROUND } from "@/lib/game";
import type { RoomState } from "@/lib/types";
import { Grid, type CellState } from "./Grid";
import { PlayerList } from "./PlayerList";
import { Button, Card, ErrorText, Toggle } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
}

const LINE_SOUND = "/sounds/line.mp3";

/** Plays the line fragment. Must be called from a user gesture (tap) to satisfy autoplay rules. */
function useLineSound(enabled: boolean) {
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  return useCallback(() => {
    if (!enabled) return;
    audio.current ??= new Audio(LINE_SOUND);
    audio.current.currentTime = 0;
    void audio.current.play().catch(() => {});
  }, [enabled]);
}

export function Game({ state, token, refresh }: Props) {
  const { room, me, players, board, called } = state;
  const base = `/api/rooms/${room.code}`;
  const playing = room.status === "playing";
  const isHost = room.hostPlayerId === me.id;
  const myTurn = playing && room.currentTurnPlayerId === me.id;
  const total = room.size * room.size;

  const [confirmCall, setConfirmCall] = useBoolPref(PREF_CONFIRM_CALL, true);
  const [soundOn, setSoundOn] = useBoolPref(PREF_SOUND, true);
  const playLine = useLineSound(soundOn);

  const [selected, setSelected] = useState<number | null>(null);
  // Optimistic marks not yet confirmed by the server: number -> desired marked state.
  const [pending, setPending] = useState<Map<number, boolean>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ won: boolean; message: string } | null>(null);
  const [hintOn, setHintOn] = useState(false);
  const hintTimer = useRef<number | null>(null);
  useEffect(() => () => void (hintTimer.current && window.clearTimeout(hintTimer.current)), []);

  const calledSet = useMemo(() => new Set(called.map((c) => c.number)), [called]);
  const calledByMe = useMemo(
    () => new Set(called.filter((c) => c.playerId === me.id).map((c) => c.number)),
    [called, me.id],
  );
  const marked = useMemo(() => {
    const s = new Set(state.marks);
    pending.forEach((want, n) => (want ? s.add(n) : s.delete(n)));
    return s;
  }, [state.marks, pending]);
  const nick = useMemo(() => new Map(players.map((p) => [p.id, p.nickname])), [players]);
  const missed = useMemo(() => called.filter((c) => !marked.has(c.number)).length, [called, marked]);

  // A selection is only meaningful while it is still my turn and the number is still free.
  const pick = myTurn && selected !== null && !calledSet.has(selected) ? selected : null;
  const last = called.at(-1);
  const turnName = room.currentTurnPlayerId ? nick.get(room.currentTurnPlayerId) : null;
  const winnerName = room.winnerPlayerId ? nick.get(room.winnerPlayerId) : null;

  /** Plays the fragment when adding `n` to the marks completes a new line. Call inside the tap handler. */
  function cueIfNewLine(n: number) {
    if (!board || marked.has(n)) return;
    const after = new Set(marked).add(n);
    if (countMarkedLines(board, room.size, after) > countMarkedLines(board, room.size, marked)) playLine();
  }

  async function toggleMark(n: number) {
    const want = !marked.has(n);
    if (want) cueIfNewLine(n);
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

  function callNumber(n: number) {
    cueIfNewLine(n); // the caller's number is marked for them by the server
    setPending((p) => new Map(p).set(n, true));
    void act(async () => {
      try {
        await api(`${base}/call`, { token, body: { number: n } });
        setSelected(null);
      } finally {
        setPending((p) => {
          const next = new Map(p);
          next.delete(n);
          return next;
        });
      }
    });
  }

  function onCell(value: number | null) {
    if (value === null || !playing || busy) return;
    setError("");
    setNotice("");
    if (myTurn && !calledSet.has(value)) {
      if (confirmCall) setSelected(pick === value ? null : value);
      else callNumber(value);
      return;
    }
    void toggleMark(value);
  }

  function setHint(on: boolean) {
    setNotice("");
    if (!on) {
      setHintOn(false);
      return;
    }
    if (missed === 0) {
      setNotice("Ești la zi: ai bifat toate numerele strigate. Nu am consumat niciun ajutor.");
      return;
    }
    void act(async () => {
      await api(`${base}/hint`, { token, body: {} });
      setHintOn(true);
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHintOn(false), HINT_HIGHLIGHT_MS);
    });
  }

  const validate = () =>
    act(async () => {
      const r = await api<{ won: boolean; message: string }>(`${base}/validate`, { token, body: {} });
      setResult(r);
    });

  function cellState(v: number | null): CellState {
    if (v === null) return "plain";
    if (v === pick) return "selected";
    if (marked.has(v)) return calledByMe.has(v) ? "mine" : "marked";
    if (hintOn && calledSet.has(v)) return "hint";
    return "plain";
  }

  return (
    <div className="flex flex-col gap-4">
      {room.status === "finished" ? (
        <Card className="border-amber-300 bg-amber-50 text-center dark:border-amber-700 dark:bg-amber-950">
          <p className="text-2xl font-black">
            {room.winnerPlayerId === me.id ? "🏆 Ai câștigat!" : `🏆 ${winnerName ?? "Cineva"} a câștigat!`}
          </p>
          {isHost ? (
            <Button
              className="mt-3 w-full"
              disabled={busy}
              onClick={() => void act(() => api(`${base}/new-round`, { token, body: {} }))}
            >
              Rundă nouă
            </Button>
          ) : null}
          {isHost ? (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              În lobby poți schimba dimensiunea matricei și numărul de linii pentru runda următoare.
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Așteaptă ca host-ul să pornească o rundă nouă.
            </p>
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
                : !confirmCall
                  ? "Apasă un număr nestrigat: se strigă imediat."
                  : pick === null
                    ? "Alege din matricea ta un număr nestrigat."
                    : `Ai ales ${pick}. Confirmă mai jos.`}
            </p>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-bold">Matricea ta</h2>
          <span className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-200 ring-1 ring-emerald-400" /> strigat de tine
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-700" /> de alții
          </span>
        </div>
        {board ? (
          <Grid size={room.size} cells={board} stateOf={cellState} onCellClick={playing ? onCell : undefined} />
        ) : (
          <p className="py-6 text-center text-sm text-zinc-500">
            Ai intrat după ce jocul a pornit. Vei juca din runda următoare.
          </p>
        )}

        {playing && board && (
          <div className="mt-3 flex flex-col gap-2">
            {myTurn && confirmCall && (
              <Button onClick={() => pick !== null && callNumber(pick)} disabled={busy || pick === null}>
                {pick === null ? "Alege un număr" : `Strigă ${pick}`}
              </Button>
            )}
            <Button variant="secondary" onClick={() => void validate()} disabled={busy}>
              Validează ({room.linesToWin} {room.linesToWin === 1 ? "linie" : "linii"})
            </Button>

            <div className="mt-1 flex flex-col border-t border-zinc-200 pt-2 dark:border-zinc-800">
              <Toggle
                label={`Arată numerele ratate (${state.hintsLeft}/${HINTS_PER_ROUND} rămase)`}
                hint={`Încercuiește cu galben, ${HINT_HIGHLIGHT_MS / 1000} secunde, numerele strigate pe care nu le-ai bifat.`}
                checked={hintOn}
                onChange={setHint}
                disabled={busy || (!hintOn && state.hintsLeft === 0)}
              />
              <Toggle
                label="Confirmare la strigare"
                hint={confirmCall ? "Alegi numărul, apoi apeși „Strigă”." : "Numărul apăsat se strigă imediat."}
                checked={confirmCall}
                onChange={setConfirmCall}
              />
              <Toggle label="Sunet la linie completă" checked={soundOn} onChange={setSoundOn} />
            </div>
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
          {notice && <p className="text-sm text-zinc-600 dark:text-zinc-400">{notice}</p>}
          <ErrorText>{error}</ErrorText>
        </div>
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
              <li
                key={c.seq}
                title={`#${c.seq} · ${c.playerId ? nick.get(c.playerId) : ""}`}
                className={`flex items-baseline gap-1 rounded-md px-2 py-1 ${
                  c.playerId === me.id
                    ? "bg-emerald-100 dark:bg-emerald-950"
                    : "bg-zinc-100 dark:bg-zinc-900"
                }`}
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
        <PlayerList state={state} mode="game" token={token} refresh={refresh} />
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

/** End of game: everyone else's card with their marks, expandable under their name. */
function RevealedBoards({ state }: { state: RoomState }) {
  const { room, players, called, me } = state;
  const calledSet = new Set(called.map((c) => c.number));
  const callerOf = new Map(called.map((c) => [c.number, c.playerId]));
  const byPlayer = new Map((state.reveal ?? []).map((r) => [r.playerId, r]));
  const others = players
    .filter((p) => p.id !== me.id && byPlayer.has(p.id))
    .sort((a, b) => Number(b.id === room.winnerPlayerId) - Number(a.id === room.winnerPlayerId));

  if (others.length === 0) return null;

  return (
    <Card>
      <h2 className="mb-1 font-bold">Cardurile celorlalți</h2>
      <p className="mb-2 text-xs text-zinc-500">
        Verde deschis = strigat de el, verde închis = strigat de alții, roșu = bifat dar nestrigat.
      </p>
      <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {others.map((p) => {
          const r = byPlayer.get(p.id)!;
          const marks = new Set(r.marks);
          const lines = countValidLines(r.board, room.size, marks, calledSet);
          return (
            <details key={p.id} className="group py-2" open={p.id === room.winnerPlayerId}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1">
                <span className="font-semibold">
                  {p.id === room.winnerPlayerId && "🏆 "}
                  {p.nickname}
                </span>
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  {lines} {lines === 1 ? "linie" : "linii"} · {r.marks.length} bifate
                  <span className="transition-transform group-open:rotate-180">▾</span>
                </span>
              </summary>
              <div className="pt-2">
                <Grid
                  compact
                  size={room.size}
                  cells={r.board}
                  stateOf={(v) =>
                    v === null || !marks.has(v)
                      ? "plain"
                      : !calledSet.has(v)
                        ? "wrong"
                        : callerOf.get(v) === p.id
                          ? "mine"
                          : "marked"
                  }
                />
              </div>
            </details>
          );
        })}
      </div>
    </Card>
  );
}
