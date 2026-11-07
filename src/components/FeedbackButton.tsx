"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { withBase } from "@/lib/client/api";
import { PREF_NICKNAME, useStringPref } from "@/lib/client/prefs";
import { Button, ErrorText } from "./ui";

const MAX = 1000;

export function FeedbackButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const nickname = useStringPref(PREF_NICKNAME);
  const area = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  useEffect(() => {
    if (open) area.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => {
      setOpen(false);
      setSent(false);
    }, 1800);
    return () => clearTimeout(t);
  }, [sent]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(withBase("/api/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, nickname: nickname ?? "", website }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Nu am putut trimite mesajul. Încearcă din nou.");
      }
      setMessage("");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut trimite mesajul. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setError("");
          setSent(false);
          setOpen(true);
        }}
        className={`shrink-0 rounded-lg border border-zinc-300 font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 ${
          compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
        }`}
      >
        💬 Feedback
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <h2 id="feedback-title" className="sr-only">
              Feedback
            </h2>
            {sent ? (
              <p role="status" className="py-8 text-center font-semibold">
                Mulțumim! Mesajul a ajuns.
              </p>
            ) : (
              <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Ce problemă ai găsit sau ce am putea îmbunătăți?
                  <textarea
                    ref={area}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MAX}
                    rows={5}
                    required
                    className="rounded-lg border border-zinc-300 bg-white p-3 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <span className="self-end text-xs font-normal text-zinc-500">
                    {message.length}/{MAX}
                  </span>
                </label>
                <input
                  type="text"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />
                <ErrorText>{error}</ErrorText>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={close}>
                    Anulează
                  </Button>
                  <Button type="submit" disabled={busy || message.trim().length === 0}>
                    {busy ? "Se trimite…" : "Trimite"}
                  </Button>
                </div>
                <a
                  href="/feedback"
                  className="text-center text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                >
                  Vezi tot feedback-ul →
                </a>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
