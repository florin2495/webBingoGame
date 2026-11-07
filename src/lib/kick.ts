/** Pending kick: the host's kick during a running game gives the player time to press "Ignoră". */
export const KICK_GRACE_MS = 10_000;
/** Network grace on top of the grace period, for both "Ignoră" and the server-side expiry. */
export const KICK_NETWORK_GRACE_MS = 2_000;
export const KICK_EXPIRY_MS = KICK_GRACE_MS + KICK_NETWORK_GRACE_MS;

const toMs = (v: string | number): number => (typeof v === "number" ? v : new Date(v).getTime());

/** Milliseconds left for a pending kick, clamped to [0, KICK_GRACE_MS]. null = no pending kick. */
export function kickRemainingMs(requestedAt: string | number | null | undefined, now: number): number | null {
  if (requestedAt === null || requestedAt === undefined) return null;
  const t = toMs(requestedAt);
  if (Number.isNaN(t)) return null;
  return Math.min(KICK_GRACE_MS, Math.max(0, KICK_GRACE_MS - (now - t)));
}

/** True once the kick is older than grace + network grace: the player is to be removed. */
export function isKickExpired(requestedAt: string | number | null | undefined, now: number): boolean {
  if (requestedAt === null || requestedAt === undefined) return false;
  const t = toMs(requestedAt);
  return !Number.isNaN(t) && now - t > KICK_EXPIRY_MS;
}
