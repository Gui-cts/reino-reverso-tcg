import { describe, expect, it } from "vitest";
import { executeCombatAttack } from "./combat";
import {
  arenaTroop,
  combatArena,
  inCombat,
  troopCard,
} from "./combat-test-fixtures";
import { LEADER_MAX_HP } from "./types";

const catalog = {
  a: troopCard("a", 4, 4),
  b: troopCard("b", 1, 2),
};

function rrCombat(extraArena = {}) {
  return inCombat(
    {
      p0: arenaTroop("p0", 0, "a", { attack: 4, health: 4 }),
      p1: arenaTroop("p1", 1, "b", { attack: 1, health: 2 }),
    },
    catalog,
    { subPhase: "strike", magicPassed: [true, true], strikingPlayer: 0 },
    {
      gamePhase: "reino-reverso",
      players: [
        { ...inCombat({}, catalog).players[0], leaderHp: LEADER_MAX_HP },
        { ...inCombat({}, catalog).players[1], leaderHp: LEADER_MAX_HP },
      ],
      arenas: [combatArena({ phase: "reino-reverso", ...extraArena })],
    },
  );
}

describe("Reino Reverso combat finale", () => {
  it("winner deals 1 leader damage and clears arena survivors", () => {
    const state = rrCombat();
    const after = executeCombatAttack(state, "p0", "p1");
    expect(after.combat).toBeNull();
    expect(after.turnPhase).toBe("main");
    expect(after.players[1].leaderHp).toBe(LEADER_MAX_HP - 2);
    expect(after.troops.p0).toBeUndefined();
    expect(after.log.some((l) => l.includes("Reino Reverso"))).toBe(true);
  });

  it("mutual wipe in Salão dos Lordes damages both leaders", () => {
    const state = inCombat(
      {
        p0: arenaTroop("p0", 0, "a", { attack: 2, health: 1 }),
        p1: arenaTroop("p1", 1, "b", { attack: 2, health: 1 }),
      },
      catalog,
      { subPhase: "strike", magicPassed: [true, true] },
      {
        gamePhase: "reino-reverso",
        players: [
          { ...inCombat({}, catalog).players[0], leaderHp: LEADER_MAX_HP },
          { ...inCombat({}, catalog).players[1], leaderHp: LEADER_MAX_HP },
        ],
        arenas: [
          combatArena({
            phase: "reino-reverso",
            effect: "rr-mutual-wipe-leader-damage",
            name: "Salão dos Lordes",
          }),
        ],
      },
    );
    const after = executeCombatAttack(state, "p0", "p1");
    expect(after.combat).toBeNull();
    expect(after.players[0].leaderHp).toBe(LEADER_MAX_HP - 2);
    expect(after.players[1].leaderHp).toBe(LEADER_MAX_HP - 2);
  });

  it("vacuum damages winner leader when they have no base troops", () => {
    const state = rrCombat({ effect: "rr-vacuum-2", name: "Vácuo Eterno" });
    const wiped = executeCombatAttack(state, "p0", "p1");
    expect(wiped.players[0].leaderHp).toBe(LEADER_MAX_HP - 2);
    expect(wiped.log.some((l) => l.includes("Vácuo"))).toBe(true);
  });
});
