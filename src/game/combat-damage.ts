import { appendLog, getTroopName } from "./helpers";
import {
  applyVincularAfterCombatHit,
  getLegalCombatTargets,
  isLegalCombatTarget,
  pickNextCleaveTarget,
  troopHasKeyword,
} from "./keywords";
import type { GameState, PlayerId, TroopInstance } from "./types";

function applyDamage(
  troops: Record<string, TroopInstance>,
  troopId: string,
  damage: number,
): { troops: Record<string, TroopInstance>; shieldBlocked: boolean } {
  const t = troops[troopId];
  if (!t) return { troops, shieldBlocked: false };
  if (t.shielded && damage > 0) {
    return {
      troops: { ...troops, [troopId]: { ...t, shielded: false } },
      shieldBlocked: true,
    };
  }
  const currentHealth = Math.max(0, t.currentHealth - damage);
  return { troops: { ...troops, [troopId]: { ...t, currentHealth } }, shieldBlocked: false };
}

export type StrikeDamageResult = {
  state: GameState;
  troops: Record<string, TroopInstance>;
  logLine: string;
};

/** Aplica dano do ataque (com Fatiar) e revida simultânea do primeiro alvo (GDD §7.2). */
export function applyStrikeDamage(
  state: GameState,
  attacker: TroopInstance,
  arenaId: string,
  strikingPlayer: PlayerId,
  initialTargetId: string,
  arenaName: string,
  randomLabel: boolean,
): StrikeDamageResult {
  const hasFatiar = troopHasKeyword(state, attacker, "fatiar");
  let troops = { ...state.troops };
  let working = state;
  let remaining = attacker.attack;
  let currentId = initialTargetId;
  const hitParts: string[] = [];
  const alreadyHit = new Set<string>();
  const firstTargetId = initialTargetId;

  const firstTargetBefore = troops[firstTargetId];
  const firstTargetTrades =
    Boolean(
      firstTargetBefore &&
        firstTargetBefore.currentHealth > 0 &&
        firstTargetBefore.owner !== strikingPlayer &&
        isLegalCombatTarget(working, strikingPlayer, arenaId, firstTargetBefore),
    );
  const firstTargetCounter =
    firstTargetTrades && firstTargetBefore ? firstTargetBefore.attack : 0;

  while (remaining > 0) {
    let target = troops[currentId];
    if (!target || target.currentHealth <= 0 || target.owner === strikingPlayer) {
      if (!hasFatiar) break;
      const next = pickNextCleaveTarget(working, strikingPlayer, arenaId, troops, alreadyHit);
      if (!next) break;
      currentId = next.instanceId;
      target = troops[currentId];
      if (!target) break;
    }

    if (hitParts.length === 0 && !isLegalCombatTarget(working, strikingPlayer, arenaId, target)) {
      break;
    }
    if (hitParts.length > 0 && !getLegalCombatTargets(working, strikingPlayer, arenaId).some(
      (t) => t.instanceId === currentId,
    )) {
      break;
    }

    const hpBefore = target.currentHealth;
    const dmgResult = applyDamage(troops, currentId, remaining);
    troops = dmgResult.troops;
    if (dmgResult.shieldBlocked) {
      hitParts.push(`${getTroopName(working, target)} (escudo absorveu)`);
      alreadyHit.add(currentId);
      break;
    }
    const tAfter = troops[currentId];
    const dealt = hpBefore - (tAfter?.currentHealth ?? 0);
    remaining -= dealt;
    alreadyHit.add(currentId);

    if (dealt > 0) {
      hitParts.push(`${getTroopName(working, target)} (${dealt})`);
    }

    if (tAfter && tAfter.currentHealth > 0) {
      working = { ...working, troops };
      working = applyVincularAfterCombatHit(working, attacker, tAfter);
      troops = working.troops;
    }

    if (!hasFatiar || remaining <= 0) break;

    const next = pickNextCleaveTarget(working, strikingPlayer, arenaId, troops, alreadyHit);
    if (!next) break;
    currentId = next.instanceId;
    working = { ...working, troops };
  }

  let counterShielded = false;
  if (firstTargetTrades && firstTargetCounter > 0) {
    const counterResult = applyDamage(troops, attacker.instanceId, firstTargetCounter);
    troops = counterResult.troops;
    counterShielded = counterResult.shieldBlocked;
  }

  const attackerName = getTroopName(state, attacker);
  const attackerAfter = troops[attacker.instanceId];
  const counterDealt =
    counterShielded ? 0
      : firstTargetCounter > 0 && attackerAfter
        ? Math.max(0, attacker.currentHealth - attackerAfter.currentHealth)
        : 0;
  let logLine: string;
  if (hitParts.length === 0) {
    logLine = `${attackerName} não conseguiu ferir o alvo em ${arenaName}.`;
  } else if (hitParts.length === 1) {
    const tradeNote =
      counterShielded
        ? ` Revida: escudo de ${attackerName} absorveu.`
        : counterDealt > 0
          ? ` Revida: ${counterDealt} em ${attackerName}.`
          : "";
    logLine = randomLabel
      ? `${attackerName} atacou ${hitParts[0]} em ${arenaName} (alvo aleatório — Cidade das Curvas).${tradeNote}`
      : `${attackerName} atacou ${hitParts[0]} em ${arenaName} (troca de dano).${tradeNote}`;
  } else {
    logLine = `${attackerName} atacou ${hitParts.join(", ")} em ${arenaName}${hasFatiar ? " (Fatiar)" : ""}.`;
  }

  let finalState: GameState = { ...state, troops };
  const attackerFinal = troops[attacker.instanceId];

  if (attacker.isFrostborn && hitParts.length > 0) {
    const roll = Math.floor(Math.random() * 6) + 1;
    const frozen = roll % 2 === 0;
    const firstTarget = troops[firstTargetId];
    if (frozen && firstTarget && firstTarget.currentHealth > 0) {
      troops[firstTargetId] = { ...firstTarget, attackSuppressed: true };
      finalState = {
        ...finalState,
        troops: { ...troops },
        log: appendLog(finalState, `Congelar — ${getTroopName(finalState, firstTarget)} congelado(a)! (1d6 = ${roll}, par → attackSuppressed)`),
      };
    } else {
      finalState = {
        ...finalState,
        log: appendLog(finalState, `Congelar — 1d6 = ${roll} (${frozen ? "par, mas alvo caiu" : "ímpar, sem efeito"}).`),
      };
    }
  }

  if (
    attacker.isFrostborn &&
    attackerFinal &&
    attackerFinal.currentHealth > 0 &&
    hitParts.length > 0 &&
    finalState.players[attacker.owner].leaderId === "noah-vampiro-inverno"
  ) {
    const firstTarget = troops[firstTargetId];
    const hpBefore = firstTarget
      ? Math.min(attacker.attack, (state.troops[firstTargetId]?.currentHealth ?? 0))
      : 0;
    const damageDealt = hpBefore > 0 ? hpBefore : 0;
    if (damageDealt > 0) {
      const catalogDef = finalState.catalog[attacker.cardId];
      const maxHp = catalogDef ? catalogDef.health + (attacker.healthBonus ?? 0) : attacker.currentHealth;
      const healed = Math.min(damageDealt, maxHp - attackerFinal.currentHealth);
      if (healed > 0) {
        troops[attacker.instanceId] = {
          ...attackerFinal,
          currentHealth: attackerFinal.currentHealth + healed,
        };
        finalState = {
          ...finalState,
          troops: { ...troops },
          log: appendLog(finalState, `Vampirismo — ${getTroopName(finalState, attacker)} curou ${healed} HP (dano causado ao alvo).`),
        };
      }
    }
  }

  return {
    state: finalState,
    troops: finalState.troops,
    logLine,
  };
}
