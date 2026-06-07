import type { CardCatalog } from "../game/types";
import {
  getCatalogPresets,
  loadActiveDeckSlot,
  loadCustomDeck,
  presetCardIds,
  saveActiveDeckSlot,
  slotKindForPreset,
  type DeckSlotKind,
  validateDeckForCatalog,
} from "./deck-selection";

function renderPresetCard(
  title: string,
  description: string,
  meta: string,
  selected: boolean,
  onSelect: () => void,
): HTMLElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `deck-preset-card${selected ? " deck-preset-card--active" : ""}`;
  card.innerHTML = `
    <span class="deck-preset-card__title">${title}</span>
    <span class="deck-preset-card__desc">${description}</span>
    <span class="deck-preset-card__meta">${meta}</span>
  `;
  card.addEventListener("click", (e) => {
    e.preventDefault();
    onSelect();
  });
  return card;
}

/** Grade Noah / Klaus / personalizado — mesma escolha do deckbuilder. */
export function appendDeckSlotPicker(
  parent: HTMLElement,
  catalog: CardCatalog,
  onChange: () => void,
): void {
  const activeSlot = loadActiveDeckSlot();
  const customDeck = loadCustomDeck(catalog);
  const presets = getCatalogPresets(catalog);
  const grid = document.createElement("div");
  grid.className = "deck-preset-grid";

  function selectSlot(kind: DeckSlotKind): void {
    saveActiveDeckSlot(kind);
    onChange();
  }

  for (const preset of presets) {
    const kind = slotKindForPreset(preset.id);
    const ids = presetCardIds(catalog, preset);
    const leader = catalog.cards.find((c) => c.id === preset.leaderId);
    grid.appendChild(
      renderPresetCard(
        preset.name,
        preset.description,
        `${leader?.name ?? preset.leaderId} · ${ids.length} cartas (+ formas)`,
        activeSlot === kind,
        () => selectSlot(kind),
      ),
    );
  }

  const customValidation = validateDeckForCatalog(catalog, customDeck);
  grid.appendChild(
    renderPresetCard(
      "Deck personalizado",
      "Monte sua lista a partir do catálogo piloto.",
      `${customDeck.cardIds.length} cartas · ${customValidation.valid ? "válido" : "incompleto"}`,
      activeSlot === "custom",
      () => selectSlot("custom"),
    ),
  );

  parent.appendChild(grid);
}
