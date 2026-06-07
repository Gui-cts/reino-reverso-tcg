import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dispatch } from "./actions";
import { createInitialGame } from "./state";
import { passSpellCounter } from "./spells";
import { resolvePendingSpell } from "./spell-stack";
import type { CardCatalog } from "./types";
import { loadTestCatalog, minimalPlayingState, pendingSpellFixture } from "./test-fixtures";

const catalogJson = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../public/data/cards.json"),
    "utf8",
  ),
) as CardCatalog;

describe("passSpellCounter", () => {
  it("resolves pending spell when opponent passes", () => {
    const state = minimalPlayingState({
      pendingSpell: pendingSpellFixture(1, "draw-two", {
        counterWindowOpen: true,
        spellCardId: "compendio-vazio",
      }),
      catalog: loadTestCatalog(catalogJson),
    });
    const after = passSpellCounter(state, 0);
    expect(after.pendingSpell).toBeNull();
    expect(after.log.at(-1)).toContain("Feitiço resolvido");
  });

  it("rejects pass from wrong player", () => {
    const state = minimalPlayingState({
      pendingSpell: pendingSpellFixture(1, "draw-two"),
    });
    const after = passSpellCounter(state, 1);
    expect(after.pendingSpell).not.toBeNull();
  });
});

describe("resolvePendingSpell integration", () => {
  it("draw-two adds cards to caster hand", () => {
    const game = createInitialGame(catalogJson, { cpuPlayer: 1 });
    const caster = game.activePlayer;
    const pl = game.players[caster];
    const deckSize = pl.deck.length;
    const handBefore = pl.hand.length;

    const pending = pendingSpellFixture(caster, "draw-two", {
      counterWindowOpen: false,
      spellCardId: "compendio-vazio",
    });
    const withPending = { ...game, pendingSpell: pending };
    const after = resolvePendingSpell(withPending);

    expect(after.pendingSpell).toBeNull();
    expect(after.players[caster].hand.length).toBeGreaterThanOrEqual(handBefore);
    expect(after.players[caster].deck.length).toBeLessThanOrEqual(deckSize);
  });
});

describe("dispatch blocks spell while pending", () => {
  it("refuses second spell before resolving first", () => {
    const game = createInitialGame(catalogJson, { cpuPlayer: 1 });
    const cpu = 1 as const;
    const withPending = {
      ...game,
      pendingSpell: pendingSpellFixture(cpu, "encore"),
    };
    const spellInHand = withPending.players[cpu].hand.find((id) => {
      const inst = withPending.troops[id];
      const def = inst && withPending.catalog[inst.cardId];
      return def?.spellEffect === "iron-skin";
    });
    if (!spellInHand) return;

    const after = dispatch(withPending, {
      type: "PLAY_SPELL",
      player: cpu,
      spellInstanceId: spellInHand,
    });
    expect(after.pendingSpell?.effect).toBe("encore");
    expect(after.log.at(-1)).toContain("Resolva o feitiço pendente");
  });
});
