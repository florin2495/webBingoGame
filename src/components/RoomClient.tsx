"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  api,
  ApiRequestError,
  clearSession,
  parseSession,
  readSessionRaw,
  saveSession,
  subscribeSession,
} from "@/lib/client/api";
import { PREF_NICKNAME, useStringPref, writePref } from "@/lib/client/prefs";
import { realtimeClient } from "@/lib/client/realtime";
import { minutesLabel, NICKNAME_MAX, ROOM_IDLE_MINUTES } from "@/lib/game";
import type { RoomState } from "@/lib/types";
import { FeedbackButton } from "./FeedbackButton";
import { Game } from "./Game";
import { Lobby } from "./Lobby";
import { SettingsPanel } from "./SettingsPanel";
import { Button, Card, ErrorText, Field } from "./ui";

const POLL_MS = 15_000;
const removedKey = (code: string) => `bingo:removed:${code}`;
const SERVER_SNAPSHOT = "__server__";

export function RoomClient({ code }: { code: string }) {
  const raw = useSyncExternalStore(
    subscribeSession,
    () => readSessionRaw(code),
    () => SERVER_SNAPSHOT,
  );
  const session = useMemo(() => (raw === SERVER_SNAPSHOT ? undefined : parseSession(raw)), [raw]);

  if (session === undefined) return <Loading />;
  if (session === null) return <JoinForm code={code} />;
  return <Room code={code} token={session.token} />;
}

function Loading() {
  return <p className="p-8 text-center text-zinc-500">Se încarcă…</p>;
}

function useRoomState(code: string, token: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    try {
      const s = await api<RoomState>(`/api/rooms/${code}/state`, { token });
      if (id !== latest.current) return; // a newer request already answered
      setState(s);
      setError("");
    } catch (err) {
      if (id !== latest.current) return;
      if (err instanceof ApiRequestError && err.status === 401) {
        writePref(removedKey(code), "1"); // kicked (or session gone): explain it on the join form
        clearSession(code); // token no longer valid for this room -> show join form
      } else if (err instanceof ApiRequestError && err.status === 404) {
        setMissing(true);
      } else {
        setError(err instanceof Error ? err.message : "Eroare.");
      }
    }
  }, [code, token]);

  // Initial load, polling fallback, refresh when the tab becomes visible again.
  useEffect(() => {
    const kick = () => void refresh();
    const timer = window.setTimeout(kick, 0);
    const interval = window.setInterval(kick, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && kick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Realtime: the server broadcasts a bare "refresh" signal; we re-fetch authenticated state.
  const roomId = state?.room.id;
  useEffect(() => {
    const client = realtimeClient();
    if (!roomId || !client) return;
    const channel = client
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "refresh" }, () => void refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh(); // catch anything missed while connecting
      });
    return () => {
      void client.removeChannel(channel);
    };
  }, [roomId, refresh]);

  return { state, error, missing, refresh };
}

function Room({ code, token }: { code: string; token: string }) {
  const { state, error, missing, refresh } = useRoomState(code, token);

  if (missing) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-lg font-semibold">Camera {code} nu mai există.</p>
        <p className="text-sm text-zinc-500">
          Camerele se închid automat după {minutesLabel(ROOM_IDLE_MINUTES)} în care nimeni nu le are deschise.
        </p>
        <Link href="/" className="font-semibold text-indigo-600 underline">
          Înapoi la început
        </Link>
      </main>
    );
  }
  if (!state) {
    return error ? (
      <main className="mx-auto max-w-md px-4 py-12 text-center">
        <ErrorText>{error}</ErrorText>
        <Button className="mt-4" onClick={() => void refresh()}>
          Reîncearcă
        </Button>
      </main>
    ) : (
      <Loading />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4">
      <RoomHeader state={state} />
      {error && <ErrorText>Conexiune instabilă: {error}</ErrorText>}
      {state.room.status === "lobby" ? (
        <Lobby state={state} token={token} refresh={refresh} />
      ) : (
        <Game state={state} token={token} refresh={refresh} />
      )}
      <SettingsPanel />
      <LeaveButton state={state} token={token} />
    </main>
  );
}

function LeaveButton({ state, token }: { state: RoomState; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { room, me, players } = state;
  const isHost = room.hostPlayerId === me.id;
  const alone = players.length <= 1;

  async function leave() {
    const warning = alone
      ? "Ești singur în cameră. Dacă pleci, camera se închide. Continui?"
      : room.status === "playing"
        ? "Părăsești jocul în desfășurare. Nu mai poți reveni în runda asta. Continui?"
        : isHost
          ? "Ești host. Dacă pleci, următorul jucător devine host. Continui?"
          : "Sigur vrei să părăsești camera?";
    if (!window.confirm(warning)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/rooms/${room.code}/leave`, { token, body: {} });
    } catch (err) {
      // 401/404: we are already out of the room - leaving locally is still correct.
      if (!(err instanceof ApiRequestError && (err.status === 401 || err.status === 404))) {
        setError(err instanceof Error ? err.message : "Eroare.");
        setBusy(false);
        return;
      }
    }
    router.push("/");
    clearSession(room.code);
  }

  return (
    <div className="pb-6 pt-2 text-center">
      <Button variant="danger" className="w-full" onClick={() => void leave()} disabled={busy}>
        {busy ? "Se iese…" : room.status === "playing" ? "Părăsește jocul" : "Părăsește camera"}
      </Button>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}

function RoomHeader({ state }: { state: RoomState }) {
  const { room } = state;
  const [copied, setCopied] = useState(false);

  async function invite() {
    const url = `${window.location.origin}/room/${room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Bingo: ${room.name}`, text: `Intră în camera ${room.code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // user cancelled share / clipboard blocked
    }
  }

  const statusLabel = { lobby: "Lobby", playing: "În desfășurare", finished: "Terminat" }[room.status];

  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Link href="/" className="text-xs font-semibold text-zinc-500">
          ← Bingo
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-xl font-black">{room.name}</h1>
          <FeedbackButton compact />
        </div>
        <p className="text-xs text-zinc-500">
          {room.size}×{room.size} · {room.linesToWin} {room.linesToWin === 1 ? "linie" : "linii"} pentru câștig · runda{" "}
          {room.round} · {statusLabel}
        </p>
      </div>
      <button
        onClick={() => void invite()}
        className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-center dark:border-zinc-700"
        aria-label="Invită prieteni"
      >
        <span className="block font-mono text-lg font-bold tracking-widest">{room.code}</span>
        <span className="block text-[10px] font-semibold uppercase text-zinc-500">
          {copied ? "Link copiat" : "Invită"}
        </span>
      </button>
    </header>
  );
}

function JoinForm({ code }: { code: string }) {
  const stored = useStringPref(PREF_NICKNAME);
  const [typed, setNickname] = useState<string | null>(null);
  const nickname = typed ?? stored ?? "";
  const [password, setPassword] = useState("");
  const removed = useStringPref(removedKey(code)) === "1";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    writePref(PREF_NICKNAME, nickname.trim());
    try {
      const res = await api<{ code: string; playerId: string; token: string }>(`/api/rooms/${code}/join`, {
        body: { nickname, password },
      });
      writePref(removedKey(code), "0");
      saveSession(res.code, { playerId: res.playerId, token: res.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-center text-2xl font-black">
        Intră în camera <span className="font-mono tracking-widest">{code}</span>
      </h1>
      {removed && (
        <p role="status" className="rounded-lg bg-amber-100 px-3 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Nu mai ești în cameră: ai fost scos de host sau sesiunea ta a expirat. Poți reintra cât camera e în lobby.
        </p>
      )}
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nickname-ul tău" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={NICKNAME_MAX} required />
          <Field
            label="Parolă (dacă are camera)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy}>
            {busy ? "Se încarcă…" : "Intră"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
