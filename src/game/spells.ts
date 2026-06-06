import { isMagicAllowedInCombat, spellCostReductionInCombat } from "./arena-effects";
import {
  appendLog,
  canPayCorruptionCost,
  canPayEssenceCost,
  countTroopsInZone,
  payCorruptionCost,
  payEssenceCost,
  getTroopName,
  opponent,
} from "./helpers";
import {
  canAffordCardCost,
  getCorruptionCost,
  getEssenceCost,
} from "./card-meta";
import { troopBlocksEnchantments } from "./keywords";
import {
  canRespondWithCounter,
  cancelPendingSpell,
  openPendingSpell,
  resolvePendingSpell,
  spellRequiresTarget,
  troopIsUntargetable,
  tryPayCounterCost,
} from "./spell-stack";
import { maxCorruptionForPhase, MAX_TROOPS_PER_ZONE } from "./types";
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
  if (def.cardType === "spell") return true;
  if (def.cardType && def.cardType !== "troop") return false;
  return def.cardKind === "spell" || Boolean(def.spellEffect);
}

export function isTroopCard(def: CardDefinition | undefined): boolean {
  if (!def) return false;
  if (def.cardType === "troop" || def.isToken) return true;
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
    case "turn":
      return "Turno";
    default:
      return "Padrão";
  }
}

export function defaultTroopFields(
  def: CardDefinition,
): Pick<
  TroopInstance,
  "attack" | "currentHealth" | "attachedSpell" | "healthBonus" | "movementLocked"
> {
  if (isSpellCard(def)) {
    return {
      attack: 0,
      currentHealth: 1,
      attachedSpell: null,
      healthBonus: 0,
      movementLocked: false,
    };
  }
  return {
    attack: def.attack,
    currentHealth: def.health,
    attachedSpell: null,
    healthBonus: 0,
    movementLocked: false,
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
    case "draw-two":
      return "Compre 2 cartas.";
    case "troop-tutor":
      return "Revele uma tropa do deck e coloque na mão.";
    case "counterspell":
      return "Anula feitiço oponente: ele paga 2 essências exauridas ou o efeito é cancelado.";
    case "spell-tutor":
      return "Revele um feitiço do deck e coloque na mão.";
    case "constriction":
      return "Prende tropa inimiga; no próximo combate do dono dela, não pode atacar.";
    case "ethereal":
      return "Tropa aliada não pode ser alvo de ataques nem feitiços pontuais neste turno.";
    case "omega":
      return "Destrói instantaneamente uma tropa inimiga no campo (custa 1 Corrupção).";
    case "destroy-artifact":
      return "Destrói um artefato ou equipamento inimigo.";
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
    case "draw-two":
      return "Compêndio";
    case "troop-tutor":
      return "Chamado";
    case "counterspell":
      return "Contramagia";
    case "spell-tutor":
      return "Revelação";
    case "constriction":
      return "Constrição";
    case "ethereal":
      return "Etereal";
    case "omega":
      return "Omega";
    case "destroy-artifact":
      return "Fragmentar";
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

/** Essência (com redução de arena) + Corrupção, se houver. */
export function canAffordSpellCost(
  state: GameState,
  player: PlayerId,
  spellDef: CardDefinition,
): boolean {
  const reduced = effectiveSpellCost(state, spellDef);
  const payment = { ...getEssenceCost(spellDef), exhaust: Math.max(0, reduced) };
  return canAffordCardCost(state, player, spellDef, payment);
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

  if (speed === "turn") {
    return state.turnPhase === "main" && state.activePlayer === player && !state.combat;
  }

  if (speed === "combat") {
    return isCombatMagicWindow(state);
  }

  if (spellDef.spellEffect === "counterspell" && canRespondWithCounter(state, player, spellDef)) {
    return true;
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
  if (troopIsUntargetable(target)) return false;

  if (target.zone === "arena" && target.arenaId) {
    const arena = state.arenas.find((a) => a.id === target.arenaId);
    if (arena?.effect === "no-magic") return false;
  }

  const inCombat = state.combat !== null;
  const combatArenaId = state.combat?.arenaId;

  switch (spellDef.spellEffect) {
    case "constriction":
      if (target.owner === caster) return false;
      if (target.zone !== "base" && target.zone !== "arena") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      return true;
    case "ethereal":
      if (target.owner !== caster) return false;
      if (target.zone !== "base" && target.zone !== "arena") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      return true;
    case "omega":
      if (target.owner === caster) return false;
      if (target.zone !== "base" && target.zone !== "arena") return false;
      return true;
    case "encore":
    case "iron-skin":
      if (troopBlocksEnchantments(state, target)) return false;
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
  targetTroopId?: string | null,
  targetArtifactId?: string | null,
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

  const effect = spellDef.spellEffect;

  if (effect === "counterspell") {
    const pending = state.pendingSpell;
    if (!pending?.counterWindowOpen || caster !== opponent(pending.caster)) {
      return { ...state, log: appendLog(state, "Contramagia só após um feitiço oponente.") };
    }
  } else if (state.pendingSpell) {
    return { ...state, log: appendLog(state, "Resolva o feitiço pendente antes de lançar outro.") };
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

  const needsTarget = spellRequiresTarget(effect);
  const targetId = targetTroopId ?? null;
  if (needsTarget) {
    if (!targetId) {
      return { ...state, log: appendLog(state, "Esta magia precisa de um alvo.") };
    }
    const target = state.troops[targetId];
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
  }

  const baseCost = getEssenceCost(spellDef);
  const reduced = effectiveSpellCost(state, spellDef);
  const payment = { ...baseCost, exhaust: Math.max(0, reduced) };
  const corruptionCost = getCorruptionCost(spellDef);

  if (!canPayEssenceCost(state, caster, payment)) {
    return {
      ...state,
      log: appendLog(
        state,
        `Essência insuficiente para ${spellDef.name} (precisa ${payment.exhaust}).`,
      ),
    };
  }

  if (!canPayCorruptionCost(state, caster, corruptionCost)) {
    return {
      ...state,
      log: appendLog(
        state,
        `${spellDef.name} exige ${corruptionCost} Corrupção (você tem ${pl.corruption}/${maxCorruptionForPhase(state.gamePhase)}).`,
      ),
    };
  }

  const paid = payEssenceCost(state, caster, payment, true);
  if (!paid.ok) {
    return { ...state, log: appendLog(state, "Não foi possível pagar o custo em Essência.") };
  }
  let next = paid.state;

  const paidCorruption = payCorruptionCost(next, caster, corruptionCost);
  if (!paidCorruption.ok) {
    return {
      ...state,
      log: appendLog(state, "Não foi possível pagar o custo em Corrupção."),
    };
  }
  next = paidCorruption.state;

  const players = [...next.players] as GameState["players"];
  const hand = players[caster].hand.filter((id) => id !== spellInstanceId);
  players[caster] = {
    ...players[caster],
    hand,
    discard: [...players[caster].discard, spellInst.cardId],
  };
  const troops = { ...next.troops };
  delete troops[spellInstanceId];
  next = { ...next, players, troops };

  if (effect === "counterspell") {
    const pending = state.pendingSpell!;
    return openPendingSpell(
      next,
      { ...pending, counterWindowOpen: false, awaitingCounterPayment: true },
      `${spellDef.name} — Jogador ${pending.caster + 1} pode exaurir 2 essências para o feitiço resolver.`,
    );
  }

  return openPendingSpell(
    next,
    {
      caster,
      spellCardId: spellInst.cardId,
      effect,
      targetTroopId: targetId,
      targetArtifactId: targetArtifactId ?? null,
      counterWindowOpen: true,
      awaitingCounterPayment: false,
    },
    `${spellDef.name} lançado — oponente pode jogar Contramagia ou passar.`,
  );
}

export function passSpellCounter(state: GameState, player: PlayerId): GameState {
  const pending = state.pendingSpell;
  if (!pending?.counterWindowOpen) return state;
  if (player !== opponent(pending.caster)) {
    return { ...state, log: appendLog(state, "Só o oponente do lançador pode passar.") };
  }
  let next = resolvePendingSpell({ ...state, pendingSpell: { ...pending, counterWindowOpen: false } });
  return { ...next, log: appendLog(next, "Feitiço resolvido.") };
}

export function resolveCounterPayment(
  state: GameState,
  player: PlayerId,
  payTwoEssence: boolean,
): GameState {
  const pending = state.pendingSpell;
  if (!pending?.awaitingCounterPayment) return state;
  if (player !== pending.caster) {
    return { ...state, log: appendLog(state, "Só o lançador do feitiço responde à Contramagia.") };
  }
  if (!payTwoEssence) {
    return cancelPendingSpell(state, "Jogador optou por não pagar.");
  }
  return tryPayCounterCost(state, player);
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
