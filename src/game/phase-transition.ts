import { arenasForPhase } from "./arenas";
import { appendLog, nextInstanceId, opponent } from "./helpers";
import { shuffle } from "./cards";
import type { ArenaState, GameState, PlayerId, TroopInstance, WorldPhase } from "./types";
import { MAX_CORRUPTION } from "./types";

export type PhaseEndChoice = "essence" | "corruption" | "recycle";

export function dominationsToWinPhase(phase: WorldPhase): number | null {
  switch (phase) {
    case "mundo-normal":
      return 3;
    case "abismo":
      return 2;
    case "reino-reverso":
      return null;
  }
}

export function phaseDisplayName(phase: WorldPhase): string {
  switch (phase) {
    case "mundo-normal":
      return "Mundo Normal";
    case "abismo":
      return "Abismo";
    case "reino-reverso":
      return "Reino Reverso";
  }
}

export function nextWorldPhase(phase: WorldPhase): WorldPhase | null {
  switch (phase) {
    case "mundo-normal":
      return "abismo";
    case "abismo":
      return "reino-reverso";
    case "reino-reverso":
      return null;
  }
}

function troopsInAnyArena(state: GameState): TroopInstance[] {
  return Object.values(state.troops).filter(
    (t) => t.zone === "arena" && t.currentHealth > 0,
  );
}

function removeTroopFromField(
  state: GameState,
  troop: TroopInstance,
): { state: GameState; nextId: number } {
  const players = [...state.players] as GameState["players"];
  const p = troop.owner;
  players[p] = {
    ...players[p],
    hand: players[p].hand.filter((id) => id !== troop.instanceId),
  };
  const troops = { ...state.troops };
  delete troops[troop.instanceId];
  let nextId = state.nextInstanceId;
  return {
    state: { ...state, players, troops, nextInstanceId: nextId },
    nextId,
  };
}

function addEssenceFromTroop(
  state: GameState,
  troop: TroopInstance,
  nextId: number,
): { state: GameState; nextId: number } {
  const [idNum, newNext] = nextInstanceId({ ...state, nextInstanceId: nextId });
  const essenceId = `essence-${idNum}`;
  const players = [...state.players] as GameState["players"];
  const p = troop.owner;
  players[p] = {
    ...players[p],
    essenceIds: [...players[p].essenceIds, essenceId],
  };
  const essencePool = {
    ...state.essencePool,
    [essenceId]: {
      instanceId: essenceId,
      cardId: troop.cardId,
      owner: p,
      exhausted: false,
    },
  };
  return {
    state: { ...state, players, essencePool, nextInstanceId: newNext },
    nextId: newNext,
  };
}

/** Aplica escolha pós-fase (GDD §6.3) sobre tropas nas arenas. */
export function applyPostPhaseChoice(
  state: GameState,
  winner: PlayerId,
  choice: PhaseEndChoice,
): GameState {
  const arenaTroops = troopsInAnyArena(state);
  let next = state;
  let nextId = state.nextInstanceId;

  if (choice === "recycle") {
    const players = [...next.players] as GameState["players"];
    const troops = { ...next.troops };
    for (const troop of arenaTroops) {
      const p = troop.owner;
      players[p] = {
        ...players[p],
        deck: shuffle([...players[p].deck, troop.cardId]),
        hand: players[p].hand.filter((id) => id !== troop.instanceId),
      };
      delete troops[troop.instanceId];
    }
    next = {
      ...next,
      players,
      troops,
      log: appendLog(
        next,
        `Jogador ${winner + 1} reciclou ${arenaTroops.length} tropa(s) das arenas para o baralho.`,
      ),
    };
  } else if (choice === "corruption") {
    for (const troop of arenaTroops) {
      const removed = removeTroopFromField(next, troop);
      next = removed.state;
      nextId = removed.nextId;
    }
    const gain = Math.min(3, arenaTroops.length);
    const players = [...next.players] as GameState["players"];
    if (gain > 0) {
      const cur = players[winner].corruption;
      players[winner] = {
        ...players[winner],
        corruption: Math.min(MAX_CORRUPTION, cur + gain),
      };
    }
    next = {
      ...next,
      players,
      nextInstanceId: nextId,
      log: appendLog(
        next,
        `Jogador ${winner + 1} gerou +${gain} Corrupção (tropas das arenas destruídas).`,
      ),
    };
  } else {
    for (const troop of arenaTroops) {
      const removed = removeTroopFromField(next, troop);
      next = removed.state;
      nextId = removed.nextId;
      const withEssence = addEssenceFromTroop(next, troop, nextId);
      next = withEssence.state;
      nextId = withEssence.nextId;
    }
    next = {
      ...next,
      nextInstanceId: nextId,
      log: appendLog(
        next,
        `Jogador ${winner + 1} converteu ${arenaTroops.length} tropa(s) das arenas em Essência.`,
      ),
    };
  }

  return clearArenaField(next);
}

function clearArenaField(state: GameState): GameState {
  const conquestWatch: Record<string, null> = {};
  return {
    ...state,
    arenas: [],
    conquestWatch,
    players: state.players.map((pl) => ({
      ...pl,
      dominatedArenas: 0,
    })) as GameState["players"],
    combat: null,
    turnPhase: "main",
  };
}

export function beginPhaseEndChoice(
  state: GameState,
  winner: PlayerId,
  completedPhase: WorldPhase,
): GameState {
  const nextPhase = nextWorldPhase(completedPhase);
  if (!nextPhase) {
    return {
      ...state,
      matchPhase: "finished",
      winner,
      winReason: `${phaseDisplayName(completedPhase)} vencido`,
    };
  }

  return {
    ...state,
    matchPhase: "phase_end_choice",
    phaseWinner: winner,
    combat: null,
    turnPhase: "main",
    log: appendLog(
      state,
      `Jogador ${winner + 1} venceu o ${phaseDisplayName(completedPhase)}! Escolha pós-fase (Essência, Corrupção ou Reciclar).`,
    ),
  };
}

export function startNextPhaseSetup(state: GameState): GameState {
  const winner = state.phaseWinner;
  if (winner === null) return state;

  const completed = state.gamePhase;
  const nextPhase = nextWorldPhase(completed);
  if (!nextPhase) return state;

  const pool = arenasForPhase(nextPhase).map((a) => ({ ...a }));

  let matchPhase: GameState["matchPhase"];
  let logMsg: string;

  if (nextPhase === "abismo") {
    matchPhase = "setup_abismo_winner";
    logMsg = `Fase Abismo — Jogador ${winner + 1} (vencedor) escolhe 2 arenas.`;
  } else {
    matchPhase = "setup_rr_winner";
    logMsg = `Reino Reverso — Jogador ${winner + 1} escolhe a arena final.`;
  }

  return {
    ...state,
    gamePhase: nextPhase,
    arenaPool: pool,
    selectedArenaIds: [[], []],
    arenaSetupPicks: [],
    matchPhase,
    phaseWinner: winner,
    log: appendLog(state, logMsg),
  };
}

export function buildArenasFromPickIds(
  state: GameState,
  pickIds: string[],
): ArenaState[] {
  return pickIds.map((id) => {
    const d = state.arenaPool.find((a) => a.id === id)!;
    return {
      id: d.id,
      name: d.name,
      neutral: d.neutral,
      phase: d.phase,
      effect: d.effect,
      conquestPointsToDominate: d.conquestPointsToDominate,
      dominatedBy: null,
      conquestPoints: { 0: 0, 1: 0 },
    };
  });
}

export function finishArenaSetupAndResume(
  state: GameState,
  pickIds: string[],
  firstPlayer: PlayerId,
): GameState {
  const arenas = buildArenasFromPickIds(state, pickIds);
  const conquestWatch: Record<string, null> = {};
  for (const a of arenas) conquestWatch[a.id] = null;

  return {
    ...state,
    arenas,
    conquestWatch,
    arenaSetupPicks: [],
    matchPhase: "playing",
    activePlayer: firstPlayer,
    turnPhase: "main",
    log: appendLog(
      state,
      `${phaseDisplayName(state.gamePhase)} — ${arenas.map((a) => a.name).join(", ")}. Jogador ${firstPlayer + 1} começa.`,
    ),
  };
}

/** Causa dano ao Líder de `target` (quem sofre o dano). `attacker` vence se o Líder cair. */
export function applyLeaderDamageTo(
  state: GameState,
  target: PlayerId,
  damage: number,
  reason: string,
  attacker?: PlayerId,
): GameState {
  const winnerOnKo = attacker ?? opponent(target);
  const players = [...state.players] as GameState["players"];
  const hp = Math.max(0, players[target].leaderHp - damage);
  players[target] = { ...players[target], leaderHp: hp };

  let next: GameState = {
    ...state,
    players,
    log: appendLog(state, reason),
  };

  if (hp <= 0) {
    next = {
      ...next,
      matchPhase: "finished",
      winner: winnerOnKo,
      winReason: "Líder derrotado",
      log: appendLog(next, `Jogador ${winnerOnKo + 1} venceu a partida!`),
    };
  }

  return next;
}

/** Dano no Líder do oponente de `attacker`. */
export function applyLeaderDamage(
  state: GameState,
  attacker: PlayerId,
  damage: number,
  reason: string,
): GameState {
  return applyLeaderDamageTo(state, opponent(attacker), damage, reason, attacker);
}
