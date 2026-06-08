import { describe, expect, it } from "vitest";
import {
  canControlPlayer,
  canSubmitAction,
} from "./permissions";
import {
  inCombat,
  spellDef,
  spellInHand,
  withPlayerEssence,
} from "./combat-test-fixtures";
import { playSpell, passSpellCounter } from "./spells";

const encore = spellDef("encore-spell", "encore", { cardSpeed: "combat", cost: 2 });
const counter = spellDef("counter", "counterspell", { cardSpeed: "fast", cost: 3 });

describe("counterspell during combat", () => {
  function magicPhaseWithEssence() {
    const ally = {
      instanceId: "ally",
      cardId: encore.id,
      owner: 0 as const,
      zone: "arena" as const,
      arenaId: "arena-a",
      attack: 2,
      currentHealth: 3,
      exhausted: false,
      pinned: false,
      movementLocked: false,
      equipmentId: null,
      attachedSpell: null,
      healthBonus: 0,
      shielded: false,
      etherealThisTurn: false,
      attackSuppressed: false,
    };
    let state = inCombat(
      { ally },
      { [encore.id]: encore, [counter.id]: counter },
      { subPhase: "magic" },
    );
    state = withPlayerEssence(state, 0, 3);
    state = withPlayerEssence(state, 1, 3);
    state = spellInHand(state, 0, "s0", encore);
    state = spellInHand(state, 1, "s1", counter);
    return state;
  }

  it("opens pending spell when cast in combat magic window", () => {
    const state = magicPhaseWithEssence();
    const after = playSpell(state, 0, "s0", "ally");
    expect(after.pendingSpell?.effect).toBe("encore");
    expect(after.pendingSpell?.counterWindowOpen).toBe(true);
    expect(after.log.some((l) => l.includes("Contramagia"))).toBe(true);
  });

  it("blocks PASS_COMBAT_MAGIC while spell is pending", () => {
    const opened = playSpell(magicPhaseWithEssence(), 0, "s0", "ally");
    expect(canControlPlayer(opened, 0)).toBe(false);
    expect(canControlPlayer(opened, 1)).toBe(false);
    expect(
      canSubmitAction(opened, 0, { type: "PASS_COMBAT_MAGIC", player: 0 }),
    ).toBe(false);
  });

  it("opponent passes counter window and spell resolves", () => {
    const opened = playSpell(magicPhaseWithEssence(), 0, "s0", "ally");
    const after = passSpellCounter(opened, 1);
    expect(after.pendingSpell).toBeNull();
    expect(after.log.at(-1)).toContain("Feitiço resolvido");
  });

  it("opponent can play Contramagia during combat", () => {
    const opened = playSpell(magicPhaseWithEssence(), 0, "s0", "ally");
    const after = playSpell(opened, 1, "s1");
    expect(after.pendingSpell?.awaitingCounterPayment).toBe(true);
    expect(after.pendingSpell?.counterWindowOpen).toBe(false);
    expect(after.log.some((l) => l.includes("Contramagia"))).toBe(true);
  });
});
