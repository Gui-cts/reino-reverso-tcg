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
    shielded: false,
    etherealThisTurn: false,
    attackSuppressed: false,
    ...defaultTroopFields(def),
    attack: stats.attack,
    currentHealth: stats.health,
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

export const GARGOYLE_CARD = {
  id: "token-gargula",
  name: "Gárgula",
  cost: 0,
  attack: 1,
  health: 1,
  hasEssenceSymbol: false,
  isToken: true,
  cardType: "troop" as const,
};

export function spellDef(
  id: string,
  effect: CardDefinition["spellEffect"],
  extra: Partial<CardDefinition> = {},
): CardDefinition {
  return {
    id,
    name: id,
    cost: extra.cost ?? 2,
    attack: 0,
    health: 0,
    hasEssenceSymbol: false,
    spellEffect: effect,
    cardSpeed: extra.cardSpeed ?? "combat",
    cardType: "spell",
    ...extra,
  };
}

export function withPlayerEssence(
  state: GameState,
  player: 0 | 1,
  count: number,
  startId = 0,
): GameState {
  const essencePool = { ...state.essencePool };
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `ess-${player}-${startId + i}`;
    ids.push(id);
    essencePool[id] = {
      instanceId: id,
      cardId: "essence-card",
      owner: player,
      exhausted: false,
    };
  }
  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...players[player],
    essenceIds: [...players[player].essenceIds, ...ids],
  };
  return { ...state, essencePool, players };
}

export function spellInHand(
  state: GameState,
  player: 0 | 1,
  instanceId: string,
  def: CardDefinition,
): GameState {
  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...players[player],
    hand: [...players[player].hand, instanceId],
  };
  const troops = {
    ...state.troops,
    [instanceId]: {
      instanceId,
      cardId: def.id,
      owner: player,
      zone: "hand" as const,
      arenaId: null,
      exhausted: false,
      pinned: false,
      shielded: false,
      etherealThisTurn: false,
      attackSuppressed: false,
      ...defaultTroopFields(def),
    },
  };
  const catalog = { ...state.catalog, [def.id]: def };
  return { ...state, players, troops, catalog };
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
