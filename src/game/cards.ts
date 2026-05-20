import { normalizeCardDefinition } from "./card-meta";
import { validateStarterDeck } from "./deck-rules";
import type { CardCatalog, CardDefinition } from "./types";

export async function loadCardCatalog(): Promise<CardCatalog> {
  const res = await fetch("/data/cards.json");
  if (!res.ok) throw new Error("Não foi possível carregar cards.json");
  const raw = (await res.json()) as CardCatalog;
  return normalizeCatalog(raw);
}

export function normalizeCatalog(data: CardCatalog): CardCatalog {
  const cards = data.cards.map(normalizeCardDefinition);
  const starterDeck = [...data.starterDeck];
  const check = validateStarterDeck({ cards, starterDeck });
  if (!check.valid) {
    console.warn(
      "[deck] starterDeck inválido:",
      check.errors.map((e) => e.message).join("; "),
    );
  }
  return { cards, starterDeck };
}

export function buildCatalogMap(cards: CardDefinition[]): Record<string, CardDefinition> {
  return Object.fromEntries(cards.map((c) => [c.id, normalizeCardDefinition(c)]));
}

export function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
