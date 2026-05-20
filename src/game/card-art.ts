import { getCardType } from "./card-meta";
import type { CardDefinition } from "./types";

const DEFAULT_ART = "/cards/placeholder-troop.svg";

export const PLACEHOLDER_ART_TROOP = "/cards/placeholder-troop.svg";
export const PLACEHOLDER_ART_SPELL = "/cards/placeholder-spell.svg";

/** Molduras de carta (PNG em public/cards/frames/). */
export const CARD_FRAME_URLS = {
  essence: "/cards/frames/frame-essencia.png",
  corruption: "/cards/frames/frame-corrupcao.png",
  essenceAndCorruption: "/cards/frames/frame-essencia-corrupcao.png",
} as const;

export type CardFrameKind = keyof typeof CARD_FRAME_URLS;

export function getCardPlaceholderUrl(
  def: Pick<CardDefinition, "cardType" | "cardKind" | "spellEffect">,
): string {
  return getCardType(def as CardDefinition) === "spell"
    ? PLACEHOLDER_ART_SPELL
    : PLACEHOLDER_ART_TROOP;
}

/** Arte da carta: só `image` custom no JSON ou placeholder por tipo (tropa / feitiço). */
export function getCardArtUrl(
  def: Pick<CardDefinition, "image" | "cardType" | "cardKind" | "spellEffect">,
): string {
  if (def.image) return def.image;
  return getCardPlaceholderUrl(def);
}

export function getCardArtUrlById(_cardId: string): string {
  return PLACEHOLDER_ART_TROOP;
}

export { DEFAULT_ART };
