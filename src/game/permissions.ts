import { getCombatAssigningPlayer } from "./combat";
import { opponent } from "./helpers";
import type { GameAction, GameState, PlayerId } from "./types";

/** Quem pode agir neste momento (hotseat / online — não inclui CPU). */
export function canControlPlayer(s: GameState, player: PlayerId): boolean {
  if (s.pendingSpell) {
    if (s.pendingSpell.counterWindowOpen && player === opponent(s.pendingSpell.caster)) {
      return true;
    }
    if (s.pendingSpell.awaitingCounterPayment && player === s.pendingSpell.caster) {
      return true;
    }
  }

  if (s.matchPhase === "setup_arenas_p0") return player === 0;
  if (s.matchPhase === "setup_arenas_p1") return player === 1;
  if (s.matchPhase === "mulligan_p0") return player === 0;
  if (s.matchPhase === "mulligan_p1") return player === 1;
  if (s.matchPhase === "phase_end_choice_p0") return player === 0;
  if (s.matchPhase === "phase_end_choice_p1") return player === 1;

  const winner = s.phaseWinner;
  if (winner !== null) {
    if (s.matchPhase === "setup_abismo_winner") return player === winner;
    if (s.matchPhase === "setup_abismo_loser") return player === opponent(winner);
    if (s.matchPhase === "setup_rr_winner") return player === winner;
  }

  if (s.matchPhase === "playing") {
    if (s.combat) {
      if (s.combat.subPhase === "magic" && !s.combat.magicPassed[player]) {
        return true;
      }
      if (s.combat.subPhase === "strike") {
        return player === getCombatAssigningPlayer(s.combat);
      }
      return false;
    }
    return player === s.activePlayer;
  }

  return false;
}

/** Assento que executa esta ação (validação no servidor). */
export function inferActionPlayer(state: GameState, action: GameAction): PlayerId | null {
  switch (action.type) {
    case "SELECT_ARENA":
    case "MULLIGAN":
    case "SKIP_MULLIGAN":
    case "PLAY_SPELL":
    case "PASS_SPELL_COUNTER":
    case "RESOLVE_COUNTER_PAYMENT":
    case "PASS_COMBAT_MAGIC":
    case "POST_PHASE_CHOICE":
    case "USE_LEADER_ABILITY":
    case "EVOLVE_LEADER":
      return action.player;
    case "PLAY_TROOP":
    case "SACRIFICE_ESSENCE":
    case "MOVE_TROOP": {
      const troop = state.troops[action.troopId];
      return troop?.owner ?? null;
    }
    case "DECLARE_COMBAT":
      return state.activePlayer;
    case "EXECUTE_COMBAT_ATTACK": {
      const attacker = state.troops[action.attackerId];
      return attacker?.owner ?? null;
    }
    case "END_COMBAT_STRIKE":
      return state.combat ? getCombatAssigningPlayer(state.combat) : state.activePlayer;
    case "END_TURN":
      return state.activePlayer;
    case "ACTIVATE_ARTIFACT": {
      const artifact = state.artifacts[action.artifactId];
      return artifact?.owner ?? null;
    }
    default:
      return null;
  }
}

export function canSubmitAction(
  state: GameState,
  seat: PlayerId,
  action: GameAction,
): boolean {
  const actor = inferActionPlayer(state, action);
  if (actor === null || actor !== seat) return false;
  return canControlPlayer(state, seat);
}
