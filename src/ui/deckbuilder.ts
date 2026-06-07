import { getCardType, isDeckableCard } from "../game/card-meta";
import type { CardCatalog, CardDefinition, CardType, DeckDefinition } from "../game/types";
import { attachCardHoverPreview } from "./card-hover-preview";
import { cardFromDef } from "./card-view";
import {
  baseDeckCardIds,
  getCatalogPresets,
  loadActiveDeckSlot,
  loadCustomDeck,
  presetCardIds,
  saveActiveDeckSlot,
  saveCustomDeck,
  slotKindForPreset,
  type DeckSlotKind,
  validateDeckForCatalog,
} from "./deck-selection";

export type DeckbuilderCallbacks = {
  onBack: () => void;
  onSaved: () => void;
};

function countCards(cardIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function deckableCards(catalog: CardCatalog): CardDefinition[] {
  return catalog.cards
    .filter((c) => isDeckableCard(c))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

function baseLeaders(catalog: CardCatalog): CardDefinition[] {
  return catalog.cards.filter((c) => c.cardType === "leader" && !c.leaderFormOf);
}

type EditorScrollState = { catalog: number; deck: number };
type CatalogTypeFilter = "all" | Extract<CardType, "troop" | "spell" | "equipment" | "artifact">;

const CATALOG_FILTER_OPTIONS: {
  id: CatalogTypeFilter;
  label: string;
  icon: string;
}[] = [
  {
    id: "all",
    label: "Todas",
    icon: `<svg class="deck-filter-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="8" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="5" width="8" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    id: "troop",
    label: "Tropas",
    icon: `<svg class="deck-filter-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 11h6" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    id: "spell",
    label: "Magias",
    icon: `<svg class="deck-filter-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a1 1 0 0 1 1 1v14l-4-2-4 2-4-2-4 2V5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 8h8M8 11h6" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    id: "equipment",
    label: "Equipamentos",
    icon: `<svg class="deck-filter-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l2 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8l2-4z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 12h6M12 9v6" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    id: "artifact",
    label: "Artefatos",
    icon: `<svg class="deck-filter-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 4H7l1-4z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7h12v3c0 4-2 7-6 11C8 17 6 14 6 10V7z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
];

let pendingEditorScroll: EditorScrollState | null = null;
let activeCatalogFilter: CatalogTypeFilter = "all";

function matchesCatalogFilter(def: CardDefinition, filter: CatalogTypeFilter): boolean {
  if (filter === "all") return true;
  return getCardType(def) === filter;
}

const DECK_CARD_PREVIEW_MS = 550;

function attachDeckCardPreview(anchor: HTMLElement, def: CardDefinition): void {
  attachCardHoverPreview(anchor, () => cardFromDef(def), { delayMs: DECK_CARD_PREVIEW_MS });
}

function maxCopies(def: CardDefinition): number {
  return def.cardRole === "captain" ? 1 : 4;
}

function buildCatalogCardTile(
  def: CardDefinition,
  inDeck: number,
  onAdd: () => void,
): HTMLElement {
  const max = maxCopies(def);
  const tile = document.createElement("div");
  tile.className = "deck-editor__card-tile";

  const card = cardFromDef(def, { miniature: true });
  attachDeckCardPreview(card, def);
  tile.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "deck-editor__tile-actions";

  const copies = document.createElement("span");
  copies.className = "deck-editor__copy-badge";
  copies.textContent = `${inDeck}/${max} no deck`;
  actions.appendChild(copies);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "secondary deck-editor__row-btn";
  addBtn.textContent = "+";
  addBtn.disabled = inDeck >= max;
  addBtn.title = inDeck >= max ? "Limite de cópias" : `Adicionar ${def.name}`;
  addBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onAdd();
  });
  actions.appendChild(addBtn);

  tile.appendChild(actions);
  return tile;
}

function buildOwnedCardTile(
  def: CardDefinition,
  qty: number,
  onRemove: () => void,
): HTMLElement {
  const tile = document.createElement("div");
  tile.className = "deck-editor__card-tile";

  const card = cardFromDef(def, {
    miniature: true,
    subLabel: qty > 1 ? `×${qty} no baralho` : undefined,
  });
  attachDeckCardPreview(card, def);
  tile.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "deck-editor__tile-actions";

  const remBtn = document.createElement("button");
  remBtn.type = "button";
  remBtn.className = "secondary deck-editor__row-btn";
  remBtn.textContent = "−";
  remBtn.title = `Remover 1× ${def.name}`;
  remBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  });
  actions.appendChild(remBtn);

  tile.appendChild(actions);
  return tile;
}

function captureEditorScroll(root: HTMLElement): void {
  const lists = root.querySelectorAll<HTMLElement>(
    ".deck-editor__columns .deck-editor__card-grid, .deck-editor__columns .deck-editor__list",
  );
  if (lists.length === 0) return;
  pendingEditorScroll = {
    catalog: lists[0]?.scrollTop ?? 0,
    deck: lists[1]?.scrollTop ?? 0,
  };
}

function restoreEditorScroll(root: HTMLElement): void {
  if (!pendingEditorScroll) return;
  const { catalog, deck } = pendingEditorScroll;
  pendingEditorScroll = null;
  const lists = root.querySelectorAll<HTMLElement>(
    ".deck-editor__columns .deck-editor__card-grid, .deck-editor__columns .deck-editor__list",
  );
  if (lists[0]) lists[0].scrollTop = catalog;
  if (lists[1]) lists[1].scrollTop = deck;
}

export function renderDeckbuilderScreen(
  root: HTMLElement,
  catalog: CardCatalog,
  callbacks: DeckbuilderCallbacks,
): void {
  root.innerHTML = "";
  const activeSlot = loadActiveDeckSlot();
  const editingCustom = activeSlot === "custom";
  const customDeck: DeckDefinition = loadCustomDeck(catalog);
  const presets = getCatalogPresets(catalog);

  function persistCustomAndRerender(next: DeckDefinition): void {
    captureEditorScroll(root);
    saveCustomDeck(next);
    saveActiveDeckSlot("custom");
    renderDeckbuilderScreen(root, catalog, callbacks);
  }

  const shell = document.createElement("div");
  shell.className = "menu-shell menu-shell--deckbuilder";

  const header = document.createElement("header");
  header.className = "menu-hero menu-hero--compact";
  header.innerHTML = `
    <h1>Baralhos</h1>
    <p class="menu-hero__sub">Escolha um deck padrão do Líder ou monte o seu (mín. 40 cartas).</p>
  `;
  shell.appendChild(header);

  const presetGrid = document.createElement("div");
  presetGrid.className = "deck-preset-grid";

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

  function selectSlot(kind: DeckSlotKind): void {
    saveActiveDeckSlot(kind);
    renderDeckbuilderScreen(root, catalog, callbacks);
  }

  for (const preset of presets) {
    const kind = slotKindForPreset(preset.id);
    const ids = presetCardIds(catalog, preset);
    const leader = catalog.cards.find((c) => c.id === preset.leaderId);
    presetGrid.appendChild(
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
  presetGrid.appendChild(
    renderPresetCard(
      "Deck personalizado",
      "Monte sua lista a partir do catálogo piloto.",
      `${customDeck.cardIds.length} cartas · ${customValidation.valid ? "válido" : "incompleto"}`,
      activeSlot === "custom",
      () => selectSlot("custom"),
    ),
  );

  shell.appendChild(presetGrid);

  if (!editingCustom) {
    const activePreset = presets.find((p) => slotKindForPreset(p.id) === activeSlot) ?? presets[0];
    const activeLeader = catalog.cards.find((c) => c.id === activePreset?.leaderId);
    const hint = document.createElement("p");
    hint.className = "deck-preset-hint";
    hint.innerHTML = `
      <strong>${activePreset?.name ?? "Deck padrão"}</strong> selecionado
      (${activeLeader?.name ?? "Líder"}).
      Use <strong>Vs CPU</strong> no menu para jogar com este baralho.
      Para trocar cartas ou Líder livremente, clique em <strong>Deck personalizado</strong>.
    `;
    shell.appendChild(hint);
  }

  if (editingCustom) {
    const editor = document.createElement("div");
    editor.className = "deck-editor panel";

    const leaderRow = document.createElement("div");
    leaderRow.className = "deck-editor__leaders";
    leaderRow.innerHTML = `<p class="deck-editor__label">Líder do deck</p>`;
    const leaderBtns = document.createElement("div");
    leaderBtns.className = "menu-leader-pick__row";

    for (const leader of baseLeaders(catalog)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        customDeck.leaderId === leader.id ? "menu-leader-pick__btn--active" : "secondary";
      btn.textContent = leader.name;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        persistCustomAndRerender({ ...customDeck, leaderId: leader.id });
      });
      leaderBtns.appendChild(btn);
    }
    leaderRow.appendChild(leaderBtns);
    editor.appendChild(leaderRow);

    const counts = countCards(customDeck.cardIds);
    const validation = validateDeckForCatalog(catalog, customDeck);

    const status = document.createElement("p");
    status.className = validation.valid
      ? "deck-editor__status deck-editor__status--ok"
      : "deck-editor__status";
    status.textContent = validation.valid
      ? `Baralho pronto — ${customDeck.cardIds.length} cartas (alterações salvas automaticamente).`
      : validation.errors[0]?.message ?? "Baralho inválido.";
    editor.appendChild(status);

    const previewHint = document.createElement("p");
    previewHint.className = "deck-editor__preview-hint";
    previewHint.textContent =
      "Passe o mouse sobre uma carta para ver nome, efeito e palavras-chave em tamanho grande.";
    editor.appendChild(previewHint);

    const catalogCards = deckableCards(catalog).filter((c) => !c.leaderFormOf);
    const filteredCatalogCards = catalogCards.filter((c) =>
      matchesCatalogFilter(c, activeCatalogFilter),
    );
    const activeFilterLabel =
      CATALOG_FILTER_OPTIONS.find((f) => f.id === activeCatalogFilter)?.label ?? "Todas";

    const main = document.createElement("div");
    main.className = "deck-editor__main";

    const filters = document.createElement("aside");
    filters.className = "deck-editor__filters";
    filters.setAttribute("aria-label", "Filtrar por tipo de carta");

    for (const opt of CATALOG_FILTER_OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `deck-filter-btn${activeCatalogFilter === opt.id ? " deck-filter-btn--active" : ""}`;
      btn.title = opt.label;
      btn.setAttribute("aria-label", opt.label);
      btn.innerHTML = opt.icon;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (activeCatalogFilter === opt.id) return;
        activeCatalogFilter = opt.id;
        captureEditorScroll(root);
        pendingEditorScroll = {
          catalog: 0,
          deck: pendingEditorScroll?.deck ?? 0,
        };
        renderDeckbuilderScreen(root, catalog, callbacks);
      });
      filters.appendChild(btn);
    }

    const columns = document.createElement("div");
    columns.className = "deck-editor__columns";

    const catalogCol = document.createElement("div");
    catalogCol.className = "deck-editor__col";
    catalogCol.innerHTML = `<h3 class="deck-editor__col-title">Catálogo — ${activeFilterLabel} (${filteredCatalogCards.length})</h3>`;
    const catalogList = document.createElement("div");
    catalogList.className = "deck-editor__card-grid";

    const deckCol = document.createElement("div");
    deckCol.className = "deck-editor__col";
    deckCol.innerHTML = `<h3 class="deck-editor__col-title">Seu baralho (${customDeck.cardIds.length})</h3>`;
    const deckList = document.createElement("div");
    deckList.className = "deck-editor__card-grid";

    if (filteredCatalogCards.length === 0) {
      const empty = document.createElement("p");
      empty.className = "deck-editor__empty";
      empty.textContent = "Nenhuma carta deste tipo no catálogo piloto.";
      catalogList.appendChild(empty);
    }

    for (const def of filteredCatalogCards) {
      const inDeck = counts.get(def.id) ?? 0;
      catalogList.appendChild(
        buildCatalogCardTile(def, inDeck, () => {
          persistCustomAndRerender({
            ...customDeck,
            cardIds: [...customDeck.cardIds, def.id],
          });
        }),
      );
    }

    const deckCounts = countCards(customDeck.cardIds);
    const ownedIds = [...deckCounts.keys()].sort((a, b) => {
      const na = catalog.cards.find((c) => c.id === a)?.name ?? a;
      const nb = catalog.cards.find((c) => c.id === b)?.name ?? b;
      return na.localeCompare(nb, "pt");
    });

    if (ownedIds.length === 0) {
      const empty = document.createElement("p");
      empty.className = "deck-editor__empty";
      empty.textContent = "Nenhuma carta no baralho ainda.";
      deckList.appendChild(empty);
    }

    for (const id of ownedIds) {
      const def = catalog.cards.find((c) => c.id === id);
      if (!def) continue;
      const qty = deckCounts.get(id) ?? 0;
      deckList.appendChild(
        buildOwnedCardTile(def, qty, () => {
          const idx = customDeck.cardIds.indexOf(id);
          if (idx < 0) return;
          const next = [...customDeck.cardIds];
          next.splice(idx, 1);
          persistCustomAndRerender({ ...customDeck, cardIds: next });
        }),
      );
    }

    catalogCol.appendChild(catalogList);
    deckCol.appendChild(deckList);
    columns.append(catalogCol, deckCol);
    main.append(filters, columns);
    editor.appendChild(main);

    const editorActions = document.createElement("div");
    editorActions.className = "menu-panel__actions";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "secondary";
    resetBtn.textContent = "Restaurar base piloto";
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      persistCustomAndRerender({
        leaderId: customDeck.leaderId,
        cardIds: [...baseDeckCardIds(catalog)],
      });
    });
    editorActions.appendChild(resetBtn);

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.textContent = "Concluir e voltar ao menu";
    doneBtn.disabled = !validation.valid;
    doneBtn.addEventListener("click", (e) => {
      e.preventDefault();
      callbacks.onSaved();
    });
    editorActions.appendChild(doneBtn);

    editor.appendChild(editorActions);
    shell.appendChild(editor);
  }

  const footer = document.createElement("div");
  footer.className = "menu-footer-actions";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "secondary";
  backBtn.textContent = "← Voltar ao menu";
  backBtn.onclick = callbacks.onBack;
  footer.appendChild(backBtn);
  shell.appendChild(footer);

  root.appendChild(shell);

  if (editingCustom && pendingEditorScroll) {
    requestAnimationFrame(() => restoreEditorScroll(root));
  }
}
