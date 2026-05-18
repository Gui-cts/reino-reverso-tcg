import type { CardCatalog, CardDefinition } from "./types";

export async function loadCardCatalog(): Promise<CardCatalog> {
  const res = await fetch("/data/cards.json");
  if (!res.ok) throw new Error("Não foi possível carregar cards.json");
  return res.json() as Promise<CardCatalog>;
}

export function buildCatalogMap(cards: CardDefinition[]): Record<string, CardDefinition> {
  return Object.fromEntries(cards.map((c) => [c.id, c]));
}

export function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
