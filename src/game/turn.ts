import { processStartPhase } from "./conquest";
import { appendLog, sanitizePlayerHands, untapEssence } from "./helpers";
import { drawFromDeck } from "./state";
import type { GameState, PlayerId } from "./types";
import { CARDS_DRAW_PER_TURN } from "./types";

function untapPlayer(state: GameState, player: PlayerId): GameState {
  const troops = { ...state.troops };
  for (const t of Object.values(troops)) {
    if (t.owner === player && (t.zone === "base" || t.zone === "arena")) {
      troops[t.instanceId] = { ...t, exhausted: false };
    }
  }
  return { ...state, troops };
}

function resetTurnFlags(state: GameState, player: PlayerId): GameState {
  const players = [...state.players] as GameState["players"];
  players[player] = { ...players[player], sacrificedThisTurn: false };
  return { ...state, players };
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
  next = resetTurnFlags(next, player);
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
