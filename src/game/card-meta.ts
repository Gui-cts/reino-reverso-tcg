import { CARD_FRAME_URLS, type CardFrameKind } from "./card-frames";
import {
  canPayCorruptionCost,
  canPayEssenceCost,
  getAvailableNonTempEssence,
} from "./helpers";
import type {
  CardDefinition,
  CardRole,
  CardType,
  EssenceCost,
  FactionId,
  GameState,
  PlayerId,
} from "./types";

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  troop: "Tropa",
  spell: "Feitiço",
  equipment: "Equipamento",
  artifact: "Artefato",
  leader: "Líder",
};

export const FACTION_LABELS: Record<string, string> = {
  neutra: "Neutra",
  delta: "Delta",
};

export const CARD_ROLES_COMING_SOON: CardType[] = [];

export function normalizeCardDefinition(raw: CardDefinition): CardDefinition {
  const cardType = resolveCardType(raw);
  const faction: FactionId = raw.faction ?? "neutra";
  const cardRole: CardRole =
    cardType === "troop" ? (raw.cardRole ?? "normal") : "normal";

  return {
    ...raw,
    cardType,
    faction,
    cardRole,
    cardKind: raw.cardKind ?? (cardType === "spell" ? "spell" : "troop"),
  };
}

export function resolveCardType(def: CardDefinition): CardType {
  if (def.cardType) return def.cardType;
  if (def.cardKind === "spell" || def.spellEffect) return "spell";
  if (def.isToken) return "troop";
  return "troop";
}

export function getCardType(def: CardDefinition | undefined): CardType {
  if (!def) return "troop";
  return def.cardType ?? resolveCardType(def);
}

export function getFaction(def: CardDefinition | undefined): FactionId {
  return def?.faction ?? "neutra";
}

export function isLeaderCard(def: CardDefinition | undefined): boolean {
  return getCardType(def) === "leader";
}

export function isCaptainCard(def: CardDefinition | undefined): boolean {
  return Boolean(def && def.cardRole === "captain");
}

export function isSignatureCard(def: CardDefinition | undefined): boolean {
  return Boolean(def && def.cardRole === "signature");
}

export function isLeaderExclusiveCard(def: CardDefinition | undefined): boolean {
  return isCaptainCard(def) || isSignatureCard(def);
}

export function isDeckableCard(def: CardDefinition | undefined): boolean {
  if (!def || def.isToken) return false;
  if (def.leaderFormOf) return true;
  const type = getCardType(def);
  return type === "troop" || type === "spell" || type === "artifact" || type === "equipment";
}

export function isEquipmentCardType(def: CardDefinition | undefined): boolean {
  return getCardType(def) === "equipment";
}

export function isLeaderFormCard(def: CardDefinition | undefined): boolean {
  return Boolean(def?.leaderFormOf);
}

export function getEssenceCost(def: CardDefinition): EssenceCost {
  if (def.essenceCost) return { ...def.essenceCost };
  return { exhaust: def.cost };
}

export function formatEssenceCost(def: CardDefinition): string {
  const { exhaust, sacrifice } = getEssenceCost(def);
  if (!sacrifice) return `${exhaust} essência(s)`;
  return `exaurte ${exhaust} e sacrifique ${sacrifice} (descarte de Essência)`;
}

/** Texto na bolinha azul do frame (ex.: `1`, `3(1)`). */
export function formatEssenceOrbText(def: CardDefinition): string {
  const { exhaust, sacrifice } = getEssenceCost(def);
  if (!sacrifice) return String(exhaust);
  return `${exhaust}(${sacrifice})`;
}

export function getCorruptionCost(def: CardDefinition): number {
  if (def.corruptionCost !== undefined) return def.corruptionCost;
  if (def.spellEffect === "omega") return 1;
  return 0;
}

export function formatCorruptionCost(def: CardDefinition): string {
  const amount = getCorruptionCost(def);
  if (amount <= 0) return "";
  return amount === 1 ? "1 Corrupção" : `${amount} Corrupção`;
}

/** Essência + Corrupção para logs e mensagens de erro. */
export function formatCardCost(def: CardDefinition): string {
  const parts: string[] = [];
  const { exhaust, sacrifice } = getEssenceCost(def);
  if (exhaust > 0 || sacrifice) {
    parts.push(formatEssenceCost(def));
  }
  const cor = formatCorruptionCost(def);
  if (cor) parts.push(cor);
  return parts.length > 0 ? parts.join(" + ") : "sem custo";
}

export function canAffordCardCost(
  state: GameState,
  player: PlayerId,
  def: CardDefinition,
  essencePayment?: EssenceCost,
): boolean {
  const payment = essencePayment ?? getEssenceCost(def);
  return (
    canPayEssenceCost(state, player, payment) &&
    canPayCorruptionCost(state, player, getCorruptionCost(def))
  );
}

/** Tropas e equipamentos não podem usar Essência temporária (ex.: Melodia Arcana). */
export function canAffordTroopCost(
  state: GameState,
  player: PlayerId,
  def: CardDefinition,
  essencePayment?: EssenceCost,
): boolean {
  const payment = essencePayment ?? getEssenceCost(def);
  const sacrifice = payment.sacrifice ?? 0;
  const nonTemp = getAvailableNonTempEssence(state, player);
  if (nonTemp.length < payment.exhaust || sacrifice > payment.exhaust) return false;
  return canPayCorruptionCost(state, player, getCorruptionCost(def));
}

export function resolveCardFrameKind(def: CardDefinition): CardFrameKind {
  const essence = getEssenceCost(def).exhaust > 0;
  const corruption = getCorruptionCost(def) > 0;
  if (essence && corruption) return "essenceAndCorruption";
  if (corruption) return "corruption";
  return "essence";
}

export function getCardFrameUrl(def: CardDefinition): string {
  return CARD_FRAME_URLS[resolveCardFrameKind(def)];
}

/** Linha do setor tipo: `Tropa — Neutra`, `Feitiço — Neutro`. */
export function formatCardTypeLine(
  def: CardDefinition,
  spellSpeedLabel?: string,
): string {
  const type = getCardType(def);
  const faction = getFaction(def);
  const factionWord =
    type === "spell"
      ? faction === "neutra"
        ? "Neutro"
        : faction
      : faction === "neutra"
        ? "Neutra"
        : faction;
  const base = `${cardTypeLabel(type)} — ${factionWord}`;
  if (type === "spell" && spellSpeedLabel) {
    return `${base} · ${spellSpeedLabel}`;
  }
  return base;
}

/** Texto curto na faixa de tipo (evita overflow em feitiços). */
export function formatCardTypeLineCompact(
  def: CardDefinition,
  spellSpeedLabel?: string,
): string {
  if (getCardType(def) === "spell" && spellSpeedLabel) {
    return `Feitiço · ${spellSpeedLabel}`;
  }
  return formatCardTypeLine(def, spellSpeedLabel);
}

export function cardTypeLabel(type: CardType): string {
  return CARD_TYPE_LABELS[type] ?? type;
}

export function factionLabel(faction: FactionId): string {
  return FACTION_LABELS[faction] ?? faction;
}
