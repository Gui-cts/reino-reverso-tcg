import {
  formatCardTypeLineCompact,
  formatEssenceOrbText,
  getCardType,
  getCorruptionCost,
  getEssenceCost,
  resolveCardFrameKind,
} from "../game/card-meta";
import { describeArtifactEffect, describeEquipmentEffect } from "../game/equipment";
import {
  describeDeathEffect,
  describeKeywordRule,
  describeLandingEffectForCard,
  keywordLabel,
} from "../game/keywords";
import {
  describeSpellEffect,
  getCardSpeed,
  isSpellCard,
  isTroopCard,
  speedLabel,
} from "../game/spells";
import type { CardDefinition, KeywordId } from "../game/types";
import { getCardArtUrl, getCardPlaceholderUrl } from "../game/card-art";
import type { CardViewOptions } from "./card-view";

const FRAME_CLASS: Record<string, string> = {
  essence: "essence",
  corruption: "corruption",
  essenceAndCorruption: "both",
};

function keywordDetailText(def: CardDefinition, kw: KeywordId): string {
  if (kw === "testamento" && def.deathEffect) {
    return describeDeathEffect(def.deathEffect);
  }
  if (kw === "aterrisagem" && (def.landingEffect || def.landingEffectText)) {
    return describeLandingEffectForCard(def);
  }
  return describeKeywordRule(kw);
}

function appendKeywordBlock(parent: HTMLElement, def: CardDefinition, kw: KeywordId): void {
  const block = document.createElement("div");
  block.className = "game-card__desc-kw-row";

  const badge = document.createElement("span");
  badge.className = `game-card__kw-highlight game-card__kw-highlight--${kw}`;
  badge.textContent = keywordLabel(kw);
  badge.title = describeKeywordRule(kw);
  block.appendChild(badge);

  const sep = document.createElement("span");
  sep.className = "game-card__desc-sep";
  sep.textContent = " - ";
  block.appendChild(sep);

  const body = document.createElement("span");
  body.className = "game-card__desc-body";
  body.textContent = keywordDetailText(def, kw);
  block.appendChild(body);

  parent.appendChild(block);
}

function appendDescPlain(parent: HTMLElement, text: string): void {
  const p = document.createElement("p");
  p.className = "game-card__desc-plain";
  p.textContent = text;
  parent.appendChild(p);
}

function populateDescriptionEl(
  descEl: HTMLElement,
  def: CardDefinition,
  extraSubLabel?: string,
): void {
  descEl.replaceChildren();

  if (isSpellCard(def) && def.spellEffect) {
    appendDescPlain(descEl, describeSpellEffect(def.spellEffect));
    if (extraSubLabel) appendDescPlain(descEl, extraSubLabel);
    return;
  }

  const cardType = getCardType(def);
  if (cardType === "artifact" && def.artifactEffect) {
    appendDescPlain(descEl, describeArtifactEffect(def.artifactEffect));
    if (extraSubLabel) appendDescPlain(descEl, extraSubLabel);
    return;
  }

  if (cardType === "equipment") {
    appendDescPlain(descEl, describeEquipmentEffect(def));
    if (extraSubLabel) appendDescPlain(descEl, extraSubLabel);
    return;
  }

  if (def.keywords?.length) {
    for (const kw of def.keywords) {
      appendKeywordBlock(descEl, def, kw);
    }
  }

  if (def.hasEssenceSymbol) {
    appendDescPlain(descEl, "Pode converter em Essência (✦).");
  }

  if (extraSubLabel) {
    appendDescPlain(descEl, extraSubLabel);
  }
}

export function createFramedCardEl(
  def: CardDefinition,
  opts: CardViewOptions = {},
): HTMLElement {
  const spell = isSpellCard(def);
  const frameKind = resolveCardFrameKind(def);
  const showEssenceOrb =
    frameKind === "essence" || frameKind === "essenceAndCorruption";
  const showCorruptionOrb =
    frameKind === "corruption" || frameKind === "essenceAndCorruption";

  const el = document.createElement("div");
  el.className = "game-card game-card--framed";
  el.classList.add(`game-card--frame-${FRAME_CLASS[frameKind] ?? "essence"}`);
  if (spell) el.classList.add("game-card--spell");
  if (opts.exhausted) el.classList.add("exhausted");
  if (opts.pinned) el.classList.add("pinned");
  if (opts.selected) el.classList.add("selected");
  if (opts.mulliganPick) el.classList.add("mulligan-pick");
  if (opts.sacrificeTarget) el.classList.add("sacrifice-target");
  if (opts.hasEssenceSymbol ?? def.hasEssenceSymbol) el.classList.add("has-essence");
  if (opts.miniature) el.classList.add("game-card--framed-mini");

  const shell = document.createElement("div");
  shell.className = spell
    ? "game-card__shell game-card__shell--spell"
    : "game-card__shell game-card__shell--troop";

  const header = document.createElement("header");
  header.className = "game-card__header";

  if (showEssenceOrb && getEssenceCost(def).exhaust >= 0) {
    const orb = document.createElement("span");
    orb.className = "game-card__orb game-card__orb--essence";
    orb.textContent = formatEssenceOrbText(def);
    orb.title = "Custo em Essência";
    header.appendChild(orb);
  } else {
    const slot = document.createElement("span");
    slot.className = "game-card__header-slot";
    header.appendChild(slot);
  }

  const nameEl = document.createElement("h3");
  nameEl.className = "game-card__name";
  nameEl.textContent = def.name;
  header.appendChild(nameEl);

  if (showCorruptionOrb) {
    const cor = getCorruptionCost(def);
    if (cor > 0) {
      const orb = document.createElement("span");
      orb.className = "game-card__orb game-card__orb--corruption";
      orb.textContent = String(cor);
      orb.title = "Custo em Corrupção";
      header.appendChild(orb);
    } else {
      const slot = document.createElement("span");
      slot.className = "game-card__header-slot";
      header.appendChild(slot);
    }
  } else {
    const slot = document.createElement("span");
    slot.className = "game-card__header-slot";
    header.appendChild(slot);
  }

  shell.appendChild(header);

  const artEl = document.createElement("figure");
  artEl.className = `game-card__art game-card__art--${spell ? "spell" : "troop"}`;
  const artImg = document.createElement("img");
  artImg.className = "game-card__art-img";
  artImg.src = opts.imageUrl ?? getCardArtUrl(def);
  artImg.alt = "";
  artImg.loading = "lazy";
  artImg.draggable = false;
  artImg.onerror = () => {
    const fallback = getCardPlaceholderUrl(def);
    if (!artImg.src.endsWith(fallback)) {
      artImg.src = fallback;
    }
  };
  artEl.appendChild(artImg);
  shell.appendChild(artEl);

  const typeEl = document.createElement("div");
  typeEl.className = "game-card__type";
  typeEl.textContent = formatCardTypeLineCompact(
    def,
    spell ? speedLabel(getCardSpeed(def)) : undefined,
  );
  shell.appendChild(typeEl);

  const descEl = document.createElement("div");
  descEl.className = "game-card__body";
  populateDescriptionEl(descEl, def, opts.subLabel);
  shell.appendChild(descEl);

  if (isTroopCard(def)) {
    const footer = document.createElement("footer");
    footer.className = "game-card__footer";

    const atk = document.createElement("span");
    atk.className = "game-card__stat game-card__stat--atk";
    atk.setAttribute("aria-label", "Ataque");
    atk.textContent = String(opts.attack ?? def.attack);
    footer.appendChild(atk);

    const hp = document.createElement("span");
    hp.className = "game-card__stat game-card__stat--hp";
    hp.setAttribute("aria-label", "Vida");
    hp.textContent = String(opts.health ?? def.health);
    footer.appendChild(hp);

    shell.appendChild(footer);
  }

  if (opts.ownerLabel) {
    const owner = document.createElement("span");
    owner.className = "game-card__owner";
    owner.textContent = opts.ownerLabel;
    shell.appendChild(owner);
  }

  el.appendChild(shell);

  if (opts.onClick) {
    el.classList.add("game-card--interactive");
    el.addEventListener("click", opts.onClick);
  }

  return el;
}
