import { buildCatalogMap, shuffle } from "./cards";
import { arenasForPhase } from "./arenas";
import { buildArenasFromPickIds } from "./phase-transition";
import { isSpellCard } from "./spells";
import { drawCards, type CreateGameOptions } from "./state";
import type { CardCatalog, GameState, PlayerId, PlayerState } from "./types";
export type TestMode = "abismo" | "reino-reverso";

export type CreateTestGameOptions = CreateGameOptions & {
  testMode: TestMode;
};

const ABISMO_TEST_ARENAS = [
  "armazem-colecionador",
  "cidade-das-curvas",
  "prisao-conglomerado",
] as const;

const RR_TEST_ARENA = "arena-reino-reverso";

const TEST_CONFIG: Record<
  TestMode,
  {
    gamePhase: GameState["gamePhase"];
    leaderHp: number;
    essenceCount: number;
    handSize: number;
    arenaIds: readonly string[];
    log: string;
  }
> = {
  abismo: {
    gamePhase: "abismo",
    leaderHp: 8,
    essenceCount: 5,
    handSize: 6,
    arenaIds: ABISMO_TEST_ARENAS,
    log: "Modo teste — Abismo: Líderes 8 HP, 5 Essências, 6 cartas na mão. Jogador 1 começa.",
  },
  "reino-reverso": {
    gamePhase: "reino-reverso",
    leaderHp: 3,
    essenceCount: 8,
    handSize: 5,
    arenaIds: [RR_TEST_ARENA],
    log: "Modo teste — Reino Reverso: Líderes 3 HP, 8 Essências, 5 cartas na mão. Jogador 1 começa.",
  },
};

function emptyPlayer(leaderHp: number): PlayerState {
  return {
    leaderHp,
    leaderId: null,
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
  };
}

function pickEssenceCardId(catalog: GameState["catalog"]): string {
  const troop = Object.values(catalog).find((c) => c.hasEssenceSymbol && !isSpellCard(c));
  if (troop) return troop.id;
  return Object.keys(catalog)[0] ?? "reporter-investigativo";
}

function addEssenceTokens(
  state: GameState,
  player: PlayerId,
  count: number,
  essenceCardId: string,
): GameState {
  let nextId = state.nextInstanceId;
  const players = [...state.players] as [PlayerState, PlayerState];
  const essencePool = { ...state.essencePool };
  const essenceIds = [...players[player].essenceIds];

  for (let i = 0; i < count; i++) {
    const essenceId = `essence-${nextId++}`;
    essencePool[essenceId] = {
      instanceId: essenceId,
      cardId: essenceCardId,
      owner: player,
      exhausted: false,
    };
    essenceIds.push(essenceId);
  }

  players[player] = { ...players[player], essenceIds };
  return { ...state, players, essencePool, nextInstanceId: nextId };
}

/** Partida já em jogo, pulando MN, mulligan e draft de arenas. */
export function createTestGame(
  catalogData: CardCatalog,
  options: CreateTestGameOptions,
): GameState {
  const { testMode, cpuPlayer = null, leaderId } = options;
  const cfg = TEST_CONFIG[testMode];
  const catalog = buildCatalogMap(catalogData.cards);
  const essenceCardId = pickEssenceCardId(catalog);

  const allBaseLeaders = catalogData.cards.filter(
    (c) => c.cardType === "leader" && !c.leaderFormOf,
  );
  const chosenLeaderId = leaderId ?? allBaseLeaders[0]?.id ?? null;
  const chosenLeader = chosenLeaderId ? catalog[chosenLeaderId] : null;
  const chosenHp = chosenLeader?.leaderMaxHp ?? cfg.leaderHp;

  const cpuLeader =
    allBaseLeaders.find((l) => l.id !== chosenLeaderId) ?? allBaseLeaders[0];
  const cpuLeaderId = cpuLeader?.id ?? chosenLeaderId;
  const cpuHp = cpuLeader?.leaderMaxHp ?? cfg.leaderHp;

  const humanIdx: PlayerId = cpuPlayer === 0 ? 1 : 0;
  const cpuIdx: PlayerId = cpuPlayer === 0 ? 0 : 1;

  const players: [PlayerState, PlayerState] = [
    { ...emptyPlayer(cfg.leaderHp), deck: shuffle([...catalogData.starterDeck]) },
    { ...emptyPlayer(cfg.leaderHp), deck: shuffle([...catalogData.starterDeck]) },
  ];
  players[humanIdx] = { ...players[humanIdx], leaderId: chosenLeaderId, leaderHp: chosenHp };
  if (cpuPlayer !== null) {
    players[cpuIdx] = { ...players[cpuIdx], leaderId: cpuLeaderId, leaderHp: cpuHp };
  } else {
    players[cpuIdx] = { ...players[cpuIdx], leaderId: chosenLeaderId, leaderHp: chosenHp };
  }

  let state: GameState = {
    catalog,
    troops: {},
    essencePool: {},
    artifacts: {},
    players,
    arenas: [],
    activePlayer: 0,
    matchPhase: "playing",
    turnPhase: "main",
    turnNumber: 1,
    winner: null,
    winReason: null,
    log: [cfg.log],
    gamePhase: cfg.gamePhase,
    arenaPool: arenasForPhase(cfg.gamePhase).map((a) => ({ ...a })),
    selectedArenaIds: [[], []],
    conquestWatch: {},
    combat: null,
    nextInstanceId: 1,
    mulliganUsed: [true, true],
    phaseWinner: 0,
    arenaSetupPicks: [],
    cpuPlayer,
    testMode,
    pendingSpell: null,
  };

  for (const p of [0, 1] as PlayerId[]) {
    const drawn = drawCards(
      state.players[p],
      cfg.handSize,
      state.troops,
      catalog,
      p,
      state.nextInstanceId,
    );
    const pl = [...state.players] as [PlayerState, PlayerState];
    pl[p] = drawn.player;
    state = { ...state, players: pl, troops: drawn.troops, nextInstanceId: drawn.nextId };
    state = addEssenceTokens(state, p, cfg.essenceCount, essenceCardId);
  }

  const arenas = buildArenasFromPickIds(state, [...cfg.arenaIds]);
  const conquestWatch: Record<string, null> = {};
  for (const a of arenas) conquestWatch[a.id] = null;

  const playersReady = [...state.players] as [PlayerState, PlayerState];
  playersReady[0] = { ...playersReady[0], sacrificedThisTurn: false };
  playersReady[1] = { ...playersReady[1], sacrificedThisTurn: false };

  return {
    ...state,
    arenas,
    conquestWatch,
    players: playersReady,
    activePlayer: 0,
    turnPhase: "main",
    matchPhase: "playing",
  };
}

export function testModeLabel(mode: TestMode): string {
  return mode === "abismo" ? "Teste Abismo" : "Teste RR";
}
