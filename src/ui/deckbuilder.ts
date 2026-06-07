import { cardTypeLabel, getCardType, getFaction, isDeckableCard } from "../game/card-meta";
import type { CardCatalog, CardDefinition, DeckDefinition } from "../game/types";
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

let pendingEditorScroll: EditorScrollState | null = null;

function captureEditorScroll(root: HTMLElement): void {
  const lists = root.querySelectorAll<HTMLElement>(".deck-editor__columns .deck-editor__list");
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
  const lists = root.querySelectorAll<HTMLElement>(".deck-editor__columns .deck-editor__list");
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

    const columns = document.createElement("div");
    columns.className = "deck-editor__columns";

    const catalogCol = document.createElement("div");
    catalogCol.className = "deck-editor__col";
    catalogCol.innerHTML = `<h3 class="deck-editor__col-title">Catálogo</h3>`;
    const catalogList = document.createElement("div");
    catalogList.className = "deck-editor__list";

    const deckCol = document.createElement("div");
    deckCol.className = "deck-editor__col";
    deckCol.innerHTML = `<h3 class="deck-editor__col-title">Seu baralho (${customDeck.cardIds.length})</h3>`;
    const deckList = document.createElement("div");
    deckList.className = "deck-editor__list";

    function maxCopies(def: CardDefinition): number {
      return def.cardRole === "captain" ? 1 : 4;
    }

    for (const def of deckableCards(catalog)) {
      if (def.leaderFormOf) continue;
      const inDeck = counts.get(def.id) ?? 0;
      const max = maxCopies(def);
      const row = document.createElement("div");
      row.className = "deck-editor__row";
      row.innerHTML = `
        <span class="deck-editor__row-name">${def.name}</span>
        <span class="deck-editor__row-meta">${cardTypeLabel(getCardType(def))} · ${getFaction(def)} · ${inDeck}/${max}</span>
      `;
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "secondary deck-editor__row-btn";
      addBtn.textContent = "+";
      addBtn.disabled = inDeck >= max;
      addBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        persistCustomAndRerender({
          ...customDeck,
          cardIds: [...customDeck.cardIds, def.id],
        });
      });
      row.appendChild(addBtn);
      catalogList.appendChild(row);
    }

    const deckCounts = countCards(customDeck.cardIds);
    for (const [id, qty] of deckCounts) {
      const def = catalog.cards.find((c) => c.id === id);
      if (!def) continue;
      const row = document.createElement("div");
      row.className = "deck-editor__row";
      row.innerHTML = `
        <span class="deck-editor__row-name">${def.name}</span>
        <span class="deck-editor__row-meta">×${qty}</span>
      `;
      const remBtn = document.createElement("button");
      remBtn.type = "button";
      remBtn.className = "secondary deck-editor__row-btn";
      remBtn.textContent = "−";
      remBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = customDeck.cardIds.indexOf(id);
        if (idx < 0) return;
        const next = [...customDeck.cardIds];
        next.splice(idx, 1);
        persistCustomAndRerender({ ...customDeck, cardIds: next });
      });
      row.appendChild(remBtn);
      deckList.appendChild(row);
    }

    catalogCol.appendChild(catalogList);
    deckCol.appendChild(deckList);
    columns.append(catalogCol, deckCol);
    editor.appendChild(columns);

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
