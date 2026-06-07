import { arenaExilesDeadTroops } from "./arena-effects";
import { appendLog, getTroopName } from "./helpers";
import { applyTroopDeathTriggers } from "./keywords";
import { isSpellCard } from "./spells";
import type { GameState, PlayerId } from "./types";

/** Remove tropas com 0 de vida no campo (base/arena) e envia a carta ao descarte do dono. */
export function buryDeadTroops(state: GameState): GameState {
  const dead = Object.values(state.troops).filter((t) => {
    if (t.zone !== "base" && t.zone !== "arena") return false;
    if (t.currentHealth > 0) return false;
    const def = state.catalog[t.cardId];
    if (isSpellCard(def)) return false;
    return true;
  });
  if (dead.length === 0) return state;

  let next = state;
  for (const t of dead) {
    next = applyTroopDeathTriggers(next, t);
    if (next.matchPhase === "finished") return next;
  }

  const troops = { ...next.troops };
  const players = [...next.players] as GameState["players"];
  let equipments = { ...next.equipments };
  const buriedNames: string[] = [];
  const exiledNames: string[] = [];

  for (const t of dead) {
    const p = t.owner as PlayerId;
    const pl = { ...players[p] };
    pl.hand = pl.hand.filter((id) => id !== t.instanceId);
    const name = getTroopName(next, t);

    if (t.equipmentId) {
      const eq = equipments[t.equipmentId];
      if (eq) {
        pl.discard = [...pl.discard, eq.cardId];
        delete equipments[t.equipmentId];
      }
    }

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

  next = { ...next, troops, players, equipments };
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
