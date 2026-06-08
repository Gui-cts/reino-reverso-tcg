import { getCombatAssigningPlayer } from "./combat";
import { getAvailableEssence, opponent } from "./helpers";
import { canRespondWithCounter } from "./spell-stack";
import { canPlaySpellNow, getCardSpeed, isSpellCard } from "./spells";
import type { GameAction, GameState, PlayerId } from "./types";

function isCounterspellPlay(
  state: GameState,
  seat: PlayerId,
  action: Extract<GameAction, { type: "PLAY_SPELL" }>,
): boolean {
  const inst = state.troops[action.spellInstanceId];
  if (!inst || inst.owner !== seat) return false;
  const def = state.catalog[inst.cardId];
  if (!def) return false;
  return canRespondWithCounter(state, seat, def);
}

function canUseLeaderAbilityReact(state: GameState, player: PlayerId): boolean {
  if (!state.combat) return false;
  const pl = state.players[player];
  if (!pl.leaderId || pl.leaderAbilityUsedThisTurn || pl.leaderExhausted) return false;
  const ld = state.catalog[pl.leaderId];
  if (!ld?.leaderAbilityId) return false;

  const abilityId = ld.leaderAbilityId;
  if (
    abilityId !== "shield" &&
    abilityId !== "frost-convert" &&
    abilityId !== "empathy-mark"
  ) {
    return false;
  }

  if (abilityId === "shield" || abilityId === "frost-convert") {
    if (getAvailableEssence(state, player).length < 2) return false;
  } else if (abilityId === "empathy-mark") {
    if (getAvailableEssence(state, player).length < 1) return false;
  }

  const arenaId = state.combat.arenaId;
  return Object.values(state.troops).some(
    (t) =>
      t.owner === player &&
      t.zone === "arena" &&
      t.arenaId === arenaId &&
      t.currentHealth > 0,
  );
}

function canPlayReactiveFastSpell(
  state: GameState,
  player: PlayerId,
  spellInstanceId: string,
): boolean {
  const inst = state.troops[spellInstanceId];
  if (!inst || inst.owner !== player) return false;
  const def = state.catalog[inst.cardId];
  if (!def || !isSpellCard(def) || getCardSpeed(def) !== "fast") return false;
  return canPlaySpellNow(state, player, def);
}

function isStrikeReactionAction(
  state: GameState,
  player: PlayerId,
  action: GameAction,
): boolean {
  switch (action.type) {
    case "USE_LEADER_ABILITY":
      return canUseLeaderAbilityReact(state, player);
    case "PLAY_SPELL":
      return canPlayReactiveFastSpell(state, player, action.spellInstanceId);
    default:
      return false;
  }
}

/** Magia rápida ou habilidade reativa do Líder durante o golpe de combate (oponente do atacante). */
export function playerCanReactDuringStrike(state: GameState, player: PlayerId): boolean {
  if (!state.combat || state.combat.subPhase !== "strike") return false;
  if (player === getCombatAssigningPlayer(state.combat)) return false;

  for (const spellId of state.players[player].hand) {
    if (canPlayReactiveFastSpell(state, player, spellId)) {
      return true;
    }
  }
  return canUseLeaderAbilityReact(state, player);
}

/** Pode responder ao feitiço pendente (Contramagia, passar ou pagar custo). */
export function canRespondToPendingSpell(s: GameState, player: PlayerId): boolean {
  const pending = s.pendingSpell;
  if (!pending) return false;
  if (pending.counterWindowOpen && player === opponent(pending.caster)) return true;
  if (pending.awaitingCounterPayment && player === pending.caster) return true;
  return false;
}

/** Quem pode agir neste momento (hotseat / online — não inclui CPU). */
export function canControlPlayer(s: GameState, player: PlayerId): boolean {
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

  if (s.pendingSpell) return false;

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
    case "MOVE_TROOP":
    case "ACTIVATE_CAPTAIN_ABILITY": {
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
    case "EQUIP_TROOP": {
      const inst = state.troops[action.equipmentInstanceId];
      return inst?.owner ?? null;
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

  if (action.type === "POST_PHASE_CHOICE") {
    const expected =
      action.player === 0 ? "phase_end_choice_p0" : "phase_end_choice_p1";
    if (state.matchPhase === expected && seat === action.player) return true;
  }

  if (state.pendingSpell) {
    if (
      state.pendingSpell.counterWindowOpen &&
      seat === opponent(state.pendingSpell.caster)
    ) {
      if (action.type === "PASS_SPELL_COUNTER") return true;
      if (action.type === "PLAY_SPELL") return isCounterspellPlay(state, seat, action);
      return false;
    }
    if (
      state.pendingSpell.awaitingCounterPayment &&
      seat === state.pendingSpell.caster
    ) {
      return action.type === "RESOLVE_COUNTER_PAYMENT";
    }
    return false;
  }

  if (canControlPlayer(state, seat)) return true;

  if (
    state.combat?.subPhase === "strike" &&
    seat !== getCombatAssigningPlayer(state.combat)
  ) {
    return isStrikeReactionAction(state, seat, action);
  }

  return false;
}
