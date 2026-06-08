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
      equipmentId: null,
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
  /** Cartas do baralho do jogador humano (J1 ou seat humano). CPU/oponente usa starter. */
  deckCardIds?: string[];
  /** Baralho do oponente (CPU / J2). Se omitido, usa `starterDeck`. */
  opponentDeckCardIds?: string[];
  opponentLeaderId?: string;
};

export function createInitialGame(
  catalogData: CardCatalog,
  options: CreateGameOptions = {},
): GameState {
  const cpuPlayer = options.cpuPlayer ?? null;
  const catalog = buildCatalogMap(catalogData.cards);
  const allBaseLeaders = catalogData.cards.filter(
    (c) => c.cardType === "leader" && !c.leaderFormOf,
  );
  const chosenLeaderId =
    options.leaderId ??
    allBaseLeaders[0]?.id ??
    null;

  const cpuLeader =
    allBaseLeaders.find((l) => l.id !== chosenLeaderId) ?? allBaseLeaders[0];
  const cpuLeaderId = cpuPlayer !== null ? (cpuLeader?.id ?? chosenLeaderId) : chosenLeaderId;

  const humanIdx: PlayerId = cpuPlayer === 0 ? 1 : 0;

  const p0LeaderId = chosenLeaderId;
  const p1LeaderId =
    cpuPlayer !== null
      ? cpuLeaderId
      : (allBaseLeaders.find((l) => l.id !== p0LeaderId)?.id ?? p0LeaderId);

  const allFormCards = catalogData.cards.filter((c) => c.leaderFormOf);
  const humanDeckSource = options.deckCardIds?.length
    ? options.deckCardIds
    : catalogData.starterDeck;

  function buildDeckForLeader(leaderId: string | null, sourceIds: string[]): string[] {
    const forms = allFormCards
      .filter((c) => c.leaderFormOf === leaderId)
      .map((c) => c.id);
    const base = sourceIds.filter((id) => {
      const def = catalog[id];
      return !def?.leaderFormOf;
    });
    const formsMissing = forms.filter((fid) => !base.includes(fid));
    return shuffle([...base, ...formsMissing]);
  }

  const opponentDeckSource =
    options.opponentDeckCardIds?.length
      ? options.opponentDeckCardIds
      : catalogData.starterDeck;

  function deckSourceForPlayer(player: PlayerId): string[] {
    if (cpuPlayer !== null && player === humanIdx) return humanDeckSource;
    if (cpuPlayer !== null && player !== humanIdx) return opponentDeckSource;
    if (cpuPlayer === null && player === 0) return humanDeckSource;
    return opponentDeckSource;
  }

  const resolvedCpuLeaderId = options.opponentLeaderId ?? cpuLeaderId;

  function leaderForPlayer(player: PlayerId): string | null {
    if (cpuPlayer !== null) {
      return player === humanIdx ? p0LeaderId : resolvedCpuLeaderId;
    }
    return player === 0 ? p0LeaderId : p1LeaderId;
  }

  function hpForLeader(leaderId: string | null): number {
    const def = leaderId ? catalog[leaderId] : null;
    return def?.leaderMaxHp ?? LEADER_MAX_HP;
  }

  const players: [PlayerState, PlayerState] = [
    {
      ...emptyPlayer(),
      deck: buildDeckForLeader(leaderForPlayer(0), deckSourceForPlayer(0)),
    },
    {
      ...emptyPlayer(),
      deck: buildDeckForLeader(leaderForPlayer(1), deckSourceForPlayer(1)),
    },
  ];
  for (const p of [0, 1] as PlayerId[]) {
    const lid = leaderForPlayer(p);
    players[p] = { ...players[p], leaderId: lid, leaderHp: hpForLeader(lid) };
  }

  let state: GameState = {
    catalog,
    troops: {},
    essencePool: {},
    artifacts: {},
    equipments: {},
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

/** Troca o Líder de um jogador e remonta deck/mão (ex.: J2 entrando online). */
export function reassignPlayerLeader(
  state: GameState,
  player: PlayerId,
  leaderId: string,
  starterDeck: string[],
): GameState | { error: string } {
  const leaderDef = state.catalog[leaderId];
  if (!leaderDef || leaderDef.cardType !== "leader" || leaderDef.leaderFormOf) {
    return { error: "Líder inválido." };
  }

  const opp: PlayerId = player === 0 ? 1 : 0;
  if (state.players[opp].leaderId === leaderId) {
    return { error: "Esse Líder já foi escolhido pelo oponente." };
  }

  let troops = { ...state.troops };
  const pl = state.players[player];
  for (const id of pl.hand) {
    delete troops[id];
  }

  const forms = Object.values(state.catalog)
    .filter((c) => c.leaderFormOf === leaderId)
    .map((c) => c.id);
  const baseDeck = starterDeck.filter((id) => !state.catalog[id]?.leaderFormOf);
  const deck = shuffle([...baseDeck, ...forms]);

  let nextPlayer: PlayerState = {
    ...pl,
    leaderId,
    leaderHp: leaderDef.leaderMaxHp ?? LEADER_MAX_HP,
    deck,
    hand: [],
  };

  const drawn = drawCards(
    nextPlayer,
    INITIAL_HAND_SIZE,
    troops,
    state.catalog,
    player,
    state.nextInstanceId,
  );

  const players = [...state.players] as [PlayerState, PlayerState];
  players[player] = drawn.player;

  return {
    ...state,
    players,
    troops: drawn.troops,
    nextInstanceId: drawn.nextId,
    log: [
      ...state.log,
      `Jogador ${player + 1} escolheu ${leaderDef.name} como Líder.`,
    ],
  };
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
