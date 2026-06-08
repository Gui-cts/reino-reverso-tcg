import { describe, expect, it } from "vitest";
import {
  canControlPlayer,
  canRespondToPendingSpell,
  canSubmitAction,
  playerCanReactDuringStrike,
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

describe("playerCanReactDuringStrike", () => {
  it("does not block CPU when human has abyss-summon and allies in arena", () => {
    const state = minimalPlayingState({
      turnPhase: "combat",
      combat: {
        arenaId: "arena-a",
        declaredBy: 0,
        strikingPlayer: 1,
        subPhase: "strike",
        strike: 2,
        magicWindow: 2,
        magicPassed: [true, true],
        attackedThisStrike: [],
      },
      arenas: [
        {
          id: "arena-a",
          name: "Trono Negro",
          neutral: false,
          phase: "reino-reverso",
          effect: "rr-loser-only-vacuum",
          conquestPointsToDominate: 99,
          dominatedBy: null,
          conquestPoints: { 0: 0, 1: 0 },
        },
      ],
      catalog: {
        "klaus-portador-abismo": {
          id: "klaus-portador-abismo",
          name: "Klaus",
          cost: 0,
          attack: 0,
          health: 0,
          hasEssenceSymbol: false,
          leaderAbilityId: "abyss-summon",
        },
      },
      players: [
        {
          ...minimalPlayingState().players[0],
          leaderId: "klaus-portador-abismo",
        },
        minimalPlayingState().players[1],
      ],
      troops: {
        ally: {
          instanceId: "ally",
          cardId: "x",
          owner: 0,
          zone: "arena",
          arenaId: "arena-a",
          attack: 3,
          currentHealth: 4,
          exhausted: false,
          pinned: false,
          movementLocked: false,
          equipmentId: null,
          attachedSpell: null,
          healthBonus: 0,
        },
      },
    });
    expect(playerCanReactDuringStrike(state, 0)).toBe(false);
  });
});

describe("canControlPlayer without pending spell", () => {
  it("gives active player control on main phase", () => {
    const state = minimalPlayingState({ activePlayer: 0 });
    expect(canControlPlayer(state, 0)).toBe(true);
    expect(canControlPlayer(state, 1)).toBe(false);
  });
});
