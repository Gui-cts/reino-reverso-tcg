import { defaultTroopFields } from "./spells";
import { minimalPlayingState } from "./test-fixtures";
import type {
  ArenaState,
  CardDefinition,
  CombatState,
  GameState,
  TroopInstance,
} from "./types";

export const COMBAT_ARENA_ID = "arena-a";

export function combatArena(overrides: Partial<ArenaState> = {}): ArenaState {
  return {
    id: COMBAT_ARENA_ID,
    name: "Arena Teste",
    neutral: false,
    phase: "mundo-normal",
    effect: "none",
    conquestPointsToDominate: 2,
    dominatedBy: null,
    conquestPoints: { 0: 0, 1: 0 },
    ...overrides,
  };
}

export function troopCard(
  id: string,
  attack: number,
  health: number,
  extra: Partial<CardDefinition> = {},
): CardDefinition {
  return {
    id,
    name: id,
    cost: 0,
    attack,
    health,
    hasEssenceSymbol: false,
    ...extra,
  };
}

export function arenaTroop(
  id: string,
  owner: 0 | 1,
  cardId: string,
  stats: { attack: number; health: number },
  extra: Partial<TroopInstance> = {},
): TroopInstance {
  const def = troopCard(cardId, stats.attack, stats.health);
  return {
    instanceId: id,
    cardId,
    owner,
    zone: "arena",
    arenaId: COMBAT_ARENA_ID,
    exhausted: false,
    pinned: false,
    movementLocked: false,
    attack: stats.attack,
    currentHealth: stats.health,
    attachedSpell: null,
    healthBonus: 0,
    equipmentId: null,
    shielded: false,
    etherealThisTurn: false,
    attackSuppressed: false,
    ...defaultTroopFields(def),
    ...extra,
  };
}

export function baseCombat(overrides: Partial<CombatState> = {}): CombatState {
  return {
    arenaId: COMBAT_ARENA_ID,
    strike: 1,
    declaredBy: 0,
    strikingPlayer: 0,
    subPhase: "magic",
    magicWindow: 1,
    magicPassed: [false, false],
    attackedThisStrike: [],
    ...overrides,
  };
}

export function inCombat(
  troops: Record<string, TroopInstance>,
  catalog: Record<string, CardDefinition>,
  combatOverrides: Partial<CombatState> = {},
  stateOverrides: Partial<GameState> = {},
): GameState {
  return minimalPlayingState({
    turnPhase: "combat",
    combat: baseCombat(combatOverrides),
    arenas: [combatArena(stateOverrides.arenas?.[0] ? {} : {})],
    troops,
    catalog,
    ...stateOverrides,
  });
}

/** Dois combatentes na arena, pronto para declarar combate. */
export function contestedArenaSetup(
  p0Troop = arenaTroop("p0", 0, "a", { attack: 3, health: 3 }),
  p1Troop = arenaTroop("p1", 1, "b", { attack: 2, health: 2 }),
): GameState {
  const catalog = {
    a: troopCard("a", 3, 3),
    b: troopCard("b", 2, 2),
  };
  return minimalPlayingState({
    turnPhase: "main",
    activePlayer: 0,
    arenas: [combatArena()],
    troops: { [p0Troop.instanceId]: p0Troop, [p1Troop.instanceId]: p1Troop },
    catalog,
  });
}
