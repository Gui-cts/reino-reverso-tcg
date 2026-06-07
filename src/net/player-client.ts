import type { DeckDefinition } from "../game/types";
import type { DeckSlotKind } from "../ui/deck-selection";
import type { PlayerSessionPayload } from "./player-types";

const API = "/api/players";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(text.slice(0, 120) || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(data.error ?? (text.slice(0, 120) || `HTTP ${res.status}`));
  }
  return data;
}

export type TestPlayerList = {
  players: { nickname: string; updatedAt: number }[];
  max: number;
};

export async function apiLoginPlayer(nickname: string): Promise<PlayerSessionPayload> {
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  return parseJson(res);
}

export async function apiFetchPlayerSession(token: string): Promise<PlayerSessionPayload> {
  const res = await fetch(`${API}/session?token=${encodeURIComponent(token)}`);
  return parseJson(res);
}

export async function apiSavePlayerDeck(
  token: string,
  deck: DeckDefinition,
  activeSlot?: DeckSlotKind,
): Promise<void> {
  const res = await fetch(`${API}/deck`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, deck, activeSlot }),
  });
  await parseJson(res);
}

export async function apiListTestPlayers(): Promise<TestPlayerList> {
  const res = await fetch(`${API}/index`);
  return parseJson(res);
}
