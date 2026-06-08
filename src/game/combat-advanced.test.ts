import { describe, expect, it, vi } from "vitest";
import { applyStrikeDamage } from "./combat-damage";
import { passCombatMagic } from "./combat";
import {
  arenaTroop,
  inCombat,
  troopCard,
} from "./combat-test-fixtures";

const catalog = {
  frost: troopCard("frost", 2, 4),
  enemy: troopCard("enemy", 2, 3),
};

describe("auto-advance strike", () => {
  it("skips strike phase when all allies are attack-suppressed", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "frost", { attack: 2, health: 4 }, { attackSuppressed: true }),
        p1: arenaTroop("p1", 1, "enemy", { attack: 2, health: 3 }),
      },
      catalog,
      { subPhase: "magic", magicPassed: [true, false] },
    );
    const after = passCombatMagic(state, 1);
    expect(after.combat?.subPhase).toBe("magic");
    expect(after.combat?.strike).toBe(2);
    expect(after.log.some((l) => l.includes("concluiu os ataques"))).toBe(true);
  });
});

describe("Frostborn Congelar", () => {
  it("even d6 freezes target after a hit", () => {
    vi.spyOn(Math, "random").mockReturnValue(5 / 6);
    const troops = {
      atk: arenaTroop("atk", 0, "frost", { attack: 2, health: 4 }, { isFrostborn: true }),
      def: arenaTroop("def", 1, "enemy", { attack: 1, health: 4 }),
    };
    const state = inCombat(troops, catalog, { subPhase: "strike", magicPassed: [true, true] });
    const strike = applyStrikeDamage(
      state,
      troops.atk,
      "arena-a",
      0,
      "def",
      "Arena",
      false,
    );
    expect(strike.troops.def?.attackSuppressed).toBe(true);
    expect(strike.state.log.some((l) => l.includes("Congelar"))).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("Vampirismo (Noah inverno)", () => {
  it("heals Frostborn attacker from damage dealt", () => {
    const troops = {
      atk: arenaTroop("atk", 0, "frost", { attack: 3, health: 2 }, { isFrostborn: true }),
      def: arenaTroop("def", 1, "enemy", { attack: 1, health: 3 }),
    };
    const state = inCombat(troops, catalog, {
      subPhase: "strike",
      magicPassed: [true, true],
    });
    state.players[0] = {
      ...state.players[0],
      leaderId: "noah-vampiro-inverno",
    };
    state.catalog["noah-vampiro-inverno"] = {
      id: "noah-vampiro-inverno",
      name: "Noah",
      cost: 0,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
    };
    const strike = applyStrikeDamage(
      state,
      troops.atk,
      "arena-a",
      0,
      "def",
      "Arena",
      false,
    );
    expect(strike.troops.atk?.currentHealth).toBeGreaterThan(2);
    expect(strike.state.log.some((l) => l.includes("Vampirismo"))).toBe(true);
  });
});
