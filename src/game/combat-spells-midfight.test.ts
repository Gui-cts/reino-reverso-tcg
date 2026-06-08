import { describe, expect, it, vi } from "vitest";
import { dispatch } from "./actions";
import { executeCombatAttack } from "./combat";
import {
  arenaTroop,
  inCombat,
  spellDef,
  troopCard,
} from "./combat-test-fixtures";
import { applySpellEffect } from "./spell-stack";

const catalog = {
  a: troopCard("a", 3, 3),
  b: troopCard("b", 2, 2),
  omega: spellDef("omega", "omega", { cost: 4, corruptionCost: 1 }),
  gust: spellDef("gust", "gust-wind", { cardSpeed: "fast" }),
  cauldron: spellDef("cauldron", "blood-cauldron", { cardSpeed: "combat" }),
  constri: spellDef("constri", "constriction"),
  eth: spellDef("eth", "ethereal"),
};

describe("combat spells ending fight", () => {
  it("Omega destroys last enemy and ends combat", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 1, health: 3 }),
        p1: arenaTroop("p1", 1, "b", { attack: 1, health: 2 }),
      },
      catalog,
      { subPhase: "magic", magicPassed: [false, false] },
    );
    const after = applySpellEffect(state, 0, "omega", "p1", "Omega");
    expect(after.combat).toBeNull();
    expect(after.turnPhase).toBe("main");
    expect(after.troops.p1?.currentHealth).toBe(0);
  });

  it("Lufada sends troop to hand when owner base is full", () => {
    const baseTroop = arenaTroop("b1", 1, "b", { attack: 1, health: 2 });
    baseTroop.zone = "base";
    baseTroop.arenaId = null;
    const baseTroop2 = arenaTroop("b2", 1, "b", { attack: 1, health: 2 });
    baseTroop2.zone = "base";
    baseTroop2.arenaId = null;
    const baseTroop3 = arenaTroop("b3", 1, "b", { attack: 1, health: 2 });
    baseTroop3.zone = "base";
    baseTroop3.arenaId = null;
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 1, health: 3 }),
        p1: arenaTroop("p1", 1, "b", { attack: 1, health: 2 }),
        b1: baseTroop,
        b2: baseTroop2,
        b3: baseTroop3,
      },
      catalog,
      { subPhase: "strike", magicPassed: [true, true] },
    );
    const after = applySpellEffect(state, 0, "gust-wind", "p1", "Lufada");
    expect(after.troops.p1?.zone).toBe("hand");
    expect(after.players[1].hand).toContain("p1");
    expect(after.log.some((l) => l.includes("voltou à mão"))).toBe(true);
    expect(after.combat).toBeNull();
  });

  it("Lufada removes last enemy from arena and ends combat", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 1, health: 3 }),
        p1: arenaTroop("p1", 1, "b", { attack: 1, health: 2 }),
      },
      catalog,
      { subPhase: "strike", magicPassed: [true, true] },
    );
    const after = applySpellEffect(state, 0, "gust-wind", "p1", "Lufada");
    expect(after.combat).toBeNull();
    expect(after.troops.p1?.zone).toBe("base");
    expect(after.troops.p1?.exhausted).toBe(true);
  });

  it("Caldeirão even roll kills last enemy and ends combat", () => {
    vi.spyOn(Math, "random").mockReturnValue(5 / 6);
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 1, health: 3 }),
        p1: arenaTroop("p1", 1, "b", { attack: 1, health: 2 }),
      },
      catalog,
      { subPhase: "magic" },
    );
    const after = applySpellEffect(state, 0, "blood-cauldron", "p1", "Caldeirão");
    expect(after.combat).toBeNull();
    expect(after.troops.p1?.currentHealth).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("combat spells without ending fight", () => {
  it("Constrição pins enemy during combat", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 2, health: 3 }),
        p1: arenaTroop("p1", 1, "b", { attack: 2, health: 3 }),
      },
      catalog,
      { subPhase: "magic" },
    );
    const after = applySpellEffect(state, 0, "constriction", "p1", "Constrição");
    expect(after.combat).not.toBeNull();
    expect(after.troops.p1?.movementLocked).toBe(true);
    expect(after.troops.p1?.attackSuppressed).toBe(true);
  });

  it("Eterealidade makes ally untargetable", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 2, health: 3 }),
        p1: arenaTroop("p1", 1, "b", { attack: 2, health: 3 }),
      },
      catalog,
      { subPhase: "magic" },
    );
    const after = applySpellEffect(state, 0, "ethereal", "p0", "Eterealidade");
    expect(after.troops.p0?.etherealThisTurn).toBe(true);
    const strike = executeCombatAttack(
      { ...after, combat: { ...after.combat!, subPhase: "strike", magicPassed: [true, true] } },
      "p1",
      "p0",
    );
    expect(strike.troops.p0?.currentHealth).toBe(3);
  });
});

describe("Omega via dispatch buries dead troop", () => {
  it("removes dead instance after lethal combat attack", () => {
    let state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 5, health: 3 }),
        p1: arenaTroop("p1", 1, "b", { attack: 1, health: 1 }),
      },
      catalog,
      { subPhase: "strike", magicPassed: [true, true] },
    );
    state = dispatch(state, {
      type: "EXECUTE_COMBAT_ATTACK",
      attackerId: "p0",
      targetId: "p1",
    });
    expect(state.troops.p1).toBeUndefined();
    expect(state.combat).toBeNull();
  });
});
