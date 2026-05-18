import type { CardDefinition } from "./types";

const DEFAULT_ART = "/cards/unknown.svg";

/** URL da arte da carta (placeholder em public/cards/{id}.svg). */
export function getCardArtUrl(def: Pick<CardDefinition, "id" | "image">): string {
  if (def.image) return def.image;
  return `/cards/${def.id}.svg`;
}

export function getCardArtUrlById(cardId: string): string {
  return `/cards/${cardId}.svg`;
}

export { DEFAULT_ART };
