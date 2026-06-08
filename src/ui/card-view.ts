import {
  describeKeywordRule,
  describeLandingEffectForCard,
  formatKeywordsLine,
  keywordLabel,
} from "../game/keywords";
import { getCardType } from "../game/card-meta";
import { describeCaptainAbilityForCard } from "../game/captain-abilities";
import {
  describeArtifactEffectForCard,
  describeEquipmentEffect,
} from "../game/equipment";
import { describeSpellEffect, getCardSpeed, isSpellCard, speedLabel } from "../game/spells";
import type { CardDefinition, KeywordId } from "../game/types";
import { getCardArtUrl } from "../game/card-art";
import { createFramedCardEl } from "./framed-card";

export type CardViewOptions = {
  cost?: number;
  attack?: number;
  health?: number;
  exhausted?: boolean;
  pinned?: boolean;
  hasEssenceSymbol?: boolean;
  ownerLabel?: string;
  imageUrl?: string;
  /** Texto auxiliar (ex.: alvo escolhido no combate). */
  subLabel?: string;
  selected?: boolean;
  mulliganPick?: boolean;
  sacrificeTarget?: boolean;
  compact?: boolean;
  /** Carta na arena — menor, com badges de palavra-chave. */
  field?: boolean;
  /** Miniatura no tabuleiro (mesma moldura da mão, menor). */
  miniature?: boolean;
  /** Carta no Espaço de Essência — só a estrela ✦ central. */
  essenceToken?: boolean;
  onClick?: (ev: MouseEvent) => void;
};

/** Carta convertida no Espaço de Essência (apenas ✦). */
/** Verso da carta (mão oculta do oponente / CPU). */
export function createHiddenCardEl(compact = false): HTMLElement {
  const el = document.createElement("div");
  el.className = "game-card game-card--hidden";
  if (compact) el.classList.add("game-card--compact");
  const eye = document.createElement("span");
  eye.className = "game-card__hidden-eye";
  eye.textContent = "👁";
  eye.setAttribute("aria-hidden", "true");
  el.appendChild(eye);
  return el;
}

export function createEssenceTokenEl(exhausted = false, spellOnly = false): HTMLElement {
  const root = document.createElement("div");
  root.className = "game-card game-card--essence-token";
  if (exhausted) root.classList.add("exhausted");
  if (spellOnly) root.classList.add("spell-only");

  const sym = document.createElement("span");
  sym.className = "game-card__essence-main";
  sym.textContent = spellOnly ? "♪" : "✦";
  sym.title = spellOnly
    ? (exhausted ? "Essência temporária exausta (só feitiços)" : "Essência temporária (só feitiços)")
    : (exhausted ? "Essência exausta" : "Essência pronta");
  root.appendChild(sym);

  return root;
}

function appendCardArt(parent: HTMLElement, imageUrl: string, alt: string): void {
  const wrap = document.createElement("div");
  wrap.className = "game-card__art-wrap";
  const img = document.createElement("img");
  img.className = "game-card__art";
  img.src = imageUrl;
  img.alt = alt;
  img.loading = "lazy";
  img.draggable = false;
  img.onerror = () => {
    img.style.display = "none";
    wrap.classList.add("game-card__art-wrap--missing");
  };
  wrap.appendChild(img);
  parent.appendChild(wrap);
}

const KEYWORD_BADGE_SHORT: Partial<Record<KeywordId, string>> = {
  protetor: "Prot",
  investida: "Inv",
  testamento: "Test",
  eco: "Eco",
  vincular: "Vin",
  silencio: "Sil",
  fatiar: "Fat",
  voar: "Voo",
};

function appendKeywordBadges(
  parent: HTMLElement,
  keywords: KeywordId[] | undefined,
  compact: boolean,
): void {
  if (!keywords?.length) return;
  const row = document.createElement("div");
  row.className = "game-card__kw-badges";
  for (const kw of keywords) {
    const badge = document.createElement("span");
    badge.className = `game-card__kw game-card__kw--${kw}`;
    badge.textContent = compact
      ? (KEYWORD_BADGE_SHORT[kw] ?? keywordLabel(kw).slice(0, 4))
      : keywordLabel(kw);
    badge.title = describeKeywordRule(kw);
    row.appendChild(badge);
  }
  parent.appendChild(row);
}

function buildCardTooltip(
  name: string,
  def: CardDefinition | undefined,
  subLabel?: string,
): string {
  const lines = [name];
  if (def) {
    const kw = formatKeywordsLine(def);
    if (kw) lines.push(kw);
    if (def.keywords?.includes("aterrisagem") && (def.landingEffect || def.landingEffectText)) {
      lines.push(describeLandingEffectForCard(def));
    }
    if (def.deathEffect) {
      lines.push(describeKeywordRule("testamento"));
    }
    if (def.spellEffect) {
      lines.push(describeSpellEffect(def.spellEffect));
    }
    const cardType = getCardType(def);
    if (cardType === "artifact" && def.artifactEffect) {
      lines.push(describeArtifactEffectForCard(def));
    }
    if (def.captainAbilityId) {
      lines.push(describeCaptainAbilityForCard(def));
    }
    if (cardType === "equipment") {
      lines.push(describeEquipmentEffect(def));
    }
  }
  if (subLabel) lines.push(subLabel);
  return lines.join("\n");
}

export function createCardEl(name: string, opts: CardViewOptions = {}): HTMLElement {
  if (opts.essenceToken) {
    return createEssenceTokenEl(opts.exhausted ?? false);
  }

  const el = document.createElement("div");
  el.className = "game-card";
  if (opts.compact) el.classList.add("game-card--compact");
  if (opts.field) el.classList.add("game-card--field");
  if (opts.exhausted) el.classList.add("exhausted");
  if (opts.pinned) el.classList.add("pinned");
  if (opts.hasEssenceSymbol) el.classList.add("has-essence");
  if (opts.selected) el.classList.add("selected");
  if (opts.mulliganPick) el.classList.add("mulligan-pick");
  if (opts.sacrificeTarget) el.classList.add("sacrifice-target");

  if (opts.cost !== undefined) {
    const cost = document.createElement("span");
    cost.className = "game-card__cost";
    cost.textContent = String(opts.cost);
    el.appendChild(cost);
  }

  if (opts.hasEssenceSymbol) {
    const sym = document.createElement("span");
    sym.className = "game-card__essence";
    sym.textContent = "✦";
    sym.title = "Pode converter em Essência";
    el.appendChild(sym);
  }

  if (opts.imageUrl) {
    appendCardArt(el, opts.imageUrl, name);
  }

  const nameRow = document.createElement("div");
  nameRow.className = "game-card__name";
  nameRow.textContent = name;
  el.appendChild(nameRow);

  const statsRow = document.createElement("div");
  statsRow.className = "game-card__stats";
  if (opts.attack !== undefined) {
    const atk = document.createElement("span");
    atk.className = "game-card__atk";
    atk.textContent = String(opts.attack);
    statsRow.appendChild(atk);
  }
  if (opts.health !== undefined) {
    const hp = document.createElement("span");
    hp.className = "game-card__hp";
    hp.textContent = String(opts.health);
    statsRow.appendChild(hp);
  }
  el.appendChild(statsRow);

  if (opts.subLabel) {
    const subRow = document.createElement("div");
    subRow.className = "game-card__sub";
    subRow.textContent = opts.subLabel;
    el.appendChild(subRow);
  }

  if (opts.ownerLabel) {
    const owner = document.createElement("span");
    owner.className = "game-card__owner";
    owner.textContent = opts.ownerLabel;
    el.appendChild(owner);
  }

  if (opts.onClick) {
    el.classList.add("game-card--interactive");
    el.addEventListener("click", opts.onClick);
  }

  return el;
}

function createSpellCardEl(def: CardDefinition, opts: CardViewOptions = {}): HTMLElement {
  const el = document.createElement("div");
  el.className = "game-card game-card--spell";
  if (opts.compact) el.classList.add("game-card--compact");
  if (opts.selected) el.classList.add("selected");
  if (opts.mulliganPick) el.classList.add("mulligan-pick");

  const badge = document.createElement("span");
  badge.className = "game-card__spell-badge";
  badge.textContent = `MAGIA · ${speedLabel(getCardSpeed(def))}`;
  el.appendChild(badge);

  if (opts.cost !== undefined) {
    const cost = document.createElement("span");
    cost.className = "game-card__cost";
    cost.textContent = String(opts.cost);
    el.appendChild(cost);
  }

  if (opts.imageUrl) {
    appendCardArt(el, opts.imageUrl, def.name);
  }

  const nameRow = document.createElement("div");
  nameRow.className = "game-card__name";
  nameRow.textContent = def.name;
  el.appendChild(nameRow);

  const fx = document.createElement("div");
  fx.className = "game-card__spell-fx";
  fx.textContent =
    def.spellEffect ? describeSpellEffect(def.spellEffect) : opts.subLabel ?? "";
  el.appendChild(fx);

  if (opts.subLabel && def.spellEffect) {
    const sub = document.createElement("div");
    sub.className = "game-card__sub";
    sub.textContent = opts.subLabel;
    el.appendChild(sub);
  }

  if (opts.onClick) {
    el.classList.add("game-card--interactive");
    el.addEventListener("click", opts.onClick);
  }

  return el;
}

export function cardFromDef(def: CardDefinition, opts: CardViewOptions = {}): HTMLElement {
  const isTroop = getCardType(def) === "troop";

  if (opts.miniature) {
    const kwLine = formatKeywordsLine(def);
    const extraSub =
      opts.subLabel && opts.subLabel !== kwLine ? opts.subLabel : undefined;
    const el = createFramedCardEl(def, {
      attack: isTroop ? (opts.attack ?? def.attack) : undefined,
      health: isTroop ? (opts.health ?? def.health) : undefined,
      hasEssenceSymbol: def.hasEssenceSymbol,
      imageUrl: getCardArtUrl(def),
      ...opts,
      miniature: true,
      subLabel: extraSub,
    });
    el.title = buildCardTooltip(def.name, def, opts.subLabel ?? (kwLine || undefined));
    return el;
  }

  const useFramedHand = !opts.field && !opts.compact && !opts.essenceToken;

  if (useFramedHand) {
    const kwLine = formatKeywordsLine(def);
    const extraSub =
      opts.subLabel && opts.subLabel !== kwLine ? opts.subLabel : undefined;
    const el = createFramedCardEl(def, {
      attack: isTroop ? (opts.attack ?? def.attack) : undefined,
      health: isTroop ? (opts.health ?? def.health) : undefined,
      hasEssenceSymbol: def.hasEssenceSymbol,
      imageUrl: getCardArtUrl(def),
      ...opts,
      subLabel: extraSub,
    });
    el.title = buildCardTooltip(def.name, def, opts.subLabel ?? (kwLine || undefined));
    return el;
  }

  if (isSpellCard(def)) {
    return createSpellCardEl(def, {
      cost: def.cost,
      imageUrl: getCardArtUrl(def),
      ...opts,
    });
  }
  const kwLine = formatKeywordsLine(def);
  const subLabel = opts.subLabel ?? (kwLine || undefined);
  const el = createCardEl(def.name, {
    cost: def.cost,
    attack: isTroop ? def.attack : undefined,
    health: isTroop ? def.health : undefined,
    hasEssenceSymbol: def.hasEssenceSymbol,
    imageUrl: getCardArtUrl(def),
    ...opts,
    subLabel,
  });
  appendKeywordBadges(el, def.keywords, Boolean(opts.field || opts.compact));
  el.title = buildCardTooltip(def.name, def, subLabel);
  return el;
}
