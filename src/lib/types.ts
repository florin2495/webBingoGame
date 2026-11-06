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
}

export interface Session {
  playerId: string;
  token: string;
}
