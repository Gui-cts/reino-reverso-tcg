import { describe, expect, it } from "vitest";
import {
  COUNTERSPELL_MIN_THREAT,
  scorePendingSpellThreat,
  shouldCpuCounterSpell,
} from "../ui/cpu-pending-spell";
import { defaultTroopFields } from "./spells";
import { minimalPlayingState, pendingSpellFixture } from "./test-fixtures";

describe("scorePendingSpellThreat", () => {
  it("rates omega higher than draw-two", () => {
    const base = minimalPlayingState();
    const omega = scorePendingSpellThreat(
      base,
      pendingSpellFixture(1, "omega"),
    );
    const draw = scorePendingSpellThreat(
      base,
      pendingSpellFixture(1, "draw-two"),
    );
    expect(omega).toBeGreaterThan(draw);
    expect(draw).toBeLessThan(COUNTERSPELL_MIN_THREAT);
  });

  it("boosts blood-cauldron on low-health targets", () => {
    const state = minimalPlayingState({
      troops: {
        low: {
          instanceId: "low",
          cardId: "x",
          owner: 0,
          zone: "arena",
          arenaId: "a",
          exhausted: false,
          pinned: false,
          ...defaultTroopFields({ attack: 1, health: 3 } as never),
          attack: 1,
          currentHealth: 1,
        },
      },
    });
    const threat = scorePendingSpellThreat(
      state,
      pendingSpellFixture(1, "blood-cauldron", { targetTroopId: "low" }),
    );
    expect(shouldCpuCounterSpell(state, pendingSpellFixture(1, "blood-cauldron", { targetTroopId: "low" }))).toBe(
      true,
    );
    expect(threat).toBeGreaterThanOrEqual(COUNTERSPELL_MIN_THREAT);
  });
});
