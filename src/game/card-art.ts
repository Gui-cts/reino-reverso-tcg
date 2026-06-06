import { getCardType } from "./card-meta";
import type { CardDefinition } from "./types";

export { CARD_FRAME_URLS, type CardFrameKind } from "./card-frames";

const DEFAULT_ART = "/cards/placeholder-troop.svg";

export const PLACEHOLDER_ART_TROOP = "/cards/placeholder-troop.svg";
export const PLACEHOLDER_ART_SPELL = "/cards/placeholder-spell.svg";

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
