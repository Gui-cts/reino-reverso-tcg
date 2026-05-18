import {
  arenaUsesRandomCombatTargets,
  getAvailableEssence,
  getCombatAssigningPlayer,
  getContestedArenaNames,
  hasAttackedThisStrike,
} from "../game";
import { canAfford, countTroopsInZone, getTroopsInZone, opponent } from "../game/helpers";
import type { GameAction, GameState, PlayerId } from "../game/types";
import { MAX_TROOPS_PER_ZONE } from "../game/types";

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function availableArenaIds(state: GameState, player: PlayerId): string[] {
  const other = opponent(player);
  const taken = new Set([
    ...state.selectedArenaIds[player],
    ...state.selectedArenaIds[other],
    ...state.arenaSetupPicks,
  ]);
  return state.arenaPool
    .filter((a) => {
      if (a.phase !== state.gamePhase) return false;
      if (a.neutral && state.gamePhase !== "reino-reverso") return false;
      return !taken.has(a.id);
    })
    .map((a) => a.id);
}

function pickArenaSetup(state: GameState, player: PlayerId): GameAction | null {
  const ids = availableArenaIds(state, player);
  const pick = pickRandom(ids);
  return pick ? { type: "SELECT_ARENA", player, arenaId: pick } : null;
}

function pickPostPhaseChoice(player: PlayerId): GameAction {
  const choices = ["essence", "corruption", "recycle"] as const;
  return {
    type: "POST_PHASE_CHOICE",
    player,
    choice: pickRandom([...choices]) ?? "recycle",
  };
}

function livingInArena(state: GameState, player: PlayerId, arenaId: string) {
  return getTroopsInZone(state, player, "arena", arenaId).filter((t) => t.currentHealth > 0);
}

function pickCombatAction(state: GameState, cpu: PlayerId): GameAction | null {
  const combat = state.combat;
  if (!combat || state.turnPhase !== "combat") return null;

  const striker = getCombatAssigningPlayer(combat);
  if (striker !== cpu) return null;

  const { arenaId } = combat;
  const allies = livingInArena(state, cpu, arenaId).filter(
    (t) => !hasAttackedThisStrike(combat, t.instanceId),
  );
  if (allies.length === 0) return null;

  const attacker = allies[0]!;
  const enemies = livingInArena(state, opponent(cpu), arenaId);
  if (enemies.length === 0) return null;

  const target = arenaUsesRandomCombatTargets(state, arenaId)
    ? pickRandom(enemies)!
    : enemies[0]!;

  return {
    type: "EXECUTE_COMBAT_ATTACK",
    attackerId: attacker.instanceId,
    targetId: target.instanceId,
  };
}

function pickMainTurnAction(state: GameState, cpu: PlayerId): GameAction | null {
  if (state.matchPhase !== "playing" || state.turnPhase !== "main" || state.combat) {
    return null;
  }
  if (state.activePlayer !== cpu) return null;

  const hand = state.players[cpu].hand;
  for (const troopId of hand) {
    const troop = state.troops[troopId];
    if (!troop || troop.owner !== cpu) continue;
    const def = state.catalog[troop.cardId];
    if (!def) continue;
    if (countTroopsInZone(state, cpu, "base") >= MAX_TROOPS_PER_ZONE) break;
    if (canAfford(state, cpu, def.cost)) {
      return { type: "PLAY_TROOP", troopId };
    }
  }

  const baseTroops = getTroopsInZone(state, cpu, "base").filter(
    (t) => !t.exhausted && !t.pinned,
  );
  if (baseTroops.length > 0 && state.arenas.length > 0) {
    let bestArena = state.arenas[0]!;
    let bestCount = countTroopsInZone(state, cpu, "arena", bestArena.id);
    for (const arena of state.arenas) {
      if (arena.dominatedBy !== null) continue;
      const n = countTroopsInZone(state, cpu, "arena", arena.id);
      if (n < bestCount) {
        bestCount = n;
        bestArena = arena;
      }
    }
    if (
      bestArena.dominatedBy === null &&
      countTroopsInZone(state, cpu, "arena", bestArena.id) < MAX_TROOPS_PER_ZONE
    ) {
      return {
        type: "MOVE_TROOP",
        troopId: baseTroops[0]!.instanceId,
        to: "arena",
        arenaId: bestArena.id,
      };
    }
  }

  const contested = getContestedArenaNames(state, cpu);
  if (contested.length > 0) {
    const arena = state.arenas.find((a) => contested.includes(a.name));
    if (arena) return { type: "DECLARE_COMBAT", arenaId: arena.id };
  }

  if (getAvailableEssence(state, cpu).length > 0 && !state.players[cpu].sacrificedThisTurn) {
    for (const troopId of hand) {
      const troop = state.troops[troopId];
      const def = troop ? state.catalog[troop.cardId] : undefined;
      if (def?.hasEssenceSymbol) {
        return { type: "SACRIFICE_ESSENCE", troopId };
      }
    }
  }

  return { type: "END_TURN" };
}

/** Próxima ação da CPU, ou null se for vez do humano / nada a fazer. */
export function pickCpuAction(state: GameState, cpuPlayer: PlayerId): GameAction | null {
  const cpu = cpuPlayer;

  if (state.matchPhase === "setup_arenas_p1" && cpu === 1) {
    if (state.selectedArenaIds[1].length < 2) return pickArenaSetup(state, 1);
    return null;
  }

  if (state.matchPhase === "mulligan_p1" && cpu === 1) {
    return { type: "SKIP_MULLIGAN", player: 1 };
  }

  if (state.matchPhase === "phase_end_choice_p1" && cpu === 1) {
    return pickPostPhaseChoice(1);
  }
  if (state.matchPhase === "phase_end_choice_p0" && cpu === 0) {
    return pickPostPhaseChoice(0);
  }

  if (state.matchPhase === "setup_abismo_winner" && state.phaseWinner === cpu) {
    if (state.arenaSetupPicks.length < 2) return pickArenaSetup(state, cpu);
    return null;
  }

  if (state.matchPhase === "setup_abismo_loser" && state.phaseWinner !== null) {
    if (cpu === opponent(state.phaseWinner)) {
      return pickArenaSetup(state, cpu);
    }
    return null;
  }

  if (state.matchPhase === "setup_rr_winner" && state.phaseWinner === cpu) {
    return pickArenaSetup(state, cpu);
  }

  const combatAction = pickCombatAction(state, cpu);
  if (combatAction) return combatAction;

  return pickMainTurnAction(state, cpu);
}

export function cpuControlsPhase(state: GameState, cpuPlayer: PlayerId): boolean {
  if (state.matchPhase === "finished") return false;

  if (state.matchPhase === "setup_arenas_p1" && cpuPlayer === 1) return true;
  if (state.matchPhase === "mulligan_p1" && cpuPlayer === 1) return true;
  if (state.matchPhase === "phase_end_choice_p0" && cpuPlayer === 0) return true;
  if (state.matchPhase === "phase_end_choice_p1" && cpuPlayer === 1) return true;
  if (state.matchPhase === "setup_abismo_winner" && state.phaseWinner === cpuPlayer) {
    return true;
  }
  if (
    state.matchPhase === "setup_abismo_loser" &&
    state.phaseWinner !== null &&
    cpuPlayer === opponent(state.phaseWinner)
  ) {
    return true;
  }
  if (state.matchPhase === "setup_rr_winner" && state.phaseWinner === cpuPlayer) {
    return true;
  }

  if (state.combat) {
    return getCombatAssigningPlayer(state.combat) === cpuPlayer;
  }

  return state.matchPhase === "playing" && state.activePlayer === cpuPlayer;
}
