import {
  DOMINATIONS_TO_WIN_PHASE,
  LEADER_MAX_HP,
  type ArenaState,
  type GameState,
  type PlayerId,
} from "./types";
import { applyArenaOnDominate } from "./arena-effects";
import {
  appendLog,
  getArena,
  getTroopsInZone,
  opponent,
} from "./helpers";

function pinTroopsInArena(state: GameState, arenaId: string, player: PlayerId): GameState {
  const troops = { ...state.troops };
  for (const t of getTroopsInZone(state, player, "arena", arenaId)) {
    troops[t.instanceId] = { ...t, pinned: true };
  }
  return { ...state, troops };
}

function applyDomination(
  state: GameState,
  arena: ArenaState,
  player: PlayerId,
): GameState {
  const arenas = state.arenas.map((a) =>
    a.id === arena.id ? { ...a, dominatedBy: player } : a,
  );
  const opp = opponent(player);
  const players = [...state.players] as GameState["players"];
  const dmg = Math.max(0, players[opp].leaderHp - 1);
  players[opp] = { ...players[opp], leaderHp: dmg };
  players[player] = {
    ...players[player],
    dominatedArenas: players[player].dominatedArenas + 1,
  };

  let next: GameState = {
    ...state,
    arenas,
    players,
    conquestWatch: { ...state.conquestWatch, [arena.id]: null },
  };
  next = pinTroopsInArena(next, arena.id, player);
  next = applyArenaOnDominate(next, arena.id, player);

  const domCount = players[player].dominatedArenas;
  next = {
    ...next,
    log: appendLog(
      next,
      `Jogador ${player + 1} conquistou ${arena.name}! (−1 vida do líder inimigo)`,
    ),
  };

  if (dmg <= 0) {
    return {
      ...next,
      matchPhase: "finished",
      winner: player,
      winReason: "Líder inimigo derrotado",
      log: appendLog(next, `Jogador ${player + 1} venceu a partida!`),
    };
  }

  if (domCount >= DOMINATIONS_TO_WIN_PHASE) {
    return {
      ...next,
      matchPhase: "finished",
      winner: player,
      winReason: "Mundo Normal dominado (3 arenas)",
      log: appendLog(
        next,
        `Jogador ${player + 1} venceu a fase Mundo Normal!`,
      ),
    };
  }

  return next;
}

function awardConquestPoint(
  state: GameState,
  arenaId: string,
  player: PlayerId,
): GameState {
  const arena = getArena(state, arenaId);
  if (arena.dominatedBy !== null) return state;

  const cap = arena.conquestPointsToDominate;
  const points = { ...arena.conquestPoints };
  points[player] = Math.min(cap, points[player] + 1);

  let next: GameState = {
    ...state,
    arenas: state.arenas.map((a) =>
      a.id === arenaId ? { ...a, conquestPoints: points } : a,
    ),
    log: appendLog(
      state,
      `Jogador ${player + 1} +1 ponto de conquista em ${arena.name} (${points[player]}/${cap})`,
    ),
  };

  if (points[player] >= cap) {
    next = applyDomination(next, getArena(next, arenaId), player);
  }

  return next;
}

/** Fase de início: valida conquistas pendentes. */
export function processStartPhase(state: GameState): GameState {
  const player = state.activePlayer;
  let next = { ...state };

  for (const arena of state.arenas) {
    if (arena.dominatedBy !== null) continue;

    const watch = state.conquestWatch[arena.id];
    if (!watch || watch.player !== player) continue;

    const stillThere = getTroopsInZone(next, player, "arena", arena.id).length > 0;
    const contested =
      getTroopsInZone(next, opponent(player), "arena", arena.id).length > 0;
    if (!stillThere || contested) {
      next = {
        ...next,
        conquestWatch: { ...next.conquestWatch, [arena.id]: null },
      };
      continue;
    }

    next = awardConquestPoint(next, arena.id, player);
    next = { ...next, conquestWatch: { ...next.conquestWatch, [arena.id]: null } };
  }

  return next;
}

/** Ao fim do turno: marca arenas para possível conquista no próximo ciclo. */
export function setConquestWatchOnEndTurn(state: GameState, player: PlayerId): GameState {
  const watch = { ...state.conquestWatch };

  for (const arena of state.arenas) {
    if (arena.dominatedBy !== null) {
      watch[arena.id] = null;
      continue;
    }
    const hasTroop = getTroopsInZone(state, player, "arena", arena.id).length > 0;
    const contested =
      getTroopsInZone(state, opponent(player), "arena", arena.id).length > 0;
    const existing = watch[arena.id];

    if (hasTroop && !contested) {
      watch[arena.id] = { player };
    } else if (existing?.player === player) {
      watch[arena.id] = null;
    }
  }

  return { ...state, conquestWatch: watch };
}

export function validateLeaderHp(hp: number): number {
  return Math.min(LEADER_MAX_HP, Math.max(0, hp));
}
