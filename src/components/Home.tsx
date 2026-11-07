"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiRequestError, clearSession, deviceId, listSessions, parseSession, readSessionRaw, saveSession } from "@/lib/client/api";
import { PREF_NICKNAME, useStringPref, writePref } from "@/lib/client/prefs";
import { LINES_MAX, LINES_MIN, NICKNAME_MAX, SIZE_DEFAULT, SIZE_MAX, SIZE_MIN } from "@/lib/game";
import type { RoomListItem, RoomState } from "@/lib/types";
import { FeedbackButton } from "./FeedbackButton";
import { RoomList } from "./RoomList";
import { Button, Card, ErrorText, Field } from "./ui";

interface JoinResult {
  code: string;
  playerId: string;
  token: string;
}

export function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Nickname defaults to the last one used on this device.
  const storedNickname = useStringPref(PREF_NICKNAME);
  const [typedNickname, setNickname] = useState<string | null>(null);
  const nickname = typedNickname ?? storedNickname ?? "";
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [size, setSize] = useState(SIZE_DEFAULT);
  const [lines, setLines] = useState(1);
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<RoomListItem | null>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);

  function pickRoom(room: RoomListItem) {
    setPicked(room);
    setCode(room.code);
    setPassword("");
    setError("");
    nicknameRef.current?.focus();
  }

  // Password field is hidden only when the picked room is known to have none.
  const showPassword = tab === "create" || !(picked && picked.code === code && !picked.hasPassword);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const joinCode = code.trim().toUpperCase();
    // Already a member on this device: go back to the seat instead of joining again.
    if (tab === "join" && parseSession(readSessionRaw(joinCode))) {
      router.push(`/room/${joinCode}`);
      return;
    }
    setBusy(true);
    setError("");
    writePref(PREF_NICKNAME, nickname.trim());
    try {
      const res =
        tab === "create"
          ? await api<JoinResult>("/api/rooms", {
              body: { name: roomName, nickname, password, size, linesToWin: lines, deviceId: deviceId() },
            })
          : await api<JoinResult>(`/api/rooms/${encodeURIComponent(joinCode)}/join`, {
              body: { nickname, password, deviceId: deviceId() },
            });
      saveSession(res.code, { playerId: res.playerId, token: res.token });
      router.push(`/room/${res.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-2">
        <a href="https://hailatat.icu" className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300">
          ← Back to haiLaTăt.icu hub
        </a>
        <FeedbackButton />
      </div>
      <header className="text-center">
        <h1 className="text-4xl font-black tracking-tight">Bingo</h1>
        <p className="mt-1 text-sm text-zinc-500">Bingo-ul de pe hârtie, jucat cu prietenii, pe telefon.</p>
      </header>

      <RejoinCards onRejoin={(c) => router.push(`/room/${c}`)} />

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800" role="tablist">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setError("");
            }}
            className={`min-h-10 rounded-lg text-sm font-semibold ${tab === t ? "bg-white shadow dark:bg-zinc-950" : "text-zinc-600 dark:text-zinc-400"}`}
          >
            {t === "create" ? "Creează cameră" : "Intră în cameră"}
          </button>
        ))}
      </div>

      {tab === "join" && (
        <Card>
          <h2 className="mb-3 font-bold">Camere disponibile</h2>
          <RoomList
            selected={picked?.code === code ? code : null}
            onSelect={pickRoom}
            onRejoin={(c) => router.push(`/room/${c}`)}
          />
        </Card>
      )}

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {tab === "join" && (
            <Field
              label="Codul camerei"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="ex. K7QM2X"
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              required
            />
          )}
          {tab === "create" && (
            <Field
              label="Numele camerei"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              maxLength={40}
              required
            />
          )}
          <Field
            ref={nicknameRef}
            label="Nickname-ul tău"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            required
          />
          {showPassword && (
            <Field
              label={
                tab === "create"
                  ? "Parolă (opțional)"
                  : picked?.code === code
                    ? "Parola camerei"
                    : "Parolă (dacă are camera)"
              }
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={100}
              autoComplete="off"
              required={tab === "join" && picked?.code === code && picked.hasPassword}
            />
          )}

          {tab === "create" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Matrice N×N
                <select
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {Array.from({ length: SIZE_MAX - SIZE_MIN + 1 }, (_, i) => SIZE_MIN + i).map((n) => (
                    <option key={n} value={n}>
                      {n}×{n} (1–{n * n})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Linii pentru câștig
                <select
                  value={lines}
                  onChange={(e) => setLines(Number(e.target.value))}
                  className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {Array.from({ length: LINES_MAX - LINES_MIN + 1 }, (_, i) => LINES_MIN + i).map((l) => (
                    <option key={l} value={l}>
                      {l} {l === 1 ? "linie" : "linii"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy}>
            {busy ? "Se încarcă…" : tab === "create" ? "Creează camera" : "Intră"}
          </Button>
        </form>
      </Card>

      <details className="text-sm text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer font-semibold">Reguli</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Fiecare are o matrice N×N cu numerele 1–N², fiecare o singură dată.</li>
          <li>Pe rând, fiecare strigă un număr nestrigat din matricea lui.</li>
          <li>Bifezi singur numerele strigate de ceilalți. Aplicația nu bifează în locul tău.</li>
          <li>O linie înseamnă un rând, o coloană sau o diagonală principală.</li>
          <li>Când ai liniile necesare, apasă „Validează”. Dacă toate numerele din ele au fost strigate, câștigi.</li>
        </ol>
      </details>
    </main>
  );
}

/**
 * Rooms this device still has a valid seat in (lobby or a running game, which the public list does not
 * show). Stored sessions are checked once against /state; 401/404 ones are dropped.
 */
function RejoinCards({ onRejoin }: { onRejoin: (code: string) => void }) {
  const [rooms, setRooms] = useState<{ code: string; name: string; status: RoomState["room"]["status"] }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const checks = await Promise.all(
        listSessions().map(async ({ code, session }) => {
          try {
            const s = await api<RoomState>(`/api/rooms/${code}/state`, { token: session.token });
            return { code, name: s.room.name, status: s.room.status };
          } catch (err) {
            if (err instanceof ApiRequestError && (err.status === 401 || err.status === 404)) clearSession(code);
            return null;
          }
        }),
      );
      if (!cancelled) setRooms(checks.filter((r) => r !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rooms.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {rooms.map((r) => (
        <button
          key={r.code}
          type="button"
          onClick={() => onRejoin(r.code)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-left dark:border-indigo-800 dark:bg-indigo-950"
        >
          <span className="min-w-0">
            <span className="block font-bold">
              Revino în camera <span className="font-mono tracking-widest">{r.code}</span>
            </span>
            <span className="block truncate text-xs text-zinc-600 dark:text-zinc-400">
              {r.name}
              {r.status === "playing" ? " · joc în desfășurare" : r.status === "finished" ? " · rundă terminată" : ""}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-indigo-600 dark:text-indigo-400">Reintră →</span>
        </button>
      ))}
    </div>
  );
}
