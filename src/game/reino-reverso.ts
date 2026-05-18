import { appendLog, countTroopsInZone, opponent } from "./helpers";
import { applyLeaderDamage, applyLeaderDamageTo } from "./phase-transition";
import type { GameState, PlayerId } from "./types";
import { MAX_TROOPS_PER_ZONE } from "./types";

/** Tropas vivas na arena voltam para a base do dono (GDD §9). */
export function returnArenaSurvivorsToBase(state: GameState, arenaId: string): GameState {
  let troops = { ...state.troops };
  const logNames: string[] = [];

  for (const t of Object.values(troops)) {
    if (t.zone !== "arena" || t.arenaId !== arenaId || t.currentHealth <= 0) continue;
    const owner = t.owner;
    const inBase = countTroopsInZone({ ...state, troops }, owner, "base");
    if (inBase >= MAX_TROOPS_PER_ZONE) {
      troops[t.instanceId] = { ...t, zone: "discard", arenaId: null, pinned: false };
      continue;
    }
    troops[t.instanceId] = {
      ...t,
      zone: "base",
      arenaId: null,
      pinned: false,
      exhausted: true,
    };
    logNames.push(t.instanceId);
  }

  return {
    ...state,
    troops,
    log:
      logNames.length > 0
        ? appendLog(state, "Sobreviventes do combate retornaram à base.")
        : state.log,
  };
}

export function resolveReinoReversoCombatWin(
  state: GameState,
  winner: PlayerId,
  arenaId: string,
  message: string,
): GameState {
  let next = applyLeaderDamage(
    state,
    winner,
    1,
    `${message} — Jogador ${winner + 1} causa 1 de dano ao Líder inimigo.`,
  );
  if (next.matchPhase === "finished") return next;
  next = returnArenaSurvivorsToBase(next, arenaId);
  return next;
}

/** Vácuo: sem tropas na base no início do turno → 1 dano (GDD §9). */
export function applyVacuoIfNeeded(state: GameState, player: PlayerId): GameState {
  if (state.gamePhase !== "reino-reverso" || state.matchPhase !== "playing") {
    return state;
  }
  if (countTroopsInZone(state, player, "base") > 0) return state;

  return applyLeaderDamageTo(
    state,
    player,
    1,
    `Vácuo — Jogador ${player + 1} sem tropas na base: 1 de dano no próprio Líder.`,
    opponent(player),
  );
}
