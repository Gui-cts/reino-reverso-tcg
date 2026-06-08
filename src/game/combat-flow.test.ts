import { describe, expect, it, vi } from "vitest";
import { resolveEncoreBeforeAttack } from "./spells";
import { dispatch } from "./actions";
import {
  endCombatStrike,
  executeCombatAttack,
  getCombatAssigningPlayer,
  isCombatMagicPhase,
  isCombatStrikePhase,
  passCombatMagic,
  startCombat,
} from "./combat";
import {
  arenaTroop,
  baseCombat,
  combatArena,
  contestedArenaSetup,
  inCombat,
  troopCard,
} from "./combat-test-fixtures";

describe("startCombat", () => {
  it("declares combat when both sides have troops", () => {
    const state = contestedArenaSetup();
    const after = startCombat(state, "arena-a");
    expect(after.turnPhase).toBe("combat");
    expect(after.combat?.arenaId).toBe("arena-a");
    expect(after.combat?.subPhase).toBe("magic");
    expect(after.combat?.strikingPlayer).toBe(0);
    expect(after.combat?.declaredBy).toBe(0);
  });

  it("rejects combat in dominated arena", () => {
    const state = contestedArenaSetup();
    state.arenas[0]!.dominatedBy = 0;
    const after = startCombat(state, "arena-a");
    expect(after.combat).toBeNull();
    expect(after.log.at(-1)).toMatch(/dominada/i);
  });

  it("rejects combat when only one side present", () => {
    let state = contestedArenaSetup();
    state = { ...state, troops: { p0: state.troops.p0! } };
    const after = startCombat(state, "arena-a");
    expect(after.combat).toBeNull();
  });

  it("applies no-magic flag on declare in Bar do João arena", () => {
    const state = contestedArenaSetup();
    state.arenas[0] = combatArena({ effect: "no-magic", name: "Bar do João" });
    const after = startCombat(state, "arena-a");
    expect(after.combat?.noMagic).toBe(true);
  });
});

describe("passCombatMagic → strike", () => {
  it("does not advance until both players pass", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 2, health: 2 }),
        p1: arenaTroop("p1", 1, "b", { attack: 2, health: 2 }),
      },
      { a: troopCard("a", 2, 2), b: troopCard("b", 2, 2) },
    );
    const p0Pass = passCombatMagic(state, 0);
    expect(isCombatMagicPhase(p0Pass)).toBe(true);
    expect(p0Pass.combat!.magicPassed[0]).toBe(true);
    expect(p0Pass.combat!.magicPassed[1]).toBe(false);

    const both = passCombatMagic(p0Pass, 1);
    expect(isCombatStrikePhase(both)).toBe(true);
    expect(both.combat!.attackedThisStrike).toEqual([]);
  });

  it("ignores duplicate pass from same player", () => {
    const state = inCombat(
      { p0: arenaTroop("p0", 0, "a", { attack: 1, health: 1 }) },
      { a: troopCard("a", 1, 1) },
      { magicPassed: [true, false] },
    );
    const again = passCombatMagic(state, 0);
    expect(again.combat!.subPhase).toBe("magic");
    expect(again.log.at(-1)).toMatch(/já passou/i);
  });
});

describe("executeCombatAttack", () => {
  it("applies simultaneous trade damage", () => {
    const state = inCombat(
      {
        atk: arenaTroop("atk", 0, "a", { attack: 3, health: 4 }),
        def: arenaTroop("def", 1, "b", { attack: 2, health: 3 }),
      },
      { a: troopCard("a", 3, 4), b: troopCard("b", 2, 3) },
      { subPhase: "strike", magicPassed: [true, true] },
    );
    const after = executeCombatAttack(state, "atk", "def");
    expect(after.troops.def?.currentHealth).toBe(0);
    expect(after.troops.atk?.currentHealth).toBe(2);
    expect(after.combat).toBeNull();
    expect(after.turnPhase).toBe("main");
  });

  it("rejects attack from non-striker troop", () => {
    const state = inCombat(
      {
        atk: arenaTroop("atk", 0, "a", { attack: 3, health: 4 }),
        def: arenaTroop("def", 1, "b", { attack: 2, health: 3 }),
      },
      { a: troopCard("a", 3, 4), b: troopCard("b", 2, 3) },
      { subPhase: "strike", strikingPlayer: 1, magicPassed: [true, true] },
    );
    const after = executeCombatAttack(state, "atk", "def");
    expect(after.troops.def?.currentHealth).toBe(3);
    expect(after.log.at(-1)).toMatch(/selecione uma de suas tropas/i);
  });

  it("rejects second attack from same troop in one strike", () => {
    let state = inCombat(
      {
        atk: arenaTroop("atk", 0, "a", { attack: 1, health: 5 }),
        def: arenaTroop("def", 1, "b", { attack: 1, health: 5 }),
      },
      { a: troopCard("a", 1, 5), b: troopCard("b", 1, 5) },
      {
        subPhase: "strike",
        magicPassed: [true, true],
        attackedThisStrike: ["atk"],
      },
    );
    const after = executeCombatAttack(state, "atk", "def");
    expect(after.log.at(-1)).toMatch(/já atacou/i);
  });

  it("Encore odd roll misses without damage", () => {
    vi.spyOn(Math, "random").mockReturnValue(2 / 6);
    const state = inCombat(
      {
        atk: arenaTroop("atk", 0, "a", { attack: 4, health: 4 }),
        def: arenaTroop("def", 1, "b", { attack: 2, health: 4 }, { attachedSpell: "encore" }),
      },
      { a: troopCard("a", 4, 4), b: troopCard("b", 2, 4) },
      { subPhase: "strike", magicPassed: [true, true] },
    );
    const after = executeCombatAttack(state, "atk", "def");
    expect(after.troops.def?.currentHealth).toBe(4);
    expect(after.log.some((l) => l.includes("erra o ataque"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("resolveEncoreBeforeAttack marks attacker as spent on odd roll", () => {
    vi.spyOn(Math, "random").mockReturnValue(2 / 6);
    const state = inCombat(
      {
        atk: arenaTroop("atk", 0, "a", { attack: 4, health: 4 }),
        def: arenaTroop("def", 1, "b", { attack: 2, health: 4 }, { attachedSpell: "encore" }),
      },
      { a: troopCard("a", 4, 4), b: troopCard("b", 2, 4) },
      { subPhase: "strike", magicPassed: [true, true] },
    );
    const result = resolveEncoreBeforeAttack(state, "atk", "def");
    expect(result.proceed).toBe(false);
    expect(result.state.combat!.attackedThisStrike).toContain("atk");
    vi.restoreAllMocks();
  });
});

describe("strike alternation and end", () => {
  it("advances to next magic window after strike ends", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 1, health: 5 }),
        p1: arenaTroop("p1", 1, "b", { attack: 1, health: 5 }),
      },
      { a: troopCard("a", 1, 5), b: troopCard("b", 1, 5) },
      {
        subPhase: "strike",
        strike: 1,
        strikingPlayer: 0,
        magicPassed: [true, true],
        attackedThisStrike: ["p0"],
      },
    );
    const after = endCombatStrike(state);
    expect(after.combat?.subPhase).toBe("magic");
    expect(after.combat?.strike).toBe(2);
    expect(after.combat?.strikingPlayer).toBe(1);
    expect(after.combat?.magicWindow).toBe(2);
  });

  it("awards win when opponent has no allies after strike", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 3, health: 3 }),
      },
      { a: troopCard("a", 3, 3) },
      {
        subPhase: "strike",
        strikingPlayer: 0,
        magicPassed: [true, true],
        attackedThisStrike: ["p0"],
      },
    );
    const after = endCombatStrike(state);
    expect(after.combat).toBeNull();
    expect(after.log.some((l) => l.includes("Jogador 1 venceu"))).toBe(true);
  });

  it("rejects END_COMBAT_STRIKE while attackable allies remain", () => {
    const state = inCombat(
      {
        p0a: arenaTroop("p0a", 0, "a", { attack: 2, health: 3 }),
        p0b: arenaTroop("p0b", 0, "c", { attack: 1, health: 2 }),
        p1: arenaTroop("p1", 1, "b", { attack: 2, health: 2 }),
      },
      {
        a: troopCard("a", 2, 3),
        b: troopCard("b", 2, 2),
        c: troopCard("c", 1, 2),
      },
      { subPhase: "strike", magicPassed: [true, true], attackedThisStrike: [] },
    );
    const after = endCombatStrike(state);
    expect(after.combat?.subPhase).toBe("strike");
    expect(after.log.at(-1)).toMatch(/ainda há tropas/i);
  });
});

describe("integration: declare → magic → attack → next round", () => {
  it("runs full round loop via dispatch", () => {
    let state = contestedArenaSetup(
      arenaTroop("p0", 0, "a", { attack: 2, health: 4 }),
      arenaTroop("p1", 1, "b", { attack: 2, health: 4 }),
    );
    state = dispatch(state, { type: "DECLARE_COMBAT", arenaId: "arena-a" });
    expect(state.combat?.subPhase).toBe("magic");

    state = dispatch(state, { type: "PASS_COMBAT_MAGIC", player: 0 });
    state = dispatch(state, { type: "PASS_COMBAT_MAGIC", player: 1 });
    expect(state.combat?.subPhase).toBe("strike");
    expect(getCombatAssigningPlayer(state.combat!)).toBe(0);

    state = dispatch(state, {
      type: "EXECUTE_COMBAT_ATTACK",
      attackerId: "p0",
      targetId: "p1",
    });
    expect(state.troops.p1?.currentHealth).toBe(2);
    expect(state.troops.p0?.currentHealth).toBe(2);
    // única tropa atacante — golpe encerra automaticamente
    expect(state.combat?.subPhase).toBe("magic");
    expect(state.combat?.strike).toBe(2);
    expect(state.combat?.strikingPlayer).toBe(1);
  });
});

describe("Sanatório arena", () => {
  it("pings all survivors after strike round when combat continues", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 1, health: 4 }),
        p1: arenaTroop("p1", 1, "b", { attack: 1, health: 4 }),
      },
      { a: troopCard("a", 1, 4), b: troopCard("b", 1, 4) },
      {
        subPhase: "strike",
        magicPassed: [true, true],
        attackedThisStrike: ["p0"],
      },
    );
    state.arenas[0] = combatArena({
      effect: "ping-after-strike",
      name: "Sanatório",
    });
    const after = endCombatStrike(state);
    expect(after.troops.p0?.currentHealth).toBe(3);
    expect(after.troops.p1?.currentHealth).toBe(3);
    expect(after.log.some((l) => l.includes("Sanatório"))).toBe(true);
    expect(after.combat?.strike).toBe(2);
  });
});
