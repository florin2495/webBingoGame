"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, withBase } from "@/lib/client/api";
import { PREF_CONFIRM_CALL, PREF_SHOW_LAST, PREF_SOUND, useBoolPref } from "@/lib/client/prefs";
import { countValidLines, HINT_HIGHLIGHT_MS, hintsPerRound } from "@/lib/game";
import type { CalledNumber, RoomState } from "@/lib/types";
import { Grid, type CellState } from "./Grid";
import { OfflineBadge, PlayerList } from "./PlayerList";
import { Button, Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
}

const LINE_SOUND = withBase("/sounds/line.mp3");
const FADE_IN_S = 1;
const FADE_OUT_S = 1.5;

/**
 * Plays the line fragment with a fade in / fade out. Uses Web Audio (a GainNode) because
 * iOS Safari ignores HTMLAudioElement.volume. Must be called from a tap so the AudioContext
 * is allowed to start.
 */
function useLineSound(enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  const buffer = useRef<Promise<AudioBuffer> | null>(null);
  const current = useRef<AudioBufferSourceNode | null>(null);

  useEffect(
    () => () => {
      current.current?.stop();
      void ctx.current?.close();
    },
    [],
  );

  return useCallback(() => {
    if (!enabled) return;
    try {
      ctx.current ??= new AudioContext();
      const ac = ctx.current;
      void ac.resume(); // inside the tap: unlocks audio on iOS
      buffer.current ??= fetch(LINE_SOUND)
        .then((r) => r.arrayBuffer())
        .then((data) => ac.decodeAudioData(data));
      void buffer.current
        .then((buf) => {
          current.current?.stop();
          const src = ac.createBufferSource();
          const gain = ac.createGain();
          src.buffer = buf;
          src.connect(gain).connect(ac.destination);
          const t = ac.currentTime;
          const end = t + buf.duration;
          const fadeOutAt = Math.max(t + FADE_IN_S, end - FADE_OUT_S);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(1, t + Math.min(FADE_IN_S, buf.duration / 2));
          gain.gain.setValueAtTime(1, fadeOutAt);
          gain.gain.linearRampToValueAtTime(0, end);
          src.start(t);
          current.current = src;
        })
        .catch(() => {
          buffer.current = null; // retry next time (e.g. network hiccup)
        });
    } catch {
      // Web Audio unavailable: silently skip the cue
    }
  }, [enabled]);
}

const FLASH_MS = 500;

/** The number to flash on screen for FLASH_MS after a new one is called (null otherwise). Not on first load. */
function useFlashedNumber(called: CalledNumber[], enabled: boolean): number | null {
  const [flash, setFlash] = useState<{ seq: number; number: number } | null>(null);
  const lastSeq = useRef<number | null>(null);
  const last = called.length > 0 ? called[called.length - 1] : null;

  useEffect(() => {
    const seq = last?.seq ?? 0;
    const previous = lastSeq.current;
    lastSeq.current = seq;
    if (!enabled || !last || previous === null || seq <= previous) return;
    setFlash({ seq: last.seq, number: last.number });
    const t = window.setTimeout(() => setFlash((f) => (f?.seq === last.seq ? null : f)), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [last, enabled]);

  return enabled && flash ? flash.number : null;
}

export function Game({ state, token, refresh }: Props) {
  const { room, me, players, board, called } = state;
  const base = `/api/rooms/${room.code}`;
  const playing = room.status === "playing";
  const isHost = room.hostPlayerId === me.id;
  const myTurn = playing && room.currentTurnPlayerId === me.id;
  const total = room.size * room.size;

  const [confirmCall] = useBoolPref(PREF_CONFIRM_CALL, false);
  const [soundOn] = useBoolPref(PREF_SOUND, true);
  const playLine = useLineSound(soundOn);
  const [showLast] = useBoolPref(PREF_SHOW_LAST, false);
  const flashed = useFlashedNumber(called, showLast);

  const [selected, setSelected] = useState<number | null>(null);
  // Optimistic marks not yet confirmed by the server: number -> desired marked state.
  const [pending, setPending] = useState<Map<number, boolean>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ won: boolean; message: string } | null>(null);
  const [hintOn, setHintOn] = useState(false);
  // Winner pop-up: shown once per finished round, until dismissed.
  const [dismissedRound, setDismissedRound] = useState<number | null>(null);
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
  // Marked but never called: these make a line invalid at validation.
  const wrongMarks = useMemo(() => [...marked].filter((n) => !calledSet.has(n)).length, [marked, calledSet]);

  // A selection is only meaningful while it is still my turn and the number is still free.
  const pick = myTurn && selected !== null && !calledSet.has(selected) ? selected : null;
  const turnName = room.currentTurnPlayerId ? nick.get(room.currentTurnPlayerId) : null;
  const winnerName = room.winnerPlayerId ? nick.get(room.winnerPlayerId) : null;

  /**
   * Plays the fragment when marking `n` completes a new *valid* line (every cell marked and really
   * called). `justCalled` = n is being called right now by me. Call inside the tap handler.
   */
  function cueIfNewLine(n: number, justCalled = false) {
    if (!board || marked.has(n)) return;
    const calledNow = justCalled ? new Set(calledSet).add(n) : calledSet;
    const before = countValidLines(board, room.size, marked, calledSet);
    const after = countValidLines(board, room.size, new Set(marked).add(n), calledNow);
    if (after > before) playLine();
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
    cueIfNewLine(n, true); // the caller's number is marked for them by the server
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
    if (calledSet.has(value)) {
      // A called number can only be ticked, never un-ticked (the server enforces it too).
      if (!marked.has(value)) void toggleMark(value);
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
    if (missed === 0 && wrongMarks === 0) {
      setNotice("Ești la zi: ai bifat toate numerele strigate și nimic nestrigat. Nu am consumat niciun ajutor.");
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
    if (hintOn && marked.has(v) && !calledSet.has(v)) return "wrong";
    if (marked.has(v)) return calledByMe.has(v) ? "mine" : "marked";
    if (hintOn && calledSet.has(v)) return "hint";
    return "plain";
  }

  return (
    <div className="flex flex-col gap-4">
      {flashed !== null && (
        <div aria-live="polite" className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <div className="rounded-3xl border-8 border-orange-500 bg-white px-10 py-6 text-center shadow-2xl dark:bg-zinc-950">
            <p className="text-xs font-semibold uppercase text-orange-600">Ultimul număr</p>
            <p className="text-7xl font-black tabular-nums text-orange-600">{flashed}</p>
          </div>
        </div>
      )}
      {room.status === "finished" && dismissedRound !== room.round && (
        <WinnerOverlay
          name={room.winnerPlayerId === me.id ? null : (winnerName ?? "Cineva")}
          onClose={() => setDismissedRound(room.round)}
        />
      )}
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
      ) : null}

      <Card className={myTurn ? "border-indigo-400 ring-2 ring-indigo-400" : ""}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-bold">Matricea ta</h2>
          <span className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-200 ring-1 ring-emerald-400" /> strigat de tine
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-700" /> de alții
          </span>
        </div>
        {myTurn && (
          <p className="mb-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            {called.length >= total
              ? "Tura ta: toate numerele au fost strigate."
              : !confirmCall
                ? "Tura ta: apasă un număr nestrigat."
                : pick === null
                  ? "Tura ta: alege un număr nestrigat."
                  : `Ai ales ${pick}. Confirmă mai jos.`}
          </p>
        )}
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
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className={`flex-1 basis-0 ${hintOn ? "ring-2 ring-yellow-400" : ""}`}
                onClick={() => setHint(!hintOn)}
                disabled={busy || (!hintOn && state.hintsLeft === 0)}
                title={`Timp de ${HINT_HIGHLIGHT_MS / 1000} secunde: galben = strigate dar nebifate, roșu = bifate dar nestrigate.`}
              >
                Show {state.hintsLeft}/{hintsPerRound(room.size)}
              </Button>
              <Button variant="secondary" className="flex-1 basis-0" onClick={() => void validate()} disabled={busy}>
                Validează ({room.linesToWin} {room.linesToWin === 1 ? "linie" : "linii"})
              </Button>
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-bold">
            Numere strigate <span className="font-normal text-zinc-500">({called.length})</span>
          </h2>
          {playing && (
            <span
              className={`max-w-[55%] truncate rounded-lg border-2 px-2.5 py-1 text-sm ${
                myTurn
                  ? "animate-pulse border-indigo-600 bg-indigo-600 text-white"
                  : "border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
              }`}
            >
              Tura: <strong>{myTurn ? "tu" : (turnName ?? "—")}</strong>
              {!myTurn && (
                <>
                  {" "}
                  <OfflineBadge connected={players.find((p) => p.id === room.currentTurnPlayerId)?.connected} />
                </>
              )}
            </span>
          )}
        </div>
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
export function RevealedBoards({ state }: { state: RoomState }) {
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

/** Full-screen "BINGO" pop-up when the game ends. `name` null = I won. */
function WinnerOverlay({ name, onClose }: { name: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Câștigător"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-amber-300 to-amber-500 p-8 text-center text-zinc-900 shadow-2xl"
      >
        <div className="animate-bounce text-7xl" aria-hidden>
          🏆
        </div>
        <p className="mt-2 text-5xl font-black tracking-tight">BINGO!</p>
        <p className="mt-3 text-2xl font-bold">{name === null ? "Ai câștigat!" : `${name} a câștigat!`}</p>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-6 min-h-11 w-full rounded-xl bg-zinc-900 px-4 font-semibold text-white"
        >
          Vezi cardurile
        </button>
      </div>
    </div>
  );
}
