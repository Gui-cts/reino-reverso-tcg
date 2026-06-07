import type { CardCatalog } from "../game/types";
import type { DeckDefinition } from "../game/types";
import {
  apiFetchPlayerSession,
  apiListTestPlayers,
  apiLoginPlayer,
  apiSavePlayerDeck,
  type TestPlayerList,
} from "../net/player-client";
import {
  importPlayerCloudData,
  loadActiveDeckSlot,
  loadCustomDeck,
  type DeckSlotKind,
} from "./deck-selection";

const TOKEN_KEY = "rr-player-token";
const NICK_KEY = "rr-player-nickname";

let syncQueue: Promise<void> = Promise.resolve();

export type PlayerSessionState = {
  nickname: string;
  token: string;
};

export function getStoredPlayerSession(): PlayerSessionState | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const nickname = localStorage.getItem(NICK_KEY);
    if (token && nickname) return { token, nickname };
  } catch {
    /* ignore */
  }
  return null;
}

export function clearStoredPlayerSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NICK_KEY);
  } catch {
    /* ignore */
  }
}

function storePlayerSession(nickname: string, token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(NICK_KEY, nickname);
  } catch {
    /* ignore */
  }
}

function applySessionPayload(payload: {
  nickname: string;
  token: string;
  customDeck: DeckDefinition;
  activeSlot: DeckSlotKind;
}): void {
  storePlayerSession(payload.nickname, payload.token);
  importPlayerCloudData(payload.customDeck, payload.activeSlot);
}

export async function loginWithNickname(nickname: string): Promise<void> {
  const payload = await apiLoginPlayer(nickname);
  applySessionPayload(payload);
}

export async function restorePlayerSession(): Promise<PlayerSessionState | null> {
  const stored = getStoredPlayerSession();
  if (!stored) return null;
  try {
    const payload = await apiFetchPlayerSession(stored.token);
    applySessionPayload(payload);
    return { nickname: payload.nickname, token: payload.token };
  } catch {
    clearStoredPlayerSession();
    return null;
  }
}

export function logoutPlayer(): void {
  clearStoredPlayerSession();
}

function enqueueCloudSync(task: () => Promise<void>): void {
  syncQueue = syncQueue.then(task).catch(() => {
    /* falha silenciosa — deck local continua válido */
  });
}

export function syncCustomDeckToCloud(deck: DeckDefinition): void {
  const session = getStoredPlayerSession();
  if (!session) return;
  enqueueCloudSync(async () => {
    await apiSavePlayerDeck(session.token, deck, loadActiveDeckSlot());
  });
}

export function syncPlayerDeckState(catalog: CardCatalog): void {
  const session = getStoredPlayerSession();
  if (!session) return;
  const deck = loadCustomDeck(catalog);
  enqueueCloudSync(async () => {
    await apiSavePlayerDeck(session.token, deck, loadActiveDeckSlot());
  });
}

export async function fetchTestPlayerList(): Promise<TestPlayerList> {
  return apiListTestPlayers();
}
