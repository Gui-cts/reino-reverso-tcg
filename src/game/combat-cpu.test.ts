import { describe, expect, it } from "vitest";
import { pickCpuAction } from "../ui/cpu";
import {
  arenaTroop,
  inCombat,
  troopCard,
} from "./combat-test-fixtures";

const catalog = {
  grunt: troopCard("grunt", 3, 3),
  protector: troopCard("protector", 1, 4, { keywords: ["protetor"] }),
  weak: troopCard("weak", 2, 2),
};

describe("CPU combat attack selection", () => {
  it("attacks Protetor before backline troops", () => {
    const state = inCombat(
      {
        cpuAtk: arenaTroop("cpuAtk", 1, "grunt", { attack: 3, health: 3 }),
        prot: arenaTroop("prot", 0, "protector", { attack: 1, health: 4 }),
        back: arenaTroop("back", 0, "weak", { attack: 2, health: 2 }),
      },
      catalog,
      {
        subPhase: "strike",
        strikingPlayer: 1,
        declaredBy: 0,
        magicPassed: [true, true],
      },
      { cpuPlayer: 1 },
    );
    const action = pickCpuAction(state, 1);
    expect(action?.type).toBe("EXECUTE_COMBAT_ATTACK");
    if (action?.type === "EXECUTE_COMBAT_ATTACK") {
      expect(action.targetId).toBe("prot");
      expect(action.attackerId).toBe("cpuAtk");
    }
  });

  it("ends strike when all allies are attack-suppressed", () => {
    const state = inCombat(
      {
        cpuAtk: arenaTroop(
          "cpuAtk",
          1,
          "grunt",
          { attack: 3, health: 3 },
          { attackSuppressed: true },
        ),
        enemy: arenaTroop("enemy", 0, "weak", { attack: 2, health: 2 }),
      },
      catalog,
      {
        subPhase: "strike",
        strikingPlayer: 1,
        magicPassed: [true, true],
      },
      { cpuPlayer: 1 },
    );
    const action = pickCpuAction(state, 1);
    expect(action?.type).toBe("END_COMBAT_STRIKE");
  });

  it("passes combat magic when CPU has no spell to cast", () => {
    const state = inCombat(
      {
        cpu: arenaTroop("cpu", 1, "grunt", { attack: 2, health: 2 }),
        human: arenaTroop("human", 0, "weak", { attack: 2, health: 2 }),
      },
      catalog,
      { subPhase: "magic", magicPassed: [false, false] },
      { cpuPlayer: 1 },
    );
    const action = pickCpuAction(state, 1);
    expect(action?.type).toBe("PASS_COMBAT_MAGIC");
    if (action?.type === "PASS_COMBAT_MAGIC") {
      expect(action.player).toBe(1);
    }
  });
});
