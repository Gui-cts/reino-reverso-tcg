import { describe, expect, it, vi } from "vitest";
import { dispatch } from "./actions";
import { executeCombatAttack, startCombat } from "./combat";
import {
  arenaTroop,
  combatArena,
  contestedArenaSetup,
  GARGOYLE_CARD,
  inCombat,
  troopCard,
} from "./combat-test-fixtures";
import { countTroopsInZone } from "./helpers";
import { canAffordSpellCost } from "./spells";

const baseCatalog = {
  a: troopCard("a", 2, 2),
  b: troopCard("b", 2, 2),
  "token-gargula": GARGOYLE_CARD,
  spell2: {
    id: "spell2",
    name: "Feitiço",
    cost: 2,
    attack: 0,
    health: 0,
    hasEssenceSymbol: false,
    spellEffect: "encore" as const,
    cardSpeed: "combat" as const,
    cardType: "spell" as const,
  },
};

describe("arena effects on combat declare", () => {
  it("gargoyle-fill spawns tokens in empty arena slots", () => {
    const state = contestedArenaSetup();
    state.arenas[0] = combatArena({ effect: "gargoyle-fill", name: "Estação da Luz" });
    state.catalog = { ...state.catalog, "token-gargula": GARGOYLE_CARD };
    const after = startCombat(state, "arena-a");
    expect(countTroopsInZone(after, 0, "arena", "arena-a")).toBe(3);
    expect(countTroopsInZone(after, 1, "arena", "arena-a")).toBe(3);
    expect(after.log.some((l) => l.includes("Gárgulas"))).toBe(true);
  });

  it("random-buff-on-combat buffs one random troop", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = contestedArenaSetup();
    state.arenas[0] = combatArena({
      effect: "random-buff-on-combat",
      name: "Ringue",
    });
    const before = state.troops.p0!;
    const after = startCombat(state, "arena-a");
    const p0 = after.troops.p0!;
    expect(p0.attack).toBe(before.attack + 1);
    expect(p0.currentHealth).toBe(before.currentHealth + 1);
    vi.restoreAllMocks();
  });

  it("spells-cost-less flag enables cheaper spells in combat", () => {
    let state = inCombat({}, baseCatalog, { spellsCostLess: true, subPhase: "magic" });
    state = {
      ...state,
      players: [
        {
          ...state.players[0],
          essenceIds: ["e1"],
        },
        state.players[1],
      ],
      essencePool: {
        e1: { instanceId: "e1", cardId: "ess", owner: 0, exhausted: false },
      },
    };
    expect(canAffordSpellCost(state, 0, baseCatalog.spell2)).toBe(true);
    const without = { ...state, combat: { ...state.combat!, spellsCostLess: false } };
    expect(canAffordSpellCost(without, 0, baseCatalog.spell2)).toBe(false);
  });
});

describe("random-combat-target arena", () => {
  it("ignores selected target and hits random enemy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const troops = {
      atk: arenaTroop("atk", 0, "a", { attack: 5, health: 3 }),
      e1: arenaTroop("e1", 1, "b", { attack: 1, health: 5 }),
      e2: arenaTroop("e2", 1, "b", { attack: 1, health: 1 }),
    };
    const state = inCombat(troops, baseCatalog, {
      subPhase: "strike",
      magicPassed: [true, true],
    });
    state.arenas[0] = combatArena({
      effect: "random-combat-target",
      name: "Cidade das Curvas",
    });
    const after = executeCombatAttack(state, "atk", "e1");
    expect(after.troops.e2?.currentHealth).toBe(0);
    expect(after.troops.e1?.currentHealth).toBe(5);
    expect(after.log.some((l) => l.includes("aleatório"))).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("exile-on-death arena", () => {
  it("sends dead troops to exile instead of discard", () => {
    let state = inCombat(
      {
        atk: arenaTroop("atk", 0, "a", { attack: 5, health: 3 }),
        def: arenaTroop("def", 1, "b", { attack: 1, health: 2 }),
      },
      baseCatalog,
      { subPhase: "strike", magicPassed: [true, true] },
    );
    state.arenas[0] = combatArena({
      effect: "exile-on-death",
      name: "Prisão do Conglomerado",
    });
    state = dispatch(state, {
      type: "EXECUTE_COMBAT_ATTACK",
      attackerId: "atk",
      targetId: "def",
    });
    expect(state.troops.def).toBeUndefined();
    expect(state.players[1].exile).toContain("b");
    expect(state.players[1].discard).not.toContain("b");
    expect(state.log.some((l) => l.includes("exilada"))).toBe(true);
  });
});

describe("Sanatório on lethal attack", () => {
  it("pings survivors when attack would end combat", () => {
    const state = inCombat(
      {
        atk: arenaTroop("atk", 0, "a", { attack: 3, health: 4 }),
        def: arenaTroop("def", 1, "b", { attack: 1, health: 2 }),
      },
      baseCatalog,
      { subPhase: "strike", magicPassed: [true, true] },
    );
    state.arenas[0] = combatArena({
      effect: "ping-after-strike",
      name: "Sanatório",
    });
    const after = executeCombatAttack(state, "atk", "def");
    expect(after.troops.def?.currentHealth ?? 0).toBe(0);
    expect(after.troops.atk?.currentHealth).toBe(2);
    expect(after.combat).toBeNull();
    expect(after.log.some((l) => l.includes("Sanatório"))).toBe(true);
  });
});
