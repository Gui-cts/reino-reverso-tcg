import { randomBytes } from "node:crypto";
import { dispatch } from "../game/actions";
import { canSubmitAction } from "../game/permissions";
import { createInitialGame, reassignPlayerLeader } from "../game/state";
import { toPlayerView } from "./player-view";
import { loadCatalogSync } from "../server/load-catalog";
import type { GameAction, GameState, PlayerId } from "../game/types";

export type RoomRecord = {
  id: string;
  state: GameState;
  version: number;
  tokens: [string | null, string | null];
  updatedAt: number;
};

export type RoomCreateResult = {
  roomId: string;
  token: string;
  seat: PlayerId;
  view: ReturnType<typeof toPlayerView>;
  room: RoomRecord;
};

export type RoomJoinResult = {
  seat: PlayerId;
  token: string;
  view: ReturnType<typeof toPlayerView>;
};

export type RoomActionResult =
  | { ok: true; view: ReturnType<typeof toPlayerView> }
  | { ok: false; error: string; view: ReturnType<typeof toPlayerView> | null };

function newToken(): string {
  return randomBytes(16).toString("hex");
}

function newRoomId(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

function seatFromToken(room: RoomRecord, token: string): PlayerId | null {
  if (room.tokens[0] === token) return 0;
  if (room.tokens[1] === token) return 1;
  return null;
}

function viewFor(room: RoomRecord, seat: PlayerId) {
  return toPlayerView(room.state, seat, {
    version: room.version,
    seat,
    handCounts: [
      room.state.players[0].hand.length,
      room.state.players[1].hand.length,
    ],
    deckCounts: [
      room.state.players[0].deck.length,
      room.state.players[1].deck.length,
    ],
    bothConnected: room.tokens[0] !== null && room.tokens[1] !== null,
    roomId: room.id,
  });
}

export function buildNewRoom(leaderId?: string): RoomRecord {
  const catalog = loadCatalogSync();
  const state = createInitialGame(catalog, { cpuPlayer: null, leaderId });
  const roomId = newRoomId();
  const token = newToken();
  return {
    id: roomId,
    state,
    version: 1,
    tokens: [token, null],
    updatedAt: Date.now(),
  };
}

export function createRoom(leaderId?: string): RoomCreateResult {
  const room = buildNewRoom(leaderId);
  const token = room.tokens[0]!;
  return {
    roomId: room.id,
    token,
    seat: 0,
    view: viewFor(room, 0),
    room,
  };
}

export function joinRoom(
  room: RoomRecord,
  leaderId?: string,
): RoomJoinResult | { error: string } {
  if (room.tokens[1]) return { error: "Sala cheia." };

  if (leaderId) {
    const catalog = loadCatalogSync();
    const next = reassignPlayerLeader(room.state, 1, leaderId, catalog.starterDeck);
    if ("error" in next) return { error: next.error };
    room.state = next;
    room.version += 1;
  }

  const token = newToken();
  room.tokens[1] = token;
  room.updatedAt = Date.now();
  return { seat: 1, token, view: viewFor(room, 1) };
}

export function applyRoomAction(
  room: RoomRecord,
  token: string,
  action: GameAction,
): RoomActionResult {
  const seat = seatFromToken(room, token);
  if (seat === null) {
    return { ok: false, error: "Token inválido.", view: null };
  }

  if (!canSubmitAction(room.state, seat, action)) {
    return {
      ok: false,
      error: "Ação inválida ou fora da sua vez.",
      view: viewFor(room, seat),
    };
  }

  const beforeLog = room.state.log.length;
  const next = dispatch(room.state, action);

  room.state = next;
  room.version += 1;
  room.updatedAt = Date.now();
  if (next.log.length === beforeLog && action.type !== "END_TURN") {
    // Ainda sincroniza — algumas ações válidas não geram log.
  }
  return { ok: true, view: viewFor(room, seat) };
}

export function getRoomView(room: RoomRecord, token: string) {
  const seat = seatFromToken(room, token);
  if (seat === null) return null;
  return viewFor(room, seat);
}

export { viewFor, seatFromToken, newRoomId, newToken };
export type { RoomRecord as Room };
