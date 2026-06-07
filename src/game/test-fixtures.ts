import { buildCatalogMap } from "./cards";
import type { CardCatalog, GameState, PendingSpellState, PlayerId } from "./types";
import { LEADER_MAX_HP } from "./types";

/** Estado mínimo para testes de permissões e pilha de feitiços. */
export function minimalPlayingState(
  overrides: Partial<GameState> & { pendingSpell?: PendingSpellState | null } = {},
): GameState {
  const catalog = overrides.catalog ?? {};
  const base: GameState = {
    catalog,
    matchPhase: "playing",
    turnPhase: "main",
    turnNumber: 1,
    activePlayer: 0,
    gamePhase: "mundo-normal",
    winner: null,
    winReason: null,
    cpuPlayer: 1,
    testMode: null,
    phaseWinner: null,
    players: [
      {
        leaderHp: LEADER_MAX_HP,
        leaderId: "noah-pugilista",
        deck: [],
        hand: [],
        discard: [],
        essenceDiscard: [],
        exile: [],
        essenceIds: [],
        dominatedArenas: 0,
        sacrificedThisTurn: false,
        corruption: 0,
        leaderAbilityUsedThisTurn: false,
        leaderExhausted: false,
      },
      {
        leaderHp: LEADER_MAX_HP,
        leaderId: "noah-pugilista",
        deck: [],
        hand: [],
        discard: [],
        essenceDiscard: [],
        exile: [],
        essenceIds: [],
        dominatedArenas: 0,
        sacrificedThisTurn: false,
        corruption: 0,
        leaderAbilityUsedThisTurn: false,
        leaderExhausted: false,
      },
    ],
    troops: {},
    artifacts: {},
    equipments: {},
    essencePool: {},
    arenas: [],
    arenaPool: [],
    selectedArenaIds: [[], []],
    arenaSetupPicks: [],
    conquestWatch: {},
    combat: null,
    pendingSpell: null,
    mulliganUsed: [false, false],
    nextInstanceId: 1,
    log: [],
    ...overrides,
  };
  return base;
}

export function pendingSpellFixture(
  caster: PlayerId,
  effect: PendingSpellState["effect"],
  extra: Partial<PendingSpellState> = {},
): PendingSpellState {
  return {
    caster,
    spellCardId: "encore",
    effect,
    targetTroopId: null,
    targetArtifactId: null,
    counterWindowOpen: true,
    awaitingCounterPayment: false,
    ...extra,
  };
}

export function loadTestCatalog(raw: CardCatalog) {
  return buildCatalogMap(raw.cards);
}
