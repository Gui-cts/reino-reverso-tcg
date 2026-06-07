import type { PlayerRecord } from "./player-types";

declare global {
  // eslint-disable-next-line no-var
  var __rrPlayers: Map<string, PlayerRecord> | undefined;
  // eslint-disable-next-line no-var
  var __rrPlayerTokens: Map<string, string> | undefined;
  // eslint-disable-next-line no-var
  var __rrPlayerIndex: string[] | undefined;
}

const players = globalThis.__rrPlayers ?? new Map<string, PlayerRecord>();
const tokens = globalThis.__rrPlayerTokens ?? new Map<string, string>();
let playerIndex = globalThis.__rrPlayerIndex ?? [];

globalThis.__rrPlayers = players;
globalThis.__rrPlayerTokens = tokens;
globalThis.__rrPlayerIndex = playerIndex;

export async function getPlayerByNickKey(nickKey: string): Promise<PlayerRecord | null> {
  return players.get(nickKey) ?? null;
}

export async function getNickKeyByToken(token: string): Promise<string | null> {
  return tokens.get(token) ?? null;
}

export async function savePlayerRecord(player: PlayerRecord): Promise<void> {
  players.set(player.nickKey, player);
  tokens.set(player.token, player.nickKey);
}

export async function deleteTokenMapping(token: string): Promise<void> {
  tokens.delete(token);
}

export async function readPlayerIndex(): Promise<string[]> {
  return [...playerIndex];
}

export async function writePlayerIndex(keys: string[]): Promise<void> {
  playerIndex = [...keys];
  globalThis.__rrPlayerIndex = playerIndex;
}
