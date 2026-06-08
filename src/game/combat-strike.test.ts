import { describe, expect, it } from "vitest";
import { endCombatStrike, hasAttackableAlliesInStrike } from "./combat";
import { defaultTroopFields } from "./spells";
import type { CombatState, TroopInstance } from "./types";
import { minimalPlayingState } from "./test-fixtures";

function troop(id: string, owner: 0 | 1, arenaId: string): TroopInstance {
  return {
    instanceId: id,
    cardId: "vigia-reverso",
    owner,
    zone: "arena",
    arenaId,
    exhausted: false,
    pinned: false,
    ...defaultTroopFields({ attack: 2, health: 3 } as never),
    attack: 2,
    currentHealth: 3,
  };
}

describe("hasAttackableAlliesInStrike", () => {
  it("returns true when striker has legal target", () => {
    const combat: CombatState = {
      arenaId: "arena-a",
      declaredBy: 0,
      strikingPlayer: 0,
      subPhase: "strike",
      strike: 1,
      magicWindow: 1,
      magicPassed: [true, true],
      attackedThisStrike: [],
    };
    const state = minimalPlayingState({
      combat,
      arenas: [
        {
          id: "arena-a",
          name: "Test",
          neutral: false,
          phase: "mundo-normal",
          effect: "none",
          conquestPointsToDominate: 2,
          dominatedBy: null,
          conquestPoints: { 0: 0, 1: 0 },
        },
      ],
      troops: {
        atk: troop("atk", 0, "arena-a"),
        def: troop("def", 1, "arena-a"),
      },
      catalog: {
        "vigia-reverso": {
          id: "vigia-reverso",
          name: "Vigia",
          cost: 2,
          attack: 1,
          health: 3,
          hasEssenceSymbol: false,
        },
      },
    });
    expect(hasAttackableAlliesInStrike(state, 0)).toBe(true);
  });

  it("returns false when all allies already attacked", () => {
    const combat: CombatState = {
      arenaId: "arena-a",
      declaredBy: 0,
      strikingPlayer: 0,
      subPhase: "strike",
      strike: 1,
      magicWindow: 1,
      magicPassed: [true, true],
      attackedThisStrike: ["atk"],
    };
    const state = minimalPlayingState({
      combat,
      arenas: [
        {
          id: "arena-a",
          name: "Test",
          neutral: false,
          phase: "mundo-normal",
          effect: "none",
          conquestPointsToDominate: 2,
          dominatedBy: null,
          conquestPoints: { 0: 0, 1: 0 },
        },
      ],
      troops: {
        atk: troop("atk", 0, "arena-a"),
        def: troop("def", 1, "arena-a"),
      },
      catalog: {
        "vigia-reverso": {
          id: "vigia-reverso",
          name: "Vigia",
          cost: 2,
          attack: 1,
          health: 3,
          hasEssenceSymbol: false,
        },
      },
    });
    expect(hasAttackableAlliesInStrike(state, 0)).toBe(false);
  });

  it("returns false when ally is attack-suppressed by Constrição", () => {
    const combat: CombatState = {
      arenaId: "arena-a",
      declaredBy: 0,
      strikingPlayer: 0,
      subPhase: "strike",
      strike: 1,
      magicWindow: 1,
      magicPassed: [true, true],
      attackedThisStrike: [],
    };
    const state = minimalPlayingState({
      combat,
      arenas: [
        {
          id: "arena-a",
          name: "Test",
          neutral: false,
          phase: "mundo-normal",
          effect: "none",
          conquestPointsToDominate: 2,
          dominatedBy: null,
          conquestPoints: { 0: 0, 1: 0 },
        },
      ],
      troops: {
        atk: { ...troop("atk", 0, "arena-a"), attackSuppressed: true },
        def: troop("def", 1, "arena-a"),
      },
      catalog: {
        "vigia-reverso": {
          id: "vigia-reverso",
          name: "Vigia",
          cost: 2,
          attack: 1,
          health: 3,
          hasEssenceSymbol: false,
        },
      },
    });
    expect(hasAttackableAlliesInStrike(state, 0)).toBe(false);
  });
});

describe("Constrição attack block", () => {
  it("clears attackSuppressed after the striker ends their strike phase", () => {
    const combat: CombatState = {
      arenaId: "arena-a",
      declaredBy: 0,
      strikingPlayer: 0,
      subPhase: "strike",
      strike: 1,
      magicWindow: 1,
      magicPassed: [true, true],
      attackedThisStrike: [],
    };
    const state = minimalPlayingState({
      turnPhase: "combat",
      combat,
      arenas: [
        {
          id: "arena-a",
          name: "Test",
          neutral: false,
          phase: "mundo-normal",
          effect: "none",
          conquestPointsToDominate: 2,
          dominatedBy: null,
          conquestPoints: { 0: 0, 1: 0 },
        },
      ],
      troops: {
        atk: { ...troop("atk", 0, "arena-a"), attackSuppressed: true },
        def: troop("def", 1, "arena-a"),
      },
      catalog: {
        "vigia-reverso": {
          id: "vigia-reverso",
          name: "Vigia",
          cost: 2,
          attack: 1,
          health: 3,
          hasEssenceSymbol: false,
        },
      },
    });

    const after = endCombatStrike(state);
    expect(after.troops.atk?.attackSuppressed).toBe(false);
    expect(after.combat?.strike).toBe(2);
    expect(after.combat?.strikingPlayer).toBe(1);
  });
});
