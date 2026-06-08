import { describe, expect, it } from "vitest";
import { canPlaySpellNow } from "./spells";
import { inCombat, troopCard } from "./combat-test-fixtures";

const fast = {
  id: "gust",
  name: "Lufada",
  cost: 2,
  attack: 0,
  health: 0,
  hasEssenceSymbol: false,
  spellEffect: "gust-wind" as const,
  cardSpeed: "fast" as const,
};

const combatSpell = {
  id: "encore",
  name: "Encore",
  cost: 2,
  attack: 0,
  health: 0,
  hasEssenceSymbol: false,
  spellEffect: "encore" as const,
  cardSpeed: "combat" as const,
};

const standard = {
  id: "draw",
  name: "Compêndio",
  cost: 3,
  attack: 0,
  health: 0,
  hasEssenceSymbol: false,
  spellEffect: "draw-two" as const,
  cardSpeed: "standard" as const,
};

describe("canPlaySpellNow during combat", () => {
  const catalog = {
    gust: fast,
    encore: combatSpell,
    draw: standard,
    a: troopCard("a", 2, 2),
  };

  it("allows combat spells only in magic window", () => {
    const magic = inCombat({}, catalog, { subPhase: "magic" });
    const strike = inCombat({}, catalog, { subPhase: "strike", magicPassed: [true, true] });
    expect(canPlaySpellNow(magic, 0, combatSpell)).toBe(true);
    expect(canPlaySpellNow(strike, 0, combatSpell)).toBe(false);
  });

  it("allows standard spells in magic window", () => {
    const magic = inCombat({}, catalog, { subPhase: "magic" });
    expect(canPlaySpellNow(magic, 0, standard)).toBe(true);
  });

  it("allows fast spells for defender during strike, not striker", () => {
    const strike = inCombat({}, catalog, {
      subPhase: "strike",
      strikingPlayer: 0,
      magicPassed: [true, true],
    });
    expect(canPlaySpellNow(strike, 0, fast)).toBe(false);
    expect(canPlaySpellNow(strike, 1, fast)).toBe(true);
  });

  it("blocks all spells in no-magic combat", () => {
    const magic = inCombat({}, catalog, { subPhase: "magic", noMagic: true });
    expect(canPlaySpellNow(magic, 0, fast)).toBe(false);
    expect(canPlaySpellNow(magic, 0, combatSpell)).toBe(false);
  });
});
