import { describe, expect, it } from "vitest";
import { dispatch } from "./actions";
import { countBaseTroopSlotsUsed } from "./helpers";
import { applyLandingEffect } from "./keywords";
import { defaultTroopFields } from "./spells";
import { ABYSS_SERVANT_TOKEN_ID } from "./tokens";
import { minimalPlayingState } from "./test-fixtures";

describe("Klaus Summoner (abyss-summon)", () => {
  it("sacrifices ally and spawns max(atk,hp) tokens that ignore base slots", () => {
    const state = minimalPlayingState({
      activePlayer: 0,
      catalog: {
        "klaus-portador-abismo": {
          id: "klaus-portador-abismo",
          name: "Klaus Portador",
          cost: 0,
          attack: 0,
          health: 0,
          hasEssenceSymbol: false,
          leaderAbilityId: "abyss-summon",
        },
        [ABYSS_SERVANT_TOKEN_ID]: {
          id: ABYSS_SERVANT_TOKEN_ID,
          name: "Servo do Abismo",
          cost: 0,
          attack: 1,
          health: 1,
          hasEssenceSymbol: false,
          isToken: true,
        },
        victim: {
          id: "victim",
          name: "Vítima",
          cost: 3,
          attack: 2,
          health: 5,
          hasEssenceSymbol: false,
        },
      },
      players: [
        {
          ...minimalPlayingState().players[0],
          leaderId: "klaus-portador-abismo",
        },
        minimalPlayingState().players[1],
      ],
      troops: {
        victim: {
          instanceId: "victim",
          cardId: "victim",
          owner: 0,
          zone: "arena",
          arenaId: "a1",
          attack: 2,
          currentHealth: 5,
          exhausted: false,
          pinned: false,
          ...defaultTroopFields({ attack: 2, health: 5 } as never),
        },
        base1: {
          instanceId: "base1",
          cardId: "victim",
          owner: 0,
          zone: "base",
          arenaId: null,
          attack: 1,
          currentHealth: 1,
          exhausted: true,
          pinned: false,
          ...defaultTroopFields({ attack: 1, health: 1 } as never),
        },
        base2: {
          instanceId: "base2",
          cardId: "victim",
          owner: 0,
          zone: "base",
          arenaId: null,
          attack: 1,
          currentHealth: 1,
          exhausted: true,
          pinned: false,
          ...defaultTroopFields({ attack: 1, health: 1 } as never),
        },
        base3: {
          instanceId: "base3",
          cardId: "victim",
          owner: 0,
          zone: "base",
          arenaId: null,
          attack: 1,
          currentHealth: 1,
          exhausted: true,
          pinned: false,
          ...defaultTroopFields({ attack: 1, health: 1 } as never),
        },
      },
    });

    expect(countBaseTroopSlotsUsed(state, 0)).toBe(3);

    const after = dispatch(state, {
      type: "USE_LEADER_ABILITY",
      player: 0,
      targetTroopId: "victim",
    });

    expect(after.troops.victim).toBeUndefined();
    const tokens = Object.values(after.troops).filter(
      (t) => t.cardId === ABYSS_SERVANT_TOKEN_ID && t.zone === "base",
    );
    expect(tokens).toHaveLength(5);
    expect(countBaseTroopSlotsUsed(after, 0)).toBe(3);
    expect(after.players[0].leaderAbilityUsedThisTurn).toBe(true);
  });
});

describe("Susej board wipe", () => {
  it("destroys all other troops in base and arena on landing", () => {
    const susej = {
      instanceId: "susej",
      cardId: "susej-arauto",
      owner: 0,
      zone: "base" as const,
      arenaId: null,
      attack: 6,
      currentHealth: 6,
      exhausted: true,
      pinned: false,
      ...defaultTroopFields({ attack: 6, health: 6 } as never),
    };
    const state = minimalPlayingState({
      arenas: [
        {
          id: "a1",
          name: "Test",
          neutral: false,
          phase: "mundo-normal",
          effect: "none",
          conquestPointsToDominate: 2,
          dominatedBy: null,
          conquestPoints: { 0: 0, 1: 0 },
        },
      ],
      catalog: {
        victim: {
          id: "victim",
          name: "Vítima",
          cost: 1,
          attack: 1,
          health: 2,
          hasEssenceSymbol: false,
        },
        "susej-arauto": {
          id: "susej-arauto",
          name: "Susej",
          cost: 5,
          corruptionCost: 2,
          attack: 6,
          health: 6,
          hasEssenceSymbol: false,
          keywords: ["aterrisagem"],
          landingEffect: "board-wipe",
        },
      },
      troops: {
        susej,
        ally: {
          instanceId: "ally",
          cardId: "victim",
          owner: 0,
          zone: "arena",
          arenaId: "a1",
          attack: 1,
          currentHealth: 2,
          exhausted: false,
          pinned: false,
          ...defaultTroopFields({ attack: 1, health: 2 } as never),
        },
        foe: {
          instanceId: "foe",
          cardId: "victim",
          owner: 1,
          zone: "base",
          arenaId: null,
          attack: 3,
          currentHealth: 3,
          exhausted: false,
          pinned: false,
          ...defaultTroopFields({ attack: 3, health: 3 } as never),
        },
      },
    });

    const after = applyLandingEffect(state, susej);
    expect(after.troops.susej?.currentHealth).toBe(6);
    expect(after.troops.ally).toBeUndefined();
    expect(after.troops.foe).toBeUndefined();
    expect(after.players[1].discard).toContain("victim");
  });
});
