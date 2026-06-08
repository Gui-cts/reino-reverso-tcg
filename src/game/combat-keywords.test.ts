import { describe, expect, it } from "vitest";
import { applyStrikeDamage } from "./combat-damage";
import { executeCombatAttack } from "./combat";
import { canTargetSpell } from "./spells";
import {
  arenaTroop,
  combatArena,
  inCombat,
  troopCard,
} from "./combat-test-fixtures";
import {
  getLegalCombatTargets,
  isLegalCombatTarget,
} from "./keywords";

const catalog = {
  grunt: troopCard("grunt", 2, 3),
  protector: troopCard("protector", 1, 4, { keywords: ["protetor"] }),
  cleaver: troopCard("cleaver", 4, 3, { keywords: ["fatiar"] }),
  squishy: troopCard("squishy", 1, 1),
  tank: troopCard("tank", 1, 5),
};

describe("Protetor targeting", () => {
  const troops = {
    atk: arenaTroop("atk", 0, "grunt", { attack: 3, health: 3 }),
    prot: arenaTroop("prot", 1, "protector", { attack: 1, health: 4 }),
    back: arenaTroop("back", 1, "grunt", { attack: 2, health: 2 }),
  };

  it("forces attacks on protector first", () => {
    const state = inCombat(troops, catalog, { subPhase: "strike", magicPassed: [true, true] });
    const legal = getLegalCombatTargets(state, 0, "arena-a");
    expect(legal.map((t) => t.instanceId)).toEqual(["prot"]);
    expect(isLegalCombatTarget(state, 0, "arena-a", troops.back)).toBe(false);
    expect(isLegalCombatTarget(state, 0, "arena-a", troops.prot)).toBe(true);
  });

  it("rejects illegal target in executeCombatAttack", () => {
    const state = inCombat(troops, catalog, { subPhase: "strike", magicPassed: [true, true] });
    const after = executeCombatAttack(state, "atk", "back");
    expect(after.troops.back?.currentHealth).toBe(2);
    expect(after.log.at(-1)).toMatch(/Protetor/i);
  });

  it("treats hasEmpathy as protector", () => {
    const empathyTroops = {
      ...troops,
      prot: arenaTroop("prot", 1, "grunt", { attack: 1, health: 3 }, { hasEmpathy: true }),
    };
    const state = inCombat(empathyTroops, catalog, {
      subPhase: "strike",
      magicPassed: [true, true],
    });
    expect(getLegalCombatTargets(state, 0, "arena-a").map((t) => t.instanceId)).toEqual(["prot"]);
  });
});

describe("Ethereal", () => {
  it("excludes ethereal troops from legal targets", () => {
    const troops = {
      atk: arenaTroop("atk", 0, "grunt", { attack: 2, health: 3 }),
      ghost: arenaTroop("ghost", 1, "grunt", { attack: 2, health: 2 }, { etherealThisTurn: true }),
    };
    const state = inCombat(troops, catalog, { subPhase: "strike", magicPassed: [true, true] });
    expect(getLegalCombatTargets(state, 0, "arena-a")).toHaveLength(0);
    expect(executeCombatAttack(state, "atk", "ghost").troops.ghost?.currentHealth).toBe(2);
  });
});

describe("Shield", () => {
  it("absorbs strike damage once", () => {
    const troops = {
      atk: arenaTroop("atk", 0, "grunt", { attack: 4, health: 4 }),
      def: arenaTroop("def", 1, "grunt", { attack: 2, health: 3 }, { shielded: true }),
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
    expect(strike.troops.def?.currentHealth).toBe(3);
    expect(strike.troops.def?.shielded).toBe(false);
    expect(strike.logLine).toMatch(/escudo absorveu/i);
  });

  it("absorbs counter damage on attacker shield", () => {
    const troops = {
      atk: arenaTroop("atk", 0, "grunt", { attack: 4, health: 4 }, { shielded: true }),
      def: arenaTroop("def", 1, "grunt", { attack: 3, health: 5 }),
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
    expect(strike.troops.atk?.currentHealth).toBe(4);
    expect(strike.troops.atk?.shielded).toBe(false);
    expect(strike.logLine).toMatch(/Revida: escudo/i);
  });
});

describe("Fatiar cleave", () => {
  it("chains excess damage to lowest-HP legal enemy", () => {
    const troops = {
      atk: arenaTroop("atk", 0, "cleaver", { attack: 4, health: 3 }),
      first: arenaTroop("first", 1, "squishy", { attack: 1, health: 1 }),
      second: arenaTroop("second", 1, "tank", { attack: 1, health: 5 }),
    };
    const state = inCombat(troops, catalog, { subPhase: "strike", magicPassed: [true, true] });
    const strike = applyStrikeDamage(
      state,
      troops.atk,
      "arena-a",
      0,
      "first",
      "Arena",
      false,
    );
    expect(strike.troops.first?.currentHealth).toBe(0);
    expect(strike.troops.second?.currentHealth).toBe(2);
    expect(strike.logLine).toMatch(/Fatiar/i);
  });
});

describe("no-magic arena spell targeting", () => {
  it("blocks targeting troops in no-magic arena", () => {
    const spell = {
      id: "encore-spell",
      name: "Encore",
      cost: 2,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      spellEffect: "encore" as const,
      cardSpeed: "fast" as const,
    };
    const troops = {
      t: arenaTroop("t", 1, "grunt", { attack: 2, health: 2 }),
    };
    const state = inCombat(
      troops,
      { ...catalog, "encore-spell": spell },
      { noMagic: true, subPhase: "magic" },
    );
    state.arenas[0] = combatArena({ effect: "no-magic" });
    expect(canTargetSpell(state, 0, spell, troops.t)).toBe(false);
  });
});
