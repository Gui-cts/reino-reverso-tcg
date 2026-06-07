import { opponent } from "../game/helpers";
import type { GameState, PlayerId } from "../game/types";

export type PlayerViewMeta = {
  version: number;
  seat: PlayerId;
  handCounts: [number, number];
  deckCounts: [number, number];
  bothConnected: boolean;
  roomId: string;
};

export type PlayerViewPayload = PlayerViewMeta & {
  state: GameState;
};

/** Remove informação oculta do oponente antes de enviar ao cliente. */
export function toPlayerView(
  state: GameState,
  seat: PlayerId,
  meta: Omit<PlayerViewMeta, "state">,
): PlayerViewPayload {
  const opp = opponent(seat);
  const handCounts: [number, number] = [
    state.players[0].hand.length,
    state.players[1].hand.length,
  ];
  const deckCounts: [number, number] = [
    state.players[0].deck.length,
    state.players[1].deck.length,
  ];

  const oppHandIds = state.players[opp].hand;
  const players = structuredClone(state.players) as GameState["players"];
  players[opp] = {
    ...players[opp],
    hand: [],
    deck: [],
  };

  const troops = { ...state.troops };
  for (const id of oppHandIds) {
    delete troops[id];
  }
  for (const [id, troop] of Object.entries(troops)) {
    if (troop.owner === opp && troop.zone === "hand") {
      delete troops[id];
    }
  }

  return {
    ...meta,
    handCounts,
    deckCounts,
    state: {
      ...state,
      players,
      troops,
      cpuPlayer: null,
    },
  };
}
