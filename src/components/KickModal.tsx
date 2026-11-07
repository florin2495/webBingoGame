"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { secondsLeft, useKickCountdown } from "@/lib/client/kick";
import { Button, ErrorText } from "./ui";

interface Props {
  code: string;
  token: string;
  remainingMs: number;
  receivedAt: number;
  refresh: () => Promise<void>;
}

/** Blocking modal for a player the host kicked mid-game: "Ignoră" within the countdown keeps them in. */
export function KickModal({ code, token, remainingMs, receivedAt, refresh }: Props) {
  const left = useKickCountdown(remainingMs, receivedAt, () => void refresh()) ?? 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ignore() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/rooms/${code}/kick/ignore`, { token, body: {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
    }
    // Also on failure: the refresh shows the truth (still here, or removed -> join form).
    await refresh();
    setBusy(false);
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="kick-title"
      aria-describedby="kick-text"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <h2 id="kick-title" className="text-xl font-black text-rose-600 dark:text-rose-400">
          Ai fost scos din joc
        </h2>
        <p id="kick-text" className="mt-3 text-base">
          Gazda te-a scos din cameră. Apasă „Ignoră” în {secondsLeft(left)} s ca să rămâi în joc.
        </p>
        <p aria-hidden className="mt-3 text-5xl font-black tabular-nums">
          {secondsLeft(left)}
        </p>
        <Button className="mt-5 w-full" onClick={() => void ignore()} disabled={busy} autoFocus>
          Ignoră
        </Button>
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </div>
  );
}
