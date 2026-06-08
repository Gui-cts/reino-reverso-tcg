import { appendLog, getTroopName } from "./helpers";
import { EBONY_TOKEN_ID, IVORY_TOKEN_ID, spawnTokenInBase } from "./tokens";
import type { GameState, PlayerId } from "./types";

function tokenAliveOnField(state: GameState, player: PlayerId, cardId: string): boolean {
  return Object.values(state.troops).some(
    (t) =>
      t.owner === player &&
      t.cardId === cardId &&
      t.currentHealth > 0 &&
      (t.zone === "base" || t.zone === "arena"),
  );
}

export function activateCaptainAbility(state: GameState, troopId: string): GameState {
  if (state.matchPhase !== "playing" || state.turnPhase !== "main" || state.combat) {
    return state;
  }

  const player = state.activePlayer;
  const troop = state.troops[troopId];
  if (!troop || troop.owner !== player) return state;

  const def = state.catalog[troop.cardId];
  if (!def?.captainAbilityId) {
    return { ...state, log: appendLog(state, "Esta tropa não tem habilidade de capitã.") };
  }

  if (troop.zone !== "base") {
    return { ...state, log: appendLog(state, "Habilidade de capitã só na base.") };
  }
  if (troop.exhausted) {
    return {
      ...state,
      log: appendLog(state, `${getTroopName(state, troop)} está exausta.`),
    };
  }

  if (def.captainAbilityId === "angelica-duo") {
    const ebonyAlive = tokenAliveOnField(state, player, EBONY_TOKEN_ID);
    const ivoryAlive = tokenAliveOnField(state, player, IVORY_TOKEN_ID);

    if (ebonyAlive && ivoryAlive) {
      return {
        ...state,
        log: appendLog(
          state,
          `${getTroopName(state, troop)}: Ebony e Ivory já estão em campo.`,
        ),
      };
    }

    let next = state;
    const spawned: string[] = [];

    if (!ebonyAlive) {
      next = spawnTokenInBase(next, player, EBONY_TOKEN_ID, 2, 2, {
        exhausted: true,
      });
      spawned.push("Ebony");
    }
    if (!ivoryAlive) {
      next = spawnTokenInBase(next, player, IVORY_TOKEN_ID, 2, 2, {
        exhausted: true,
      });
      spawned.push("Ivory");
    }

    const troops = {
      ...next.troops,
      [troopId]: { ...next.troops[troopId]!, exhausted: true },
    };

    return {
      ...next,
      troops,
      log: appendLog(
        next,
        `${getTroopName(state, troop)} invocou ${spawned.join(" e ")} na base (exaustos).`,
      ),
    };
  }

  return state;
}
