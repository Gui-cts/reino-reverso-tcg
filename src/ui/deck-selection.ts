import { buildCatalogMap } from "../game/cards";
import { validateDeck } from "../game/deck-rules";
import type { CardCatalog, DeckDefinition, PresetDeckDefinition } from "../game/types";

export type DeckSlotKind = "preset-noah" | "preset-klaus" | "custom";

export type ActiveDeckConfig = {
  kind: DeckSlotKind;
  label: string;
  leaderId: string;
  cardIds: string[];
};

const ACTIVE_SLOT_KEY = "rr-active-deck-slot";
const CUSTOM_DECK_KEY = "rr-custom-deck";

/** Fallback quando localStorage não está disponível (ex.: modo privado). */
let memoryActiveSlot: DeckSlotKind | null = null;
let memoryCustomDeck: DeckDefinition | null = null;

const DEFAULT_PRESETS: PresetDeckDefinition[] = [
  {
    id: "noah",
    leaderId: "noah-lider-base",
    name: "Noah — Controle Delta",
    description: "Tropas resistentes, equipamentos e evoluções do pugilista.",
  },
  {
    id: "klaus",
    leaderId: "klaus-violinista",
    name: "Klaus — Melodia Arcana",
    description: "Feitiços, essência e formas do violinista.",
  },
];

export function getCatalogPresets(catalog: CardCatalog): PresetDeckDefinition[] {
  return catalog.presetDecks?.length ? catalog.presetDecks : DEFAULT_PRESETS;
}

export function baseDeckCardIds(catalog: CardCatalog): string[] {
  const map = buildCatalogMap(catalog.cards);
  return catalog.starterDeck.filter((id) => !map[id]?.leaderFormOf);
}

export function presetCardIds(catalog: CardCatalog, preset: PresetDeckDefinition): string[] {
  if (preset.cardIds?.length) return [...preset.cardIds];
  return baseDeckCardIds(catalog);
}

export function slotKindForPreset(presetId: string): DeckSlotKind {
  if (presetId === "klaus") return "preset-klaus";
  return "preset-noah";
}

export function presetForSlot(catalog: CardCatalog, kind: DeckSlotKind): PresetDeckDefinition | null {
  if (kind === "custom") return null;
  const presets = getCatalogPresets(catalog);
  return kind === "preset-klaus"
    ? presets.find((p) => p.id === "klaus") ?? presets[1] ?? null
    : presets.find((p) => p.id === "noah") ?? presets[0] ?? null;
}

export function loadActiveDeckSlot(): DeckSlotKind {
  try {
    const raw = localStorage.getItem(ACTIVE_SLOT_KEY);
    if (raw === "preset-klaus" || raw === "custom") return raw;
  } catch {
    /* ignore */
  }
  return memoryActiveSlot ?? "preset-noah";
}

export function saveActiveDeckSlot(kind: DeckSlotKind): void {
  memoryActiveSlot = kind;
  try {
    localStorage.setItem(ACTIVE_SLOT_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function defaultCustomDeck(catalog: CardCatalog): DeckDefinition {
  const presets = getCatalogPresets(catalog);
  const leaderId = presets[0]?.leaderId ?? "noah-lider-base";
  return { leaderId, cardIds: [...baseDeckCardIds(catalog)] };
}

export function loadCustomDeck(catalog: CardCatalog): DeckDefinition {
  try {
    const raw = localStorage.getItem(CUSTOM_DECK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeckDefinition;
      if (parsed.leaderId && Array.isArray(parsed.cardIds)) {
        memoryCustomDeck = parsed;
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  if (memoryCustomDeck?.leaderId && Array.isArray(memoryCustomDeck.cardIds)) {
    return memoryCustomDeck;
  }
  return defaultCustomDeck(catalog);
}

export function saveCustomDeck(deck: DeckDefinition): void {
  memoryCustomDeck = deck;
  try {
    localStorage.setItem(CUSTOM_DECK_KEY, JSON.stringify(deck));
  } catch {
    /* ignore */
  }
}

/** Aplica deck e slot vindos da conta de teste (Redis). */
export function importPlayerCloudData(deck: DeckDefinition, activeSlot?: DeckSlotKind): void {
  saveCustomDeck(deck);
  if (activeSlot) saveActiveDeckSlot(activeSlot);
}

export function resolveActiveDeck(catalog: CardCatalog): ActiveDeckConfig {
  const kind = loadActiveDeckSlot();
  if (kind === "custom") {
    const custom = loadCustomDeck(catalog);
    return {
      kind,
      label: "Deck personalizado",
      leaderId: custom.leaderId ?? "noah-lider-base",
      cardIds: custom.cardIds,
    };
  }
  const preset = presetForSlot(catalog, kind)!;
  return {
    kind,
    label: preset.name,
    leaderId: preset.leaderId,
    cardIds: presetCardIds(catalog, preset),
  };
}

export function validateDeckForCatalog(
  catalog: CardCatalog,
  deck: DeckDefinition,
): ReturnType<typeof validateDeck> {
  const map = buildCatalogMap(catalog.cards);
  return validateDeck(deck, map);
}
