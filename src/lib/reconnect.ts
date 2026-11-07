// Rejoin the same seat. Every authenticated request stamps classicbingo_players.last_seen_at (at most every
// LAST_SEEN_TOUCH_MS); a seat not seen for DISCONNECT_MS counts as disconnected. Re-joining with the
// nickname of an existing seat reclaims it (new token, same player id) when it comes from the same
// device or when the seat is disconnected. Pure, used by server and client.

/** A seat not seen for this long is shown as "deconectat" and can be reclaimed from another device. */
export const DISCONNECT_MS = 45_000;
/** requireMember refreshes last_seen_at at most this often, to keep DB writes low. */
export const LAST_SEEN_TOUCH_MS = 10_000;

type Stamp = string | number | Date;
const ms = (t: Stamp) => (t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t));

/** True while the seat was seen less than DISCONNECT_MS ago (unknown stamp = not connected). */
export function isConnected(lastSeenAt: Stamp | null | undefined, now: number): boolean {
  if (lastSeenAt === null || lastSeenAt === undefined) return false;
  const t = ms(lastSeenAt);
  return !Number.isNaN(t) && now - t < DISCONNECT_MS;
}

/** Device ids are random UUIDs made by the browser (see deviceId() in client/api.ts). */
export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * What a join with the nickname of an existing seat does:
 *  - "device": same device as the seat -> reclaim it
 *  - "stale":  another (or unknown) device, but the seat is disconnected -> reclaim it
 *  - "busy":   the seat is in use right now -> 409 (seatBusyMessage)
 */
export function seatClaim(
  seat: { device_hash: string | null; last_seen_at: Stamp | null },
  deviceHash: string | null,
  now: number,
): "device" | "stale" | "busy" {
  if (deviceHash !== null && seat.device_hash !== null && seat.device_hash === deviceHash) return "device";
  return isConnected(seat.last_seen_at, now) ? "busy" : "stale";
}

export function seatBusyMessage(nickname: string): string {
  return `${nickname} e conectat acum. Dacă ești tu, închide celălalt tab sau așteaptă ${DISCONNECT_MS / 1000} de secunde.`;
}
