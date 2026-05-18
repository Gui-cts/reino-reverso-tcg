import { arenaExilesDeadTroops } from "./arena-effects";
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
  const exiledNames: string[] = [];

  for (const t of dead) {
    const p = t.owner as PlayerId;
    const pl = { ...players[p] };
    pl.hand = pl.hand.filter((id) => id !== t.instanceId);
    const name = getTroopName(state, t);
    const exiled =
      t.arenaId !== null && arenaExilesDeadTroops(state, t.arenaId);
    if (exiled) {
      pl.exile = [...pl.exile, t.cardId];
      exiledNames.push(name);
    } else {
      pl.discard = [...pl.discard, t.cardId];
      buriedNames.push(name);
    }
    players[p] = pl;
    delete troops[t.instanceId];
  }

  let next: GameState = { ...state, troops, players };
  if (buriedNames.length === 1) {
    next = {
      ...next,
      log: appendLog(next, `${buriedNames[0]} foi para o descarte.`),
    };
  } else if (buriedNames.length > 1) {
    next = {
      ...next,
      log: appendLog(next, `${buriedNames.length} tropas foram para o descarte.`),
    };
  }
  if (exiledNames.length === 1) {
    next = {
      ...next,
      log: appendLog(next, `${exiledNames[0]} foi exilada (Prisão do Conglomerado).`),
    };
  } else if (exiledNames.length > 1) {
    next = {
      ...next,
      log: appendLog(
        next,
        `${exiledNames.length} tropas foram exiladas (Prisão do Conglomerado).`,
      ),
    };
  }

  return next;
}
