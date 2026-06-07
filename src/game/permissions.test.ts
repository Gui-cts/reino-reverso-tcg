import { describe, expect, it } from "vitest";
import {
  canControlPlayer,
  canRespondToPendingSpell,
  canSubmitAction,
} from "./permissions";
import { minimalPlayingState, pendingSpellFixture } from "./test-fixtures";

describe("canControlPlayer with pending spell", () => {
  it("blocks normal play while a spell is pending", () => {
    const state = minimalPlayingState({
      pendingSpell: pendingSpellFixture(1, "encore"),
    });
    expect(canControlPlayer(state, 0)).toBe(false);
    expect(canControlPlayer(state, 1)).toBe(false);
  });

  it("still allows post-phase choice even with stale pending spell", () => {
    const state = minimalPlayingState({
      matchPhase: "phase_end_choice_p0",
      phaseWinner: 0,
      pendingSpell: pendingSpellFixture(1, "encore"),
    });
    expect(canControlPlayer(state, 0)).toBe(true);
    expect(
      canSubmitAction(state, 0, {
        type: "POST_PHASE_CHOICE",
        player: 0,
        choice: "essence",
      }),
    ).toBe(true);
  });

  it("allows opponent to respond during counter window", () => {
    const state = minimalPlayingState({
      pendingSpell: pendingSpellFixture(1, "encore"),
    });
    expect(canRespondToPendingSpell(state, 0)).toBe(true);
    expect(canRespondToPendingSpell(state, 1)).toBe(false);
  });

  it("allows caster to pay counter cost", () => {
    const state = minimalPlayingState({
      pendingSpell: pendingSpellFixture(1, "encore", {
        counterWindowOpen: false,
        awaitingCounterPayment: true,
      }),
    });
    expect(canRespondToPendingSpell(state, 1)).toBe(true);
    expect(canRespondToPendingSpell(state, 0)).toBe(false);
  });
});

describe("canSubmitAction with pending spell", () => {
  it("only accepts pass or counterspell from opponent", () => {
    const state = minimalPlayingState({
      pendingSpell: pendingSpellFixture(1, "omega"),
    });
    expect(
      canSubmitAction(state, 0, { type: "PASS_SPELL_COUNTER", player: 0 }),
    ).toBe(true);
    expect(
      canSubmitAction(state, 0, { type: "END_TURN" }),
    ).toBe(false);
    expect(
      canSubmitAction(state, 0, { type: "DECLARE_COMBAT", arenaId: "x" }),
    ).toBe(false);
  });

  it("accepts resolve counter payment only from caster", () => {
    const state = minimalPlayingState({
      pendingSpell: pendingSpellFixture(1, "encore", {
        counterWindowOpen: false,
        awaitingCounterPayment: true,
      }),
    });
    expect(
      canSubmitAction(state, 1, {
        type: "RESOLVE_COUNTER_PAYMENT",
        player: 1,
        payTwoEssence: true,
      }),
    ).toBe(true);
    expect(
      canSubmitAction(state, 0, {
        type: "RESOLVE_COUNTER_PAYMENT",
        player: 0,
        payTwoEssence: false,
      }),
    ).toBe(false);
  });
});

describe("canControlPlayer without pending spell", () => {
  it("gives active player control on main phase", () => {
    const state = minimalPlayingState({ activePlayer: 0 });
    expect(canControlPlayer(state, 0)).toBe(true);
    expect(canControlPlayer(state, 1)).toBe(false);
  });
});
