import { buildCatalogMap, shuffle } from "./cards";
import type {
  ArenaDefinition,
  ArenaState,
  CardCatalog,
  GameState,
  PlayerId,
  PlayerState,
} from "./types";
import { arenasForPhase } from "./arenas";
import { applyDeckoutLoss } from "./phase-transition";
import { defaultTroopFields } from "./spells";
import {
  INITIAL_HAND_SIZE,
  LEADER_MAX_HP,
} from "./types";

export const ARENA_POOL: ArenaDefinition[] = arenasForPhase("mundo-normal");

function emptyPlayer(): PlayerState {
  return {
    leaderHp: LEADER_MAX_HP,
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

export function drawCards(
  player: PlayerState,
  count: number,
  troops: GameState["troops"],
  catalog: GameState["catalog"],
  owner: PlayerId,
  nextId: number,
): { player: PlayerState; troops: GameState["troops"]; nextId: number } {
  let deck = [...player.deck];
  let hand = [...player.hand];
  let troopsOut = { ...troops };
  let id = nextId;

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) break;
    const cardId = deck.shift()!;
    const def = catalog[cardId];
    if (!def) continue;
    const instanceId = `troop-${id++}`;
    troopsOut[instanceId] = {
      instanceId,
      cardId,
      owner,
      ...defaultTroopFields(def),
      exhausted: false,
      pinned: false,
      movementLocked: false,
      zone: "hand",
      arenaId: null,
    };
    hand.push(instanceId);
  }

  return {
    player: { ...player, deck, hand },
    troops: troopsOut,
    nextId: id,
  };
}

export type CreateGameOptions = {
  /** `null` = hotseat (2 jogadores no mesmo teclado). */
  cpuPlayer?: PlayerId | null;
  /** Líder escolhido pelo jogador humano. */
  leaderId?: string;
};

export function createInitialGame(
  catalogData: CardCatalog,
  options: CreateGameOptions = {},
): GameState {
  const cpuPlayer = options.cpuPlayer ?? null;
  const catalog = buildCatalogMap(catalogData.cards);
  const deck0 = shuffle([...catalogData.starterDeck]);
  const deck1 = shuffle([...catalogData.starterDeck]);

  const allBaseLeaders = catalogData.cards.filter(
    (c) => c.cardType === "leader" && !c.leaderFormOf,
  );
  const chosenLeaderId =
    options.leaderId ??
    allBaseLeaders[0]?.id ??
    null;
  const chosenLeader = chosenLeaderId ? catalog[chosenLeaderId] : null;
  const chosenHp = chosenLeader?.leaderMaxHp ?? LEADER_MAX_HP;

  const cpuLeader =
    allBaseLeaders.find((l) => l.id !== chosenLeaderId) ?? allBaseLeaders[0];
  const cpuLeaderId = cpuLeader?.id ?? chosenLeaderId;
  const cpuHp = cpuLeader?.leaderMaxHp ?? LEADER_MAX_HP;

  const humanIdx: PlayerId = cpuPlayer === 0 ? 1 : 0;
  const cpuIdx: PlayerId = cpuPlayer === 0 ? 0 : 1;

  const players: [PlayerState, PlayerState] = [
    { ...emptyPlayer(), deck: deck0 },
    { ...emptyPlayer(), deck: deck1 },
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
    players,
    arenas: [],
    activePlayer: 0,
    matchPhase: "setup_arenas_p0",
    turnPhase: "preparation",
    turnNumber: 1,
    winner: null,
    winReason: null,
    log: ["Escolha 2 arenas do Mundo Normal. Ruas de São Paulo (neutra) entra automaticamente."],
    gamePhase: "mundo-normal",
    arenaPool: ARENA_POOL.map((a) => ({ ...a })),
    selectedArenaIds: [[], []],
    conquestWatch: {},
    combat: null,
    nextInstanceId: 1,
    mulliganUsed: [false, false],
    phaseWinner: null,
    arenaSetupPicks: [],
    cpuPlayer,
    testMode: null,
    pendingSpell: null,
  };

  let nextId = state.nextInstanceId;
  for (const p of [0, 1] as PlayerId[]) {
    const drawn = drawCards(
      state.players[p],
      INITIAL_HAND_SIZE,
      state.troops,
      catalog,
      p,
      nextId,
    );
    const pl = [...state.players] as [PlayerState, PlayerState];
    pl[p] = drawn.player;
    nextId = drawn.nextId;
    state = { ...state, players: pl, troops: drawn.troops, nextInstanceId: nextId };
  }

  return state;
}

export function finalizeArenas(state: GameState): GameState {
  const [p0, p1] = state.selectedArenaIds;
  const neutral = state.arenaPool.find((a) => a.neutral && a.phase === state.gamePhase)!;
  const defs = [
    ...p0.map((id) => state.arenaPool.find((a) => a.id === id)!),
    neutral,
    ...p1.map((id) => state.arenaPool.find((a) => a.id === id)!),
  ];

  const arenas: ArenaState[] = defs.map((d) => ({
    id: d.id,
    name: d.name,
    neutral: d.neutral,
    phase: d.phase,
    effect: d.effect,
    conquestPointsToDominate: d.conquestPointsToDominate,
    dominatedBy: null,
    conquestPoints: { 0: 0, 1: 0 },
  }));

  const conquestWatch: Record<string, null> = {};
  for (const a of arenas) conquestWatch[a.id] = null;

  return {
    ...state,
    arenas,
    conquestWatch,
    matchPhase: "mulligan_p0",
    log: [...state.log, "Arenas definidas. Mulligan do Jogador 1."],
  };
}

export function drawFromDeck(
  state: GameState,
  player: PlayerId,
  count: number,
): GameState {
  if (state.matchPhase === "finished" || count <= 0) return state;

  if (state.players[player].deck.length < count) {
    return applyDeckoutLoss(state, player);
  }

  let next = state;
  let nextId = state.nextInstanceId;
  const pl = [...state.players] as [PlayerState, PlayerState];
  const drawn = drawCards(pl[player], count, next.troops, next.catalog, player, nextId);
  pl[player] = drawn.player;
  next = { ...next, players: pl, troops: drawn.troops, nextInstanceId: drawn.nextId };
  return next;
}
