import { arenasForPhase } from "./arenas";
import { appendLog, nextInstanceId, opponent } from "./helpers";
import { shuffle } from "./cards";
import type { ArenaState, GameState, PlayerId, TroopInstance, WorldPhase } from "./types";
import { maxCorruptionForPhase } from "./types";

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

function troopsInArenaForPlayer(state: GameState, player: PlayerId): TroopInstance[] {
  return Object.values(state.troops).filter(
    (t) => t.zone === "arena" && t.currentHealth > 0 && t.owner === player,
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

/** Aplica escolha pós-fase só nas tropas **desse jogador** nas arenas. */
export function applyPostPhaseChoiceForPlayer(
  state: GameState,
  player: PlayerId,
  choice: PhaseEndChoice,
): GameState {
  const arenaTroops = troopsInArenaForPlayer(state, player);
  let next = state;
  let nextId = state.nextInstanceId;

  if (choice === "recycle") {
    const players = [...next.players] as GameState["players"];
    const troops = { ...next.troops };
    for (const troop of arenaTroops) {
      players[player] = {
        ...players[player],
        deck: shuffle([...players[player].deck, troop.cardId]),
        hand: players[player].hand.filter((id) => id !== troop.instanceId),
      };
      delete troops[troop.instanceId];
    }
    next = {
      ...next,
      players,
      troops,
      log: appendLog(
        next,
        `Jogador ${player + 1} reciclou ${arenaTroops.length} tropa(s) suas nas arenas.`,
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
      const cur = players[player].corruption;
      const cap = maxCorruptionForPhase(next.gamePhase);
      players[player] = {
        ...players[player],
        corruption: Math.min(cap, cur + gain),
      };
    }
    next = {
      ...next,
      players,
      nextInstanceId: nextId,
      log: appendLog(
        next,
        `Jogador ${player + 1} escolheu Corrupção (+${gain}).`,
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
        `Jogador ${player + 1} converteu ${arenaTroops.length} tropa(s) suas em Essência.`,
      ),
    };
  }

  return next;
}

/** Após as duas escolhas: limpa campo e abre setup da próxima fase. */
export function finalizePhaseTransition(state: GameState): GameState {
  return startNextPhaseSetup(clearArenaField(state));
}

function clearArenaField(state: GameState): GameState {
  const conquestWatch: Record<string, null> = {};
  const troops = { ...state.troops };
  const players = [...state.players] as GameState["players"];
  for (const t of Object.values(troops)) {
    if (t.zone !== "arena") continue;
    const p = t.owner;
    players[p] = {
      ...players[p],
      hand: players[p].hand.filter((id) => id !== t.instanceId),
      discard: [...players[p].discard, t.cardId],
    };
    delete troops[t.instanceId];
  }
  return {
    ...state,
    arenas: [],
    conquestWatch,
    troops,
    players: players.map((pl) => ({
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
    matchPhase: "phase_end_choice_p0",
    phaseWinner: winner,
    combat: null,
    turnPhase: "main",
    log: appendLog(
      state,
      `Jogador ${winner + 1} venceu o ${phaseDisplayName(completedPhase)}! Cada jogador escolhe o destino das **próprias** tropas nas arenas.`,
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

/** Deck esgotado ao tentar comprar — derrota automática. */
export function applyDeckoutLoss(state: GameState, player: PlayerId): GameState {
  if (state.matchPhase === "finished") return state;
  const winner = opponent(player);
  return {
    ...state,
    matchPhase: "finished",
    winner,
    winReason: "Deck esgotado",
    log: appendLog(
      state,
      `Jogador ${player + 1} não pôde comprar (deck vazio) — Jogador ${winner + 1} vence!`,
    ),
  };
}
