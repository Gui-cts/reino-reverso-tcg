import {
  appendLog,
  countTroopsInZone,
  getArena,
  getTroopName,
  opponent,
} from "./helpers";
import { applyLeaderDamage, applyLeaderDamageTo } from "./phase-transition";
import type { ArenaEffectId, GameState, PlayerId } from "./types";

/** Arenas em que o oponente está presente e você não (pressão no RR). */
export function getRRUnansweredArenaNames(state: GameState, player: PlayerId): string[] {
  if (state.gamePhase !== "reino-reverso" || state.matchPhase !== "playing") {
    return [];
  }
  const other = opponent(player);
  return state.arenas
    .filter((a) => {
      if (a.dominatedBy !== null) return false;
      const enemyPresent = countTroopsInZone(state, other, "arena", a.id) > 0;
      const selfPresent = countTroopsInZone(state, player, "arena", a.id) > 0;
      return enemyPresent && !selfPresent;
    })
    .map((a) => a.name);
}

/** Fim de turno no RR: não contestar a arena custa 1 de dano no Líder. */
export function applyRRNonResponsePenaltyAtEndTurn(
  state: GameState,
  player: PlayerId,
): GameState {
  const arenas = getRRUnansweredArenaNames(state, player);
  if (arenas.length === 0) return state;

  const pressurer = opponent(player);
  const label = arenas.join(", ");
  return applyLeaderDamageTo(
    state,
    player,
    1,
    `Reino Reverso (${label}) — Jogador ${player + 1} não respondeu na arena: 1 de dano no Líder.`,
    pressurer,
  );
}

function vacuumDamageForArena(effect: ArenaEffectId): number {
  return effect === "rr-vacuum-2" ? 2 : 1;
}

/** Destrói todas as tropas vivas na arena (sobreviventes não voltam à base). */
function destroyArenaSurvivors(state: GameState, arenaId: string): GameState {
  const arena = getArena(state, arenaId);
  const troops = { ...state.troops };
  const players = [...state.players] as GameState["players"];
  const names: string[] = [];

  for (const t of Object.values(troops)) {
    if (t.zone !== "arena" || t.arenaId !== arenaId || t.currentHealth <= 0) continue;
    const p = t.owner;
    players[p] = {
      ...players[p],
      hand: players[p].hand.filter((id) => id !== t.instanceId),
      discard: [...players[p].discard, t.cardId],
    };
    names.push(getTroopName(state, t));
    delete troops[t.instanceId];
  }

  if (names.length === 0) return { ...state, troops, players };

  return {
    ...state,
    troops,
    players,
    log: appendLog(
      state,
      names.length === 1
        ? `Reino Reverso (${arena.name}) — ${names[0]} foi destruída após o combate.`
        : `Reino Reverso (${arena.name}) — ${names.length} tropas destruídas após o combate.`,
    ),
  };
}

/** Vácuo ao fim do combate: sem tropa na base → dano no próprio Líder. */
function applyVacuoAfterCombat(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  if (countTroopsInZone(state, player, "base") > 0) return state;

  const arena = getArena(state, arenaId);
  const damage = vacuumDamageForArena(arena.effect);
  const arenaTag = arena.effect === "rr-vacuum-2" ? " — Vácuo Eterno" : "";

  return applyLeaderDamageTo(
    state,
    player,
    damage,
    `Vácuo (fim do combate)${arenaTag} — Jogador ${player + 1} sem tropas na base: ${damage} de dano no Líder.`,
    opponent(player),
  );
}

/** Salão dos Lordes: empate total na arena → 1 de dano em cada Líder. */
function applyMutualWipeLeaderDamage(state: GameState, arenaName: string): GameState {
  let next = state;
  for (const p of [0, 1] as PlayerId[]) {
    next = applyLeaderDamageTo(
      next,
      p,
      1,
      `${arenaName} — ambos os lados caíram: Jogador ${p + 1} leva 1 de dano no Líder.`,
      opponent(p),
    );
    if (next.matchPhase === "finished") return next;
  }
  return next;
}

function applyVacuoChecks(
  state: GameState,
  arenaId: string,
  winner: PlayerId | null,
): GameState {
  const arena = getArena(state, arenaId);
  let next = state;

  if (arena.effect === "rr-loser-only-vacuum") {
    const toCheck: PlayerId[] =
      winner !== null ? [opponent(winner)] : [0, 1];
    for (const p of toCheck) {
      next = applyVacuoAfterCombat(next, p, arenaId);
      if (next.matchPhase === "finished") return next;
    }
    return next;
  }

  for (const p of [0, 1] as PlayerId[]) {
    next = applyVacuoAfterCombat(next, p, arenaId);
    if (next.matchPhase === "finished") return next;
  }
  return next;
}

/**
 * Encerra combate no RR: dano ao Líder do vencedor (se houver),
 * Salão dos Lordes em empate total, destrói sobreviventes, vácuo.
 */
export function finalizeReinoReversoCombat(
  state: GameState,
  arenaId: string,
  winner: PlayerId | null,
  message: string,
): GameState {
  const arena = getArena(state, arenaId);
  let next: GameState = {
    ...state,
    combat: null,
    turnPhase: "main",
    log: appendLog(state, message),
  };

  if (winner === null && arena.effect === "rr-mutual-wipe-leader-damage") {
    next = applyMutualWipeLeaderDamage(next, arena.name);
    if (next.matchPhase === "finished") {
      return destroyArenaSurvivors(next, arenaId);
    }
  } else if (winner !== null) {
    next = applyLeaderDamage(
      next,
      winner,
      1,
      `Reino Reverso — Jogador ${winner + 1} venceu o combate e causa 1 de dano ao Líder inimigo.`,
    );
    if (next.matchPhase === "finished") {
      return destroyArenaSurvivors(next, arenaId);
    }
  }

  next = destroyArenaSurvivors(next, arenaId);
  return applyVacuoChecks(next, arenaId, winner);
}
