"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { KICK_NETWORK_GRACE_MS } from "@/lib/kick";

/** Client time (Date.now) at which the current room state arrived; countdowns run from it. */
export const StateClockContext = createContext(0);

/**
 * Local countdown of a pending kick. `remainingMs` is what the server reported at `receivedAt`
 * (a duration, so client clock skew does not matter). Returns ms left (null = no pending kick).
 * When it reaches 0 it calls `onExpire` (a refresh) once, and once more after the server's network
 * grace, because the server only enforces the removal after KICK_GRACE_MS + that grace.
 */
export function useKickCountdown(remainingMs: number | null, receivedAt: number, onExpire?: () => void): number | null {
  const [now, setNow] = useState(() => Date.now());
  const pending = remainingMs !== null;
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  });

  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [pending]);

  const left = remainingMs === null ? null : Math.max(0, remainingMs - Math.max(0, now - receivedAt));
  const expired = left === 0;

  // Keyed on the false -> true transition only, so repeated refreshes do not re-trigger it.
  useEffect(() => {
    if (!expired) return;
    expireRef.current?.();
    const t = window.setTimeout(() => expireRef.current?.(), KICK_NETWORK_GRACE_MS + 300);
    return () => window.clearTimeout(t);
  }, [expired]);

  return left;
}

export const secondsLeft = (ms: number) => Math.ceil(ms / 1000);
