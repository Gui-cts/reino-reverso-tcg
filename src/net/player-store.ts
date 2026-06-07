import type { PlayerRecord } from "./player-types";
import * as memory from "./player-store-memory";
import { isPersistentStore } from "./room-store-memory";

const PLAYER_PREFIX = "rr-player:";
const TOKEN_PREFIX = "rr-player-token:";
const INDEX_KEY = "rr-player-index";

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<T>(key)) ?? null;
  } catch (err) {
    console.error("KV get failed:", err);
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, value);
  } catch (err) {
    console.error("KV set failed:", err);
  }
}

async function kvDel(key: string): Promise<void> {
  try {
    const { kv } = await import("@vercel/kv");
    await kv.del(key);
  } catch (err) {
    console.error("KV del failed:", err);
  }
}

export async function getPlayerByNickKey(nickKey: string): Promise<PlayerRecord | null> {
  if (isPersistentStore()) {
    const fromKv = await kvGet<PlayerRecord>(`${PLAYER_PREFIX}${nickKey}`);
    if (fromKv) return fromKv;
  }
  return memory.getPlayerByNickKey(nickKey);
}

export async function getNickKeyByToken(token: string): Promise<string | null> {
  if (isPersistentStore()) {
    const fromKv = await kvGet<string>(`${TOKEN_PREFIX}${token}`);
    if (fromKv) return fromKv;
  }
  return memory.getNickKeyByToken(token);
}

export async function savePlayerRecord(player: PlayerRecord): Promise<void> {
  if (isPersistentStore()) {
    await kvSet(`${PLAYER_PREFIX}${player.nickKey}`, player);
    await kvSet(`${TOKEN_PREFIX}${player.token}`, player.nickKey);
  }
  await memory.savePlayerRecord(player);
}

export async function deleteTokenMapping(token: string): Promise<void> {
  if (isPersistentStore()) {
    await kvDel(`${TOKEN_PREFIX}${token}`);
  }
  await memory.deleteTokenMapping(token);
}

export async function readPlayerIndex(): Promise<string[]> {
  if (isPersistentStore()) {
    const fromKv = await kvGet<string[]>(INDEX_KEY);
    if (fromKv) return fromKv;
  }
  return memory.readPlayerIndex();
}

export async function writePlayerIndex(keys: string[]): Promise<void> {
  if (isPersistentStore()) {
    await kvSet(INDEX_KEY, keys);
  }
  await memory.writePlayerIndex(keys);
}

