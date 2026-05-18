import {
  endCombatStrike,
  executeCombatAttack,
  getContestedArenaNames,
  startCombat,
} from "./combat";
import { setConquestWatchOnEndTurn } from "./conquest";
import {
  appendLog,
  canAfford,
  countTroopsInZone,
  exhaustEssence,
  getAvailableEssence,
  getTroopName,
  nextInstanceId,
  opponent,
  sanitizePlayerHands,
} from "./helpers";
import {
  applyPostPhaseChoice,
  finishArenaSetupAndResume,
  startNextPhaseSetup,
} from "./phase-transition";
import { drawFromDeck, finalizeArenas } from "./state";
import { runTurnBegin } from "./turn";
import { buryDeadTroops } from "./troop-cleanup";
import type { GameAction, GameState, PlayerId } from "./types";
import { MAX_TROOPS_PER_ZONE } from "./types";

function endPlayerTurn(state: GameState): GameState {
  const player = state.activePlayer;
  let next = setConquestWatchOnEndTurn(state, player);

  if (next.combat) {
    return { ...next, log: appendLog(next, "Termine o combate antes de encerrar o turno.") };
  }

  const contested = getContestedArenaNames(next, player);
  if (contested.length > 0) {
    return {
      ...next,
      log: appendLog(
        next,
        `Há tropas inimigas em: ${contested.join(", ")}. Declare combate antes de encerrar o turno.`,
      ),
    };
  }

  const nextPlayer = opponent(player);
  next = {
    ...next,
    turnNumber: next.turnNumber + 1,
    log: appendLog(next, `Fim do turno — vez do Jogador ${nextPlayer + 1}`),
  };

  return runTurnBegin(next, nextPlayer);
}

function handleMulligan(
  state: GameState,
  player: PlayerId,
  handIndices: number[],
): GameState {
  if (state.mulliganUsed[player]) {
    return { ...state, log: appendLog(state, "Mulligan já usado nesta partida.") };
  }

  const indices = [...new Set(handIndices)].sort((a, b) => b - a);
  if (indices.some((i) => i < 0 || i >= state.players[player].hand.length)) {
    return state;
  }

  const pl = { ...state.players[player] };
  const troops = { ...state.troops };
  const cardIdsToReturn: string[] = [];
  for (const i of indices) {
    const troopId = pl.hand[i];
    if (!troopId) continue;
    const t = troops[troopId];
    if (t) cardIdsToReturn.push(t.cardId);
    delete troops[troopId];
    pl.hand.splice(i, 1);
  }

  pl.deck = shuffleDeck([...pl.deck, ...cardIdsToReturn]);

  let next: GameState = {
    ...state,
    troops,
    players: [...state.players] as GameState["players"],
    mulliganUsed: [...state.mulliganUsed] as [boolean, boolean],
  };
  (next.players as GameState["players"])[player] = pl;
  next.mulliganUsed[player] = true;

  next = drawFromDeck(next, player, cardIdsToReturn.length);
  next = {
    ...next,
    log: appendLog(
      next,
      `Jogador ${player + 1} fez mulligan de ${cardIdsToReturn.length} carta(s).`,
    ),
  };

  return advanceMulliganPhase(next);
}

function shuffleDeck(deck: string[]): string[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function advanceMulliganPhase(state: GameState): GameState {
  if (state.matchPhase === "mulligan_p0") {
    return { ...state, matchPhase: "mulligan_p1", log: appendLog(state, "Mulligan do Jogador 2.") };
  }
  if (state.matchPhase === "mulligan_p1") {
    const started = {
      ...state,
      matchPhase: "playing" as const,
      log: appendLog(state, "Partida iniciada! Jogador 1 começa."),
    };
    return runTurnBegin(started, 0);
  }
  return state;
}

function playTroop(state: GameState, troopId: string): GameState {
  if (state.matchPhase !== "playing" || state.turnPhase !== "main" || state.combat) {
    return state;
  }

  const player = state.activePlayer;
  const pl = state.players[player];
  if (!pl.hand.includes(troopId)) return state;

  const troop = state.troops[troopId];
  if (!troop) return state;

  if (troop.owner !== player) {
    return {
      ...state,
      log: appendLog(state, "Esta carta não pertence ao jogador da vez."),
    };
  }

  const def = state.catalog[troop.cardId];
  if (!def) return state;

  if (!canAfford(state, player, def.cost)) {
    return {
      ...state,
      log: appendLog(
        state,
        `Essência insuficiente (precisa ${def.cost}, disponível ${getAvailableEssence(state, player).length}).`,
      ),
    };
  }

  if (countTroopsInZone(state, player, "base") >= MAX_TROOPS_PER_ZONE) {
    return { ...state, log: appendLog(state, "Base cheia (máx. 3 tropas).") };
  }

  let next = exhaustEssence(state, player, def.cost);
  const hand = next.players[player].hand.filter((id) => id !== troopId);
  const players = [...next.players] as GameState["players"];
  players[player] = { ...next.players[player], hand };

  const troops = { ...next.troops };
  troops[troopId] = {
    ...troop,
    owner: player,
    zone: "base",
    arenaId: null,
    exhausted: true,
    currentHealth: def.health,
    attack: def.attack,
  };

  next = {
    ...next,
    players,
    troops,
    log: appendLog(
      next,
      `Jogador ${player + 1} convocou ${def.name} na base (exausta). Essência exausta: ${def.cost}.`,
    ),
  };
  return sanitizePlayerHands(next);
}

function sacrificeEssence(state: GameState, troopId: string): GameState {
  if (state.turnPhase !== "main" || state.combat) return state;
  const player = state.activePlayer;
  const pl = state.players[player];
  if (pl.sacrificedThisTurn) {
    return { ...state, log: appendLog(state, "Já sacrificou essência neste turno.") };
  }

  if (!pl.hand.includes(troopId)) return state;

  const troop = state.troops[troopId];
  if (!troop) return state;

  if (troop.owner !== player) {
    return {
      ...state,
      log: appendLog(state, "Esta carta não pertence ao jogador da vez."),
    };
  }

  const def = state.catalog[troop.cardId];
  if (!def?.hasEssenceSymbol) {
    return { ...state, log: appendLog(state, "Esta carta não tem símbolo de Essência.") };
  }

  const [idNum, nextId] = nextInstanceId(state);
  const essenceId = `essence-${idNum}`;

  const hand = pl.hand.filter((hid) => hid !== troopId);
  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...pl,
    hand,
    essenceIds: [...pl.essenceIds, essenceId],
    sacrificedThisTurn: true,
  };

  const troops = { ...state.troops };
  delete troops[troopId];

  const essencePool = {
    ...state.essencePool,
    [essenceId]: {
      instanceId: essenceId,
      cardId: troop.cardId,
      owner: player,
      exhausted: false,
    },
  };

  return sanitizePlayerHands({
    ...state,
    players,
    troops,
    essencePool,
    nextInstanceId: nextId,
    log: appendLog(
      state,
      `Jogador ${player + 1} converteu ${def.name} em Essência (Espaço de Essência).`,
    ),
  });
}

function moveTroop(
  state: GameState,
  troopId: string,
  to: "base" | "arena",
  arenaId?: string,
): GameState {
  if (state.turnPhase !== "main" || state.combat) return state;

  const troop = state.troops[troopId];
  if (!troop || troop.owner !== state.activePlayer) return state;
  if (troop.exhausted || troop.pinned) {
    return { ...state, log: appendLog(state, "Tropa exausta ou presa — não pode mover.") };
  }

  const player = state.activePlayer;

  if (to === "base") {
    if (troop.zone !== "arena") return state;
    if (countTroopsInZone(state, player, "base") >= MAX_TROOPS_PER_ZONE) {
      return { ...state, log: appendLog(state, "Base cheia.") };
    }
    const troops = { ...state.troops };
    troops[troopId] = { ...troop, zone: "base", arenaId: null, exhausted: true };
    return {
      ...state,
      troops,
      log: appendLog(state, `${getTroopName(state, troop)} retornou à base.`),
    };
  }

  if (!arenaId) return state;
  const arena = state.arenas.find((a) => a.id === arenaId);
  if (!arena) return state;
  if (arena.dominatedBy !== null) {
    return {
      ...state,
      log: appendLog(
        state,
        `${arena.name} está dominada — não é possível enviar tropas para lá.`,
      ),
    };
  }
  if (troop.zone !== "base") return state;
  if (countTroopsInZone(state, player, "arena", arenaId) >= MAX_TROOPS_PER_ZONE) {
    return { ...state, log: appendLog(state, "Arena cheia.") };
  }

  const troops = { ...state.troops };
  troops[troopId] = { ...troop, zone: "arena", arenaId, exhausted: true };
  return {
    ...state,
    troops,
    log: appendLog(state, `${getTroopName(state, troop)} foi para ${arena.name}.`),
  };
}

function findArenaDef(state: GameState, arenaId: string): GameState["arenaPool"][0] | undefined {
  return state.arenaPool.find(
    (a) => a.id === arenaId && !a.neutral && a.phase === state.gamePhase,
  );
}

function selectMundoNormalArena(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  const expected = player === 0 ? "setup_arenas_p0" : "setup_arenas_p1";
  if (state.matchPhase !== expected) return state;
  if (!findArenaDef(state, arenaId)) return state;

  const selected = [...state.selectedArenaIds] as [string[], string[]];
  const list = selected[player];
  if (list.includes(arenaId)) {
    selected[player] = list.filter((id) => id !== arenaId);
  } else if (list.length < 2) {
    const taken = selected[opponent(player)];
    if (taken.includes(arenaId)) {
      return { ...state, log: appendLog(state, "Arena já escolhida pelo outro jogador.") };
    }
    selected[player] = [...list, arenaId];
  }

  let next: GameState = { ...state, selectedArenaIds: selected };

  if (selected[player].length === 2) {
    if (player === 0) {
      next = {
        ...next,
        matchPhase: "setup_arenas_p1",
        log: appendLog(next, "Jogador 2: escolha 2 arenas."),
      };
    } else {
      next = finalizeArenas(next);
    }
  }

  return next;
}

function selectAbismoWinnerArena(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  if (state.matchPhase !== "setup_abismo_winner" || state.phaseWinner !== player) {
    return state;
  }
  if (!findArenaDef(state, arenaId)) return state;

  let picks = [...state.arenaSetupPicks];
  if (picks.includes(arenaId)) {
    picks = picks.filter((id) => id !== arenaId);
  } else if (picks.length < 2) {
    picks = [...picks, arenaId];
  }

  if (picks.length === 2) {
    const loser = opponent(player);
    return {
      ...state,
      arenaSetupPicks: picks,
      matchPhase: "setup_abismo_loser",
      log: appendLog(
        state,
        `Jogador ${loser + 1} escolhe 1 arena do Abismo (restante).`,
      ),
    };
  }

  return { ...state, arenaSetupPicks: picks };
}

function selectAbismoLoserArena(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  const winner = state.phaseWinner;
  if (state.matchPhase !== "setup_abismo_loser" || winner === null) return state;
  if (player !== opponent(winner)) return state;
  if (!findArenaDef(state, arenaId)) return state;
  if (state.arenaSetupPicks.includes(arenaId)) {
    return { ...state, log: appendLog(state, "Arena já escolhida pelo vencedor.") };
  }

  const allPicks = [...state.arenaSetupPicks, arenaId];
  const ready = finishArenaSetupAndResume(state, allPicks, winner);
  return runTurnBegin(ready, winner);
}

function selectReinoReversoArena(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  if (state.matchPhase !== "setup_rr_winner" || state.phaseWinner !== player) {
    return state;
  }
  if (!findArenaDef(state, arenaId)) return state;

  const ready = finishArenaSetupAndResume(state, [arenaId], player);
  return runTurnBegin(ready, player);
}

function selectArena(state: GameState, player: PlayerId, arenaId: string): GameState {
  switch (state.matchPhase) {
    case "setup_arenas_p0":
    case "setup_arenas_p1":
      return selectMundoNormalArena(state, player, arenaId);
    case "setup_abismo_winner":
      return selectAbismoWinnerArena(state, player, arenaId);
    case "setup_abismo_loser":
      return selectAbismoLoserArena(state, player, arenaId);
    case "setup_rr_winner":
      return selectReinoReversoArena(state, player, arenaId);
    default:
      return state;
  }
}

function handlePostPhaseChoice(
  state: GameState,
  player: PlayerId,
  choice: "essence" | "corruption" | "recycle",
): GameState {
  if (state.matchPhase !== "phase_end_choice") return state;
  if (state.phaseWinner !== player) {
    return {
      ...state,
      log: appendLog(state, "Só o vencedor da fase pode escolher."),
    };
  }

  let next = applyPostPhaseChoice(state, player, choice);
  return startNextPhaseSetup(next);
}

function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SELECT_ARENA":
      return selectArena(state, action.player, action.arenaId);

    case "MULLIGAN":
      return handleMulligan(state, action.player, action.handIndices);

    case "SKIP_MULLIGAN":
      if (state.mulliganUsed[action.player]) return advanceMulliganPhase(state);
      return advanceMulliganPhase({
        ...state,
        mulliganUsed: state.mulliganUsed.map((u, i) =>
          i === action.player ? true : u,
        ) as [boolean, boolean],
        log: appendLog(state, `Jogador ${action.player + 1} manteve a mão.`),
      });

    case "PLAY_TROOP":
      return playTroop(state, action.troopId);

    case "SACRIFICE_ESSENCE":
      return sacrificeEssence(state, action.troopId);

    case "MOVE_TROOP":
      return moveTroop(state, action.troopId, action.to, action.arenaId);

    case "DECLARE_COMBAT":
      if (state.turnPhase !== "main") return state;
      return startCombat(state, action.arenaId);

    case "EXECUTE_COMBAT_ATTACK":
      if (!state.combat) return state;
      return executeCombatAttack(state, action.attackerId, action.targetId);

    case "END_COMBAT_STRIKE":
      return endCombatStrike(state);

    case "END_TURN":
      return endPlayerTurn(state);

    case "POST_PHASE_CHOICE":
      return handlePostPhaseChoice(state, action.player, action.choice);

    default:
      return state;
  }
}

export function dispatch(state: GameState, action: GameAction): GameState {
  if (state.matchPhase === "finished") return state;
  return buryDeadTroops(applyAction(state, action));
}
