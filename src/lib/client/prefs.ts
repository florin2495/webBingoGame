"use client";

import { useCallback, useSyncExternalStore } from "react";

// Per-device UI preferences (localStorage, with in-memory fallback).
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writePref(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // memory fallback already set
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function readPref(key: string): string | null {
  return typeof window === "undefined" ? null : read(key);
}

/** Boolean preference persisted per device. */
export function useBoolPref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = raw === null ? fallback : raw === "1";
  const set = useCallback((v: boolean) => writePref(key, v ? "1" : "0"), [key]);
  return [value, set];
}

/** String preference persisted per device (null until set / during SSR). */
export function useStringPref(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
}

// v2: default changed to "off" - a new key so every device picks up the new default once.
export const PREF_CONFIRM_CALL = "bingo:pref:confirmCall:v2";
export const PREF_SOUND = "bingo:pref:sound:v2";
export const PREF_NICKNAME = "bingo:pref:nickname";
