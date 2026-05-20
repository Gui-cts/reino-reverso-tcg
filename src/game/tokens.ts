import { appendLog, countTroopsInZone, nextInstanceId } from "./helpers";
import type { GameState, PlayerId, TroopInstance } from "./types";
import { MAX_TROOPS_PER_ZONE } from "./types";

export function spawnTroopInArena(
  state: GameState,
  owner: PlayerId,
  arenaId: string,
  cardId: string,
  attack: number,
  health: number,
): GameState {
  if (countTroopsInZone(state, owner, "arena", arenaId) >= MAX_TROOPS_PER_ZONE) {
    return state;
  }

  const [idNum, nextId] = nextInstanceId(state);
  const instanceId = `troop-${idNum}`;
  const troop: TroopInstance = {
    instanceId,
    cardId,
    owner,
    currentHealth: health,
    attack,
    exhausted: false,
    pinned: false,
    zone: "arena",
    arenaId,
    attachedSpell: null,
    healthBonus: 0,
    movementLocked: false,
  };

  return {
    ...state,
    troops: { ...state.troops, [instanceId]: troop },
    nextInstanceId: nextId,
  };
}

export function shufflePlayerDeck(state: GameState, player: PlayerId): GameState {
  const pl = { ...state.players[player] };
  const deck = [...pl.deck];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const players = [...state.players] as GameState["players"];
  players[player] = { ...pl, deck };
  return { ...state, players };
}

export function addCardToDeck(
  state: GameState,
  player: PlayerId,
  cardId: string,
  shuffleAfter = true,
): GameState {
  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...players[player],
    deck: [...players[player].deck, cardId],
  };
  let next: GameState = {
    ...state,
    players,
    log: appendLog(state, `Carta adicionada ao baralho do Jogador ${player + 1}.`),
  };
  return shuffleAfter ? shufflePlayerDeck(next, player) : next;
}
