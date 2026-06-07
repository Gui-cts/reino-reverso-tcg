import type { GameState, PendingSpellState, SpellEffectId } from "../game/types";

const EFFECT_THREAT: Record<SpellEffectId, number> = {
  omega: 95,
  "blood-cauldron": 75,
  encore: 65,
  "iron-skin": 55,
  "gust-wind": 50,
  constriction: 45,
  "destroy-artifact": 50,
  ethereal: 40,
  "draw-two": 25,
  "troop-tutor": 30,
  "spell-tutor": 30,
  counterspell: 0,
};

/** Quão perigoso é deixar o feitiço pendente resolver (para CPU decidir Contramagia/pagamento). */
export function scorePendingSpellThreat(
  state: GameState,
  pending: PendingSpellState,
): number {
  let score = EFFECT_THREAT[pending.effect] ?? 40;

  if (pending.targetTroopId) {
    const target = state.troops[pending.targetTroopId];
    if (target) {
      const power = target.attack + target.currentHealth;
      const helpsCaster = target.owner === pending.caster;
      if (helpsCaster) {
        score += power;
      } else {
        score += power * 2;
        if (pending.effect === "blood-cauldron") {
          score += Math.max(0, 8 - target.currentHealth) * 8;
        }
        if (pending.effect === "omega") {
          score += power * 2;
        }
      }
    }
  }

  if (pending.effect === "draw-two" || pending.effect === "troop-tutor") {
    const hand = state.players[pending.caster].hand.length;
    if (hand <= 3) score += 15;
  }

  return score;
}

/** Ameaça mínima para gastar Contramagia. */
export const COUNTERSPELL_MIN_THREAT = 45;

/** Ameaça mínima para pagar 2 essências após Contramagia oponente. */
export const PAY_COUNTER_MIN_THREAT = 50;

export function shouldCpuCounterSpell(
  state: GameState,
  pending: PendingSpellState,
): boolean {
  return scorePendingSpellThreat(state, pending) >= COUNTERSPELL_MIN_THREAT;
}

export function shouldCpuPayCounterCost(
  state: GameState,
  pending: PendingSpellState,
): boolean {
  return scorePendingSpellThreat(state, pending) >= PAY_COUNTER_MIN_THREAT;
}
