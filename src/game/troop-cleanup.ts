import { appendLog, getTroopName } from "./helpers";
import type { GameState, PlayerId } from "./types";

/** Remove tropas com 0 de vida e envia a carta ao descarte do dono. */
export function buryDeadTroops(state: GameState): GameState {
  const dead = Object.values(state.troops).filter(
    (t) => t.currentHealth <= 0 && t.zone !== "discard",
  );
  if (dead.length === 0) return state;

  const troops = { ...state.troops };
  const players = [...state.players] as GameState["players"];
  const buriedNames: string[] = [];

  for (const t of dead) {
    const p = t.owner as PlayerId;
    const pl = { ...players[p] };
    pl.hand = pl.hand.filter((id) => id !== t.instanceId);
    pl.discard = [...pl.discard, t.cardId];
    players[p] = pl;
    buriedNames.push(getTroopName(state, t));
    delete troops[t.instanceId];
  }

  let next: GameState = { ...state, troops, players };
  if (buriedNames.length === 1) {
    next = {
      ...next,
      log: appendLog(next, `${buriedNames[0]} foi para o descarte.`),
    };
  } else {
    next = {
      ...next,
      log: appendLog(next, `${buriedNames.length} tropas foram para o descarte.`),
    };
  }

  return next;
}
