export type RoomStatus = "lobby" | "playing" | "finished";

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  ready: boolean;
  /** Ms left of a pending kick (host kicked this player mid-game), null = none. Max KICK_GRACE_MS. */
  kickRemainingMs: number | null;
  /** Seen in the last 45 s (see lib/reconnect.ts). False = phone in the background, closed tab, no network. */
  connected: boolean;
}

/** Someone watching a room that was already running. `queued` = wants to play from the next round. */
export interface PublicSpectator {
  id: string;
  nickname: string;
  queued: boolean;
  connected: boolean;
}

export interface CalledNumber {
  seq: number;
  number: number;
  playerId: string | null;
}

/** What GET /api/rooms/[code]/state returns to a member. Never contains other players' boards. */
export interface RoomState {
  room: {
    id: string;
    code: string;
    name: string;
    size: number;
    linesToWin: number;
    status: RoomStatus;
    round: number;
    hasPassword: boolean;
    hostPlayerId: string | null;
    winnerPlayerId: string | null;
    currentTurnPlayerId: string | null;
  };
  /** Turn order while playing/finished, join order in the lobby. */
  players: PublicPlayer[];
  /** Spectators in queue order first, then the others. Public: nickname and queue flag only. */
  spectators: PublicSpectator[];
  /** "spectator": read-only view; `me` is then a stand-in (never host, never ready) and board/marks are empty. */
  role: "player" | "spectator";
  /** Spectator only: queued to play from the next round. */
  queued: boolean;
  me: PublicPlayer;
  board: number[] | null;
  marks: number[];
  called: CalledNumber[];
  /** Hints left for the caller in this round. */
  hintsLeft: number;
  /** Everyone's board + marks - only present once the game is finished. */
  reveal: RevealedBoard[] | null;
}

export interface RevealedBoard {
  playerId: string;
  board: number[];
  marks: number[];
}

/** Item of the public room list (GET /api/rooms). */
export interface RoomListItem {
  code: string;
  name: string;
  size: number;
  linesToWin: number;
  hasPassword: boolean;
  players: number;
}

export interface Session {
  playerId: string;
  token: string;
}
