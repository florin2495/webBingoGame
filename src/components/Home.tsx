"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, saveSession } from "@/lib/client/api";
import { LINES_MAX, LINES_MIN, SIZE_DEFAULT, SIZE_MAX, SIZE_MIN } from "@/lib/game";
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

  const [nickname, setNickname] = useState("");
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [size, setSize] = useState(SIZE_DEFAULT);
  const [lines, setLines] = useState(1);
  const [code, setCode] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res =
        tab === "create"
          ? await api<JoinResult>("/api/rooms", {
              body: { name: roomName, nickname, password, size, linesToWin: lines },
            })
          : await api<JoinResult>(`/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`, {
              body: { nickname, password },
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
      <header className="text-center">
        <h1 className="text-4xl font-black tracking-tight">Bingo</h1>
        <p className="mt-1 text-sm text-zinc-500">Bingo-ul de pe hârtie, jucat cu prietenii, pe telefon.</p>
      </header>

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

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {tab === "join" && (
            <Field
              label="Codul camerei"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
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
            label="Nickname-ul tău"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            required
          />
          <Field
            label={tab === "create" ? "Parolă (opțional)" : "Parolă (dacă are camera)"}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />

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
