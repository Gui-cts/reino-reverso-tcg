import { isMagicAllowedInCombat, spellCostReductionInCombat } from "./arena-effects";
import { checkCombatEndAfterDamage } from "./combat";
import {
  appendLog,
  canAfford,
  countTroopsInZone,
  exhaustEssence,
  getTroopName,
  opponent,
  sanitizePlayerHands,
} from "./helpers";
import { MAX_TROOPS_PER_ZONE } from "./types";
import type {
  CardDefinition,
  CardSpeed,
  GameState,
  PlayerId,
  SpellEffectId,
  TroopInstance,
} from "./types";

export function isSpellCard(def: CardDefinition | undefined): boolean {
  if (!def) return false;
  return def.cardKind === "spell" || Boolean(def.spellEffect);
}

export function isTroopCard(def: CardDefinition | undefined): boolean {
  if (!def) return false;
  return !isSpellCard(def) && !def.isToken;
}

export function getCardSpeed(def: CardDefinition): CardSpeed {
  if (def.cardSpeed) return def.cardSpeed;
  if (isSpellCard(def)) return "standard";
  return "standard";
}

function isCombatMagicWindow(state: GameState): boolean {
  return state.turnPhase === "combat" && state.combat?.subPhase === "magic";
}

export function speedLabel(speed: CardSpeed): string {
  switch (speed) {
    case "fast":
      return "Rápida";
    case "combat":
      return "Combate";
    default:
      return "Padrão";
  }
}

export function defaultTroopFields(
  def: CardDefinition,
): Pick<TroopInstance, "attack" | "currentHealth" | "attachedSpell" | "healthBonus"> {
  if (isSpellCard(def)) {
    return { attack: 0, currentHealth: 1, attachedSpell: null, healthBonus: 0 };
  }
  return {
    attack: def.attack,
    currentHealth: def.health,
    attachedSpell: null,
    healthBonus: 0,
  };
}

export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function describeSpellEffect(effect: SpellEffectId): string {
  switch (effect) {
    case "encore":
      return "Se atacada: atacante rola 1d6 — ímpar erra o golpe.";
    case "iron-skin":
      return "Tropa aliada +2 de vida permanente.";
    case "blood-cauldron":
      return "Tropa inimiga na arena: 1d6 — par = 2 de dano.";
    case "gust-wind":
      return "Tropa na arena (aliada ou inimiga) volta à base do dono, exausta.";
    default:
      return "";
  }
}

export function spellEffectLabel(effect: SpellEffectId): string {
  switch (effect) {
    case "encore":
      return "Encore";
    case "iron-skin":
      return "Pele de Ferro";
    case "blood-cauldron":
      return "Caldeirão";
    case "gust-wind":
      return "Lufada";
    default:
      return "";
  }
}

function effectiveSpellCost(state: GameState, def: CardDefinition): number {
  let cost = def.cost;
  if (state.combat?.spellsCostLess) {
    cost = Math.max(0, cost - spellCostReductionInCombat(state));
  }
  return cost;
}

function isFieldTroop(t: TroopInstance): boolean {
  return (t.zone === "base" || t.zone === "arena") && t.currentHealth > 0;
}

/** Pode lançar esta magia agora (velocidade + fase do jogo). */
export function canPlaySpellNow(
  state: GameState,
  player: PlayerId,
  spellDef: CardDefinition,
): boolean {
  if (state.matchPhase !== "playing" || !isSpellCard(spellDef)) return false;
  if (state.combat && !isMagicAllowedInCombat(state)) return false;

  const speed = getCardSpeed(spellDef);

  if (speed === "fast") {
    return state.turnPhase === "main" || state.turnPhase === "combat";
  }

  if (speed === "combat") {
    return isCombatMagicWindow(state);
  }

  if (speed === "standard") {
    if (state.turnPhase === "main" && state.activePlayer === player && !state.combat) {
      return true;
    }
    if (isCombatMagicWindow(state)) return true;
    return false;
  }

  return false;
}

export function canTargetSpell(
  state: GameState,
  caster: PlayerId,
  spellDef: CardDefinition,
  target: TroopInstance,
): boolean {
  if (!spellDef.spellEffect || !isFieldTroop(target)) return false;

  const inCombat = state.combat !== null;
  const combatArenaId = state.combat?.arenaId;

  switch (spellDef.spellEffect) {
    case "encore":
    case "iron-skin":
      if (target.owner !== caster || target.attachedSpell !== null) return false;
      if (inCombat && target.zone === "base") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      return true;
    case "blood-cauldron":
      if (target.owner !== opponent(caster)) return false;
      if (target.zone !== "arena") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      return true;
    case "gust-wind":
      if (target.zone !== "arena") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      if (countTroopsInZone(state, target.owner, "base") >= MAX_TROOPS_PER_ZONE) {
        return false;
      }
      return true;
    default:
      return false;
  }
}

export function playSpell(
  state: GameState,
  caster: PlayerId,
  spellInstanceId: string,
  targetTroopId: string,
): GameState {
  const pl = state.players[caster];
  if (!pl.hand.includes(spellInstanceId)) {
    return { ...state, log: appendLog(state, "Magia não está na sua mão.") };
  }

  const spellInst = state.troops[spellInstanceId];
  if (!spellInst || spellInst.owner !== caster) return state;

  const spellDef = state.catalog[spellInst.cardId];
  if (!spellDef || !isSpellCard(spellDef) || !spellDef.spellEffect) {
    return { ...state, log: appendLog(state, "Esta carta não é uma magia.") };
  }

  if (!canPlaySpellNow(state, caster, spellDef)) {
    return {
      ...state,
      log: appendLog(
        state,
        `${spellDef.name} (${speedLabel(getCardSpeed(spellDef))}) não pode ser lançada agora.`,
      ),
    };
  }

  const target = state.troops[targetTroopId];
  if (!target) {
    return { ...state, log: appendLog(state, "Alvo inválido.") };
  }

  if (!canTargetSpell(state, caster, spellDef, target)) {
    return {
      ...state,
      log: appendLog(
        state,
        "Alvo inválido para esta magia (zona, arena ou já encantada).",
      ),
    };
  }

  const cost = effectiveSpellCost(state, spellDef);
  if (!canAfford(state, caster, cost)) {
    return {
      ...state,
      log: appendLog(
        state,
        `Essência insuficiente para ${spellDef.name} (precisa ${cost}).`,
      ),
    };
  }

  let next = exhaustEssence(state, caster, cost);
  const players = [...next.players] as GameState["players"];
  const hand = players[caster].hand.filter((id) => id !== spellInstanceId);
  players[caster] = {
    ...players[caster],
    hand,
    discard: [...players[caster].discard, spellInst.cardId],
  };

  const troops = { ...next.troops };
  delete troops[spellInstanceId];

  const effect = spellDef.spellEffect;
  const arenaId = state.combat?.arenaId;

  if (effect === "blood-cauldron") {
    const roll = rollD6();
    const even = roll % 2 === 0;
    let logMsg = `${spellDef.name} em ${getTroopName(next, target)} — 1d6: ${roll}. `;
    if (even) {
      const t = troops[targetTroopId]!;
      const hp = Math.max(0, t.currentHealth - 2);
      troops[targetTroopId] = { ...t, currentHealth: hp };
      logMsg += "Par — 2 de dano!";
    } else {
      logMsg += "Ímpar — sem dano.";
    }
    next = {
      ...next,
      players,
      troops,
      log: appendLog(next, logMsg),
    };
    next = sanitizePlayerHands(next);
    if (arenaId && next.combat) {
      return checkCombatEndAfterDamage(next, arenaId, "Combate encerrado após magia");
    }
    return next;
  }

  const t = troops[targetTroopId]!;
  if (effect === "iron-skin") {
    troops[targetTroopId] = {
      ...t,
      healthBonus: t.healthBonus + 2,
      currentHealth: t.currentHealth + 2,
      attachedSpell: "iron-skin",
    };
    next = {
      ...next,
      players,
      troops,
      log: appendLog(
        next,
        `${spellDef.name} em ${getTroopName(next, t)} — +2 de vida permanente.`,
      ),
    };
    return sanitizePlayerHands(next);
  }

  if (effect === "encore") {
    troops[targetTroopId] = { ...t, attachedSpell: "encore" };
    next = {
      ...next,
      players,
      troops,
      log: appendLog(
        next,
        `${spellDef.name} em ${getTroopName(next, t)} — ataques contra ela podem errar (1d6 ímpar).`,
      ),
    };
    return sanitizePlayerHands(next);
  }

  if (effect === "gust-wind") {
    const owner = t.owner;
    troops[targetTroopId] = {
      ...t,
      zone: "base",
      arenaId: null,
      exhausted: true,
    };
    next = {
      ...next,
      players,
      troops,
      log: appendLog(
        next,
        `${spellDef.name} — ${getTroopName(next, t)} voltou à base do Jogador ${owner + 1} (exausta).`,
      ),
    };
    next = sanitizePlayerHands(next);
    if (arenaId && next.combat) {
      return checkCombatEndAfterDamage(next, arenaId, "Combate encerrado após magia");
    }
    return next;
  }

  return state;
}

/** Encore: antes do dano, 1d6 ímpar = ataque erra (ainda conta como ataque). */
export function resolveEncoreBeforeAttack(
  state: GameState,
  attackerId: string,
  targetId: string,
): { state: GameState; proceed: boolean } {
  const target = state.troops[targetId];
  if (!target || target.attachedSpell !== "encore") {
    return { state, proceed: true };
  }

  const roll = rollD6();
  const misses = roll % 2 === 1;
  const attacker = state.troops[attackerId];
  const attackerName = attacker ? getTroopName(state, attacker) : "Atacante";
  const targetName = getTroopName(state, target);

  if (!misses) {
    return {
      state: {
        ...state,
        log: appendLog(
          state,
          `Encore (${targetName}) — 1d6: ${roll} (par). ${attackerName} acerta.`,
        ),
      },
      proceed: true,
    };
  }

  const combat = state.combat;
  if (!combat) return { state, proceed: true };

  return {
    state: {
      ...state,
      combat: {
        ...combat,
        attackedThisStrike: [...combat.attackedThisStrike, attackerId],
      },
      log: appendLog(
        state,
        `Encore (${targetName}) — 1d6: ${roll} (ímpar). ${attackerName} erra o ataque!`,
      ),
    },
    proceed: false,
  };
}
