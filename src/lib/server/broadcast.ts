import "server-only";
import { db } from "./db";

export const roomTopic = (roomId: string) => `room:${roomId}`;

/**
 * Tells every client in the room that state changed. Payload carries no game data:
 * clients re-fetch /state (authenticated). Failures are logged, never thrown -
 * the DB write already succeeded and clients also poll as a fallback.
 */
export async function notifyRoom(roomId: string, kind: string): Promise<void> {
  const channel = db().channel(roomTopic(roomId));
  try {
    const res = await channel.httpSend("refresh", { kind, at: Date.now() });
    if (!res.success) console.error("broadcast failed", res.status, res.error);
  } catch (err) {
    console.error("broadcast failed", err);
  } finally {
    await db().removeChannel(channel);
  }
}
