import { processStartPhase } from "./conquest";
import { clearMovementLocksForPlayer } from "./keywords";
import { appendLog, opponent, sanitizePlayerHands, untapEssence } from "./helpers";
import { drawFromDeck } from "./state";
import type { GameState, PlayerId } from "./types";
import { CARDS_DRAW_PER_TURN } from "./types";

function untapPlayer(state: GameState, player: PlayerId): GameState {
  const troops = { ...state.troops };
  for (const t of Object.values(troops)) {
    if (t.owner === player && (t.zone === "base" || t.zone === "arena")) {
      troops[t.instanceId] = {
        ...t,
        exhausted: false,
        etherealThisTurn: false,
      };
    }
  }
  return { ...state, troops };
}

function clearAttackSuppressionForPlayer(state: GameState, player: PlayerId): GameState {
  const troops = { ...state.troops };
  for (const t of Object.values(troops)) {
    if (t.owner === player && t.attackSuppressed) {
      troops[t.instanceId] = { ...t, attackSuppressed: false };
    }
  }
  return { ...state, troops };
}

function untapArtifacts(state: GameState, player: PlayerId): GameState {
  const artifacts = { ...state.artifacts };
  let changed = false;
  for (const a of Object.values(artifacts)) {
    if (a.owner === player && a.exhausted) {
      artifacts[a.instanceId] = { ...a, exhausted: false };
      changed = true;
    }
  }
  return changed ? { ...state, artifacts } : state;
}

function resetTurnFlags(state: GameState, player: PlayerId): GameState {
  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...players[player],
    sacrificedThisTurn: false,
    leaderAbilityUsedThisTurn: false,
    leaderExhausted: false,
  };
  return { ...state, players };
}

function clearTemporaryEssence(state: GameState, player: PlayerId): GameState {
  const pl = state.players[player];
  const tempIds = pl.essenceIds.filter((id) => {
    const e = state.essencePool[id];
    return e?.spellOnly;
  });
  if (tempIds.length === 0) return state;

  const essencePool = { ...state.essencePool };
  for (const id of tempIds) delete essencePool[id];

  const tempSet = new Set(tempIds);
  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...players[player],
    essenceIds: pl.essenceIds.filter((id) => !tempSet.has(id)),
  };
  return { ...state, players, essencePool };
}

/** Preparação → Compra → Início → Jogo (main). */
export function runTurnBegin(state: GameState, player: PlayerId): GameState {
  let next: GameState = {
    ...state,
    activePlayer: player,
    turnPhase: "preparation",
  };

  next = untapPlayer(next, player);
  next = untapEssence(next, player);
  next = untapArtifacts(next, player);
  next = clearMovementLocksForPlayer(next, player);
  next = clearAttackSuppressionForPlayer(next, player);
  next = resetTurnFlags(next, player);
  next = clearTemporaryEssence(next, opponent(player));
  next = {
    ...next,
    log: appendLog(next, `Jogador ${player + 1} — fase de preparação (desvirar).`),
  };

  next = { ...next, turnPhase: "draw" };
  if (next.players[player].deck.length >= CARDS_DRAW_PER_TURN) {
    next = drawFromDeck(next, player, CARDS_DRAW_PER_TURN);
    if (next.matchPhase === "finished") return next;
    next = {
      ...next,
      log: appendLog(
        next,
        `Jogador ${player + 1} — fase de compra (+${CARDS_DRAW_PER_TURN} carta).`,
      ),
    };
  } else {
    next = drawFromDeck(next, player, CARDS_DRAW_PER_TURN);
    if (next.matchPhase === "finished") return next;
  }

  next = { ...next, turnPhase: "start" };
  next = processStartPhase(next);
  if (next.matchPhase === "finished") return next;
  next = sanitizePlayerHands(next);

  return { ...next, turnPhase: "main" };
}

/** Corrige turnPhase preso em "combat" após o combate encerrar. */
export function repairStaleTurnPhase(state: GameState): GameState {
  if (state.matchPhase === "playing" && !state.combat && state.turnPhase === "combat") {
    return { ...state, turnPhase: "main" };
  }
  return state;
}
