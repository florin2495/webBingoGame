export type RoomStatus = "lobby" | "playing" | "finished";

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  ready: boolean;
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
  minutesLeft: number;
}

export interface Session {
  playerId: string;
  token: string;
}
