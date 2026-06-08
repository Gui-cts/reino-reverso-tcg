import { describe, expect, it } from "vitest";
import { dispatch } from "./actions";
import {
  explainTroopSendToArenaBlock,
  listOpenArenasForTroop,
} from "./helpers";
import { troopEntersReadyOnDeploy } from "./keywords";
import { defaultTroopFields } from "./spells";
import { minimalPlayingState } from "./test-fixtures";
import type { ArenaState, TroopInstance } from "./types";

const MENSAGEIRO = "mensageiro-alado";

function arena(overrides: Partial<ArenaState> = {}): ArenaState {
  return {
    id: "arena-a",
    name: "Arena Teste",
    neutral: false,
    phase: "abismo",
    effect: "none",
    conquestPointsToDominate: 2,
    dominatedBy: null,
    conquestPoints: { 0: 0, 1: 0 },
    ...overrides,
  };
}

function baseTroop(
  id: string,
  cardId: string,
  owner: 0 | 1,
  extra: Partial<TroopInstance> = {},
): TroopInstance {
  return {
    instanceId: id,
    cardId,
    owner,
    zone: "base",
    arenaId: null,
    exhausted: false,
    pinned: false,
    movementLocked: false,
    currentHealth: 2,
    attack: 2,
    attachedSpell: null,
    healthBonus: 0,
    equipmentId: null,
    shielded: false,
    etherealThisTurn: false,
    attackSuppressed: false,
    ...defaultTroopFields({ attack: 2, health: 2 } as never),
    ...extra,
  };
}

describe("movimento base → arena", () => {
  it("Mensageiro Alado (Investida) entra pronto e pode ir à arena no mesmo turno", () => {
    const catalog = {
      [MENSAGEIRO]: {
        id: MENSAGEIRO,
        name: "Mensageiro Alado",
        cost: 2,
        attack: 2,
        health: 2,
        hasEssenceSymbol: true,
        keywords: ["investida" as const],
      },
    };
    expect(troopEntersReadyOnDeploy(catalog[MENSAGEIRO])).toBe(true);

    let state = minimalPlayingState({
      catalog,
      arenas: [arena()],
      players: [
        {
          ...minimalPlayingState().players[0],
          hand: ["t1"],
          essenceIds: ["e1", "e2"],
        },
        minimalPlayingState().players[1],
      ],
      essencePool: {
        e1: { instanceId: "e1", cardId: MENSAGEIRO, owner: 0, exhausted: false },
        e2: { instanceId: "e2", cardId: MENSAGEIRO, owner: 0, exhausted: false },
      },
      troops: {
        t1: {
          ...baseTroop("t1", MENSAGEIRO, 0),
          zone: "hand",
        },
      },
    });

    state = dispatch(state, { type: "PLAY_TROOP", troopId: "t1" });
    const onBase = state.troops.t1!;
    expect(onBase.zone).toBe("base");
    expect(onBase.exhausted).toBe(false);

    state = dispatch(state, {
      type: "MOVE_TROOP",
      troopId: "t1",
      to: "arena",
      arenaId: "arena-a",
    });
    expect(state.troops.t1?.zone).toBe("arena");
    expect(state.troops.t1?.arenaId).toBe("arena-a");
  });

  it("tropa exausta na base não pode mover; desvira após fim de turno", () => {
    const state0 = minimalPlayingState({
      catalog: { grunt: { id: "grunt", name: "Grunt", cost: 1, attack: 1, health: 1, hasEssenceSymbol: false } },
      arenas: [arena()],
      troops: {
        t1: baseTroop("t1", "grunt", 0, { exhausted: true }),
      },
    });
    expect(explainTroopSendToArenaBlock(state0, state0.troops.t1!)).toMatch(/exausta/i);

    const refreshed = {
      ...state0,
      troops: {
        ...state0.troops,
        t1: { ...state0.troops.t1!, exhausted: false },
      },
    };
    expect(explainTroopSendToArenaBlock(refreshed, refreshed.troops.t1!)).toBeNull();
    const moved = dispatch(refreshed, {
      type: "MOVE_TROOP",
      troopId: "t1",
      to: "arena",
      arenaId: "arena-a",
    });
    expect(moved.troops.t1?.zone).toBe("arena");
  });

  it("arena dominada não aparece como destino", () => {
    const state = minimalPlayingState({
      catalog: { grunt: { id: "grunt", name: "Grunt", cost: 1, attack: 1, health: 1, hasEssenceSymbol: false } },
      arenas: [arena({ dominatedBy: 1 })],
      troops: {
        t1: baseTroop("t1", "grunt", 0),
      },
    });
    expect(listOpenArenasForTroop(state, 0)).toHaveLength(0);
    expect(explainTroopSendToArenaBlock(state, state.troops.t1!)).toMatch(/dominada/i);
  });
});
