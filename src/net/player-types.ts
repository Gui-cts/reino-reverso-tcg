import type { DeckDefinition } from "../game/types";

export type PlayerDeckSlot = "preset-noah" | "preset-klaus" | "custom";

export type PlayerRecord = {
  nickKey: string;
  nickname: string;
  token: string;
  customDeck: DeckDefinition;
  activeSlot: PlayerDeckSlot;
  createdAt: number;
  updatedAt: number;
};

export type PlayerSessionPayload = {
  nickname: string;
  token: string;
  customDeck: DeckDefinition;
  activeSlot: PlayerDeckSlot;
};
