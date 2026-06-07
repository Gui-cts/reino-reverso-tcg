import { randomBytes } from "node:crypto";
import { buildCatalogMap } from "../game/cards";
import { validateDeck } from "../game/deck-rules";
import { loadCatalogSync } from "../server/load-catalog";
import type { DeckDefinition } from "../game/types";
import type { PlayerDeckSlot, PlayerRecord, PlayerSessionPayload } from "./player-types";
import {
  deleteTokenMapping,
  getNickKeyByToken,
  getPlayerByNickKey,
  readPlayerIndex,
  savePlayerRecord,
  writePlayerIndex,
} from "./player-store";

export const MAX_TEST_PLAYERS = 5;

export type PlayerPublicInfo = {
  nickname: string;
  updatedAt: number;
};

function newToken(): string {
  return randomBytes(16).toString("hex");
}

function defaultDeckForNewPlayer(): DeckDefinition {
  const catalog = loadCatalogSync();
  const map = buildCatalogMap(catalog.cards);
  const leaderId = catalog.presetDecks?.[0]?.leaderId ?? "noah-lider-base";
  return {
    leaderId,
    cardIds: catalog.starterDeck.filter((id) => !map[id]?.leaderFormOf),
  };
}

export function normalizeNickKey(nickname: string): string {
  return nickname
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

export function validateNickname(nickname: string): string | null {
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return "Nick deve ter entre 2 e 20 caracteres.";
  }
  if (!/^[\p{L}\p{N} _-]+$/u.test(trimmed)) {
    return "Use só letras, números, espaço, _ ou -.";
  }
  if (!normalizeNickKey(trimmed)) {
    return "Nick inválido.";
  }
  return null;
}

function validateStoredDeck(deck: DeckDefinition, minDeckSize = 0): string | null {
  const catalog = loadCatalogSync();
  const map = buildCatalogMap(catalog.cards);
  const result = validateDeck(deck, map, { minDeckSize });
  if (!result.valid) return result.errors[0]?.message ?? "Baralho inválido.";
  return null;
}

function parseActiveSlot(raw: unknown): PlayerDeckSlot | undefined {
  if (raw === "preset-noah" || raw === "preset-klaus" || raw === "custom") return raw;
  return undefined;
}

export async function listTestPlayers(): Promise<{
  players: PlayerPublicInfo[];
  max: number;
}> {
  const index = await readPlayerIndex();
  const players: PlayerPublicInfo[] = [];
  for (const nickKey of index) {
    const record = await getPlayerByNickKey(nickKey);
    if (record) {
      players.push({ nickname: record.nickname, updatedAt: record.updatedAt });
    }
  }
  players.sort((a, b) => a.nickname.localeCompare(b.nickname, "pt"));
  return { players, max: MAX_TEST_PLAYERS };
}

export async function loginTestPlayer(
  nickname: string,
): Promise<PlayerSessionPayload | { error: string }> {
  const nickError = validateNickname(nickname);
  if (nickError) return { error: nickError };

  const nickKey = normalizeNickKey(nickname);
  const displayName = nickname.trim();
  let index = await readPlayerIndex();

  let record = await getPlayerByNickKey(nickKey);
  if (!record) {
    if (!index.includes(nickKey) && index.length >= MAX_TEST_PLAYERS) {
      return {
        error: `Limite de ${MAX_TEST_PLAYERS} contas de teste. Peça para alguém liberar um nick ou reutilize um existente.`,
      };
    }
    const now = Date.now();
    record = {
      nickKey,
      nickname: displayName,
      token: newToken(),
      customDeck: defaultDeckForNewPlayer(),
      activeSlot: "custom",
      createdAt: now,
      updatedAt: now,
    };
    if (!index.includes(nickKey)) {
      index = [...index, nickKey];
      await writePlayerIndex(index);
    }
  } else {
    if (record.token) {
      await deleteTokenMapping(record.token);
    }
    record = {
      ...record,
      nickname: displayName,
      token: newToken(),
      updatedAt: Date.now(),
    };
  }

  await savePlayerRecord(record);
  return {
    nickname: record.nickname,
    token: record.token,
    customDeck: record.customDeck,
    activeSlot: record.activeSlot,
  };
}

export async function getPlayerSession(
  token: string,
): Promise<PlayerSessionPayload | { error: string }> {
  if (!token) return { error: "Sessão inválida." };
  const nickKey = await getNickKeyByToken(token);
  if (!nickKey) return { error: "Sessão expirada — entre de novo com seu nick." };
  const record = await getPlayerByNickKey(nickKey);
  if (!record || record.token !== token) {
    return { error: "Sessão expirada — entre de novo com seu nick." };
  }
  return {
    nickname: record.nickname,
    token: record.token,
    customDeck: record.customDeck,
    activeSlot: record.activeSlot,
  };
}

export async function savePlayerDeck(
  token: string,
  deck: DeckDefinition,
  activeSlotRaw?: unknown,
): Promise<{ ok: true } | { error: string }> {
  const session = await getPlayerSession(token);
  if ("error" in session) return session;

  if (!deck.leaderId || !Array.isArray(deck.cardIds)) {
    return { error: "Baralho malformado." };
  }

  const deckError = validateStoredDeck(deck, 0);
  if (deckError) return { error: deckError };

  const nickKey = normalizeNickKey(session.nickname);
  const record = await getPlayerByNickKey(nickKey);
  if (!record || record.token !== token) {
    return { error: "Sessão expirada — entre de novo com seu nick." };
  }

  const next: PlayerRecord = {
    ...record,
    customDeck: {
      leaderId: deck.leaderId,
      cardIds: [...deck.cardIds],
    },
    activeSlot: parseActiveSlot(activeSlotRaw) ?? record.activeSlot,
    updatedAt: Date.now(),
  };
  await savePlayerRecord(next);
  return { ok: true };
}
