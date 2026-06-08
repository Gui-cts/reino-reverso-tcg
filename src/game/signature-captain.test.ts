import { describe, expect, it } from "vitest";
import {
  activateCaptainAbility,
  describeCaptainAbilityForCard,
} from "./captain-abilities";
import { describeArtifactEffectForCard } from "./equipment";
import { formatCardTypeLine, normalizeCardDefinition } from "./card-meta";
import { validateDeck } from "./deck-rules";
import { applyLandingEffect, describeLandingEffectForCard } from "./keywords";
import { defaultTroopFields } from "./spells";
import { EBONY_TOKEN_ID, IVORY_TOKEN_ID } from "./tokens";
import { minimalPlayingState } from "./test-fixtures";

const catalog = {
  "noah-lider-base": {
    id: "noah-lider-base",
    name: "Noah",
    cost: 0,
    attack: 0,
    health: 0,
    hasEssenceSymbol: false,
    cardType: "leader" as const,
  },
  "klaus-violinista": {
    id: "klaus-violinista",
    name: "Klaus",
    cost: 0,
    attack: 0,
    health: 0,
    hasEssenceSymbol: false,
    cardType: "leader" as const,
  },
  "sarah-determinacao": {
    id: "sarah-determinacao",
    name: "Sarah",
    cost: 4,
    attack: 4,
    health: 4,
    hasEssenceSymbol: false,
    cardType: "troop" as const,
    cardRole: "captain" as const,
    requiredLeaderId: "noah-lider-base",
    keywords: ["aterrisagem" as const],
    landingEffect: "tutor-signature-equipment" as const,
    landingTutorCardId: "equip-canino-fogo-gelo",
  },
  "equip-canino-fogo-gelo": {
    id: "equip-canino-fogo-gelo",
    name: "Canino",
    cost: 3,
    attack: 2,
    health: 2,
    hasEssenceSymbol: false,
    cardType: "equipment" as const,
    cardRole: "signature" as const,
    requiredLeaderId: "noah-lider-base",
    equipmentTrait: "vacuum-resist" as const,
  },
  "monteiro-violino": {
    id: "monteiro-violino",
    name: "Monteiro — O violino",
    cost: 2,
    attack: 0,
    health: 0,
    hasEssenceSymbol: false,
    cardType: "artifact" as const,
    cardRole: "signature" as const,
    requiredLeaderId: "klaus-violinista",
    artifactEffect: "free-spell" as const,
  },
  "angelica-capita": {
    id: "angelica-capita",
    name: "Angelica",
    cost: 4,
    attack: 2,
    health: 2,
    hasEssenceSymbol: true,
    cardType: "troop" as const,
    cardRole: "captain" as const,
    requiredLeaderId: "klaus-violinista",
    captainAbilityId: "angelica-duo" as const,
  },
  [EBONY_TOKEN_ID]: {
    id: EBONY_TOKEN_ID,
    name: "Ebony",
    cost: 0,
    attack: 2,
    health: 2,
    hasEssenceSymbol: false,
    isToken: true,
    cardType: "troop" as const,
  },
  [IVORY_TOKEN_ID]: {
    id: IVORY_TOKEN_ID,
    name: "Ivory",
    cost: 0,
    attack: 2,
    health: 2,
    hasEssenceSymbol: false,
    isToken: true,
    cardType: "troop" as const,
  },
};

describe("capitãs e assinaturas", () => {
  it("Canino exibe Equipamento — Assinatura · Noah após normalização", () => {
    const raw = catalog["equip-canino-fogo-gelo"]!;
    const canino = normalizeCardDefinition(raw);
    expect(canino.cardRole).toBe("signature");
    expect(formatCardTypeLine(canino)).toBe("Equipamento — Assinatura · Noah");
  });

  it("Monteiro exibe Artefato — Assinatura · Klaus", () => {
    const monteiro = normalizeCardDefinition(catalog["monteiro-violino"]!);
    expect(monteiro.cardRole).toBe("signature");
    expect(formatCardTypeLine(monteiro)).toBe("Artefato — Assinatura · Klaus");
    expect(describeArtifactEffectForCard(monteiro)).toContain("Klaus");
    expect(describeArtifactEffectForCard(monteiro)).toContain("máx. 1");
  });

  it("Angelica exibe Capitã · Klaus e habilidade Ebony & Ivory", () => {
    const angelica = normalizeCardDefinition(catalog["angelica-capita"]!);
    expect(angelica.cardRole).toBe("captain");
    expect(formatCardTypeLine(angelica)).toBe("Tropa — Capitã · Klaus");
    expect(describeCaptainAbilityForCard(angelica)).toContain("Ebony");
    expect(describeCaptainAbilityForCard(angelica)).toContain("máx. 1");
  });

  it("Sarah exibe tipo Capitã e texto da aterrisagem específica", () => {
    const sarah = catalog["sarah-determinacao"]!;
    expect(formatCardTypeLine(sarah)).toBe("Tropa — Capitã · Noah");
    expect(describeLandingEffectForCard({
      ...sarah,
      landingEffectText: "Busca O canino de fogo e gelo no baralho e coloca na mão.",
    })).toContain("canino");
  });

  it("valida máx. 1 cópia e vínculo ao líder", () => {
    const filler = Array.from({ length: 39 }, () => "filler");
    const bad = validateDeck(
      {
        leaderId: "klaus-violinista",
        cardIds: ["angelica-capita", "angelica-capita", ...filler],
      },
      { ...catalog, filler: { id: "filler", name: "F", cost: 1, attack: 1, health: 1, hasEssenceSymbol: false, cardType: "troop" } },
    );
    expect(bad.valid).toBe(false);

    const wrongLeader = validateDeck(
      { leaderId: "noah-lider-base", cardIds: ["angelica-capita", ...filler] },
      { ...catalog, filler: { id: "filler", name: "F", cost: 1, attack: 1, health: 1, hasEssenceSymbol: false, cardType: "troop" } },
    );
    expect(wrongLeader.valid).toBe(false);
  });

  it("Sarah busca Canino no deck ao entrar", () => {
    let state = minimalPlayingState({
      catalog,
      players: [
        {
          ...minimalPlayingState().players[0],
          deck: ["equip-canino-fogo-gelo", "filler"],
          hand: [],
        },
        minimalPlayingState().players[1],
      ],
      troops: {
        sarah: {
          instanceId: "sarah",
          cardId: "sarah-determinacao",
          owner: 0,
          zone: "base",
          arenaId: null,
          exhausted: false,
          pinned: false,
          movementLocked: false,
          equipmentId: null,
          currentHealth: 4,
          attack: 4,
          attachedSpell: null,
          healthBonus: 0,
          ...defaultTroopFields({ attack: 4, health: 4 } as never),
        },
      },
    });
    state = applyLandingEffect(state, state.troops.sarah!);
    const handCard = state.players[0].hand.find((id) => state.troops[id]?.cardId === "equip-canino-fogo-gelo");
    expect(handCard).toBeTruthy();
    expect(state.players[0].deck).not.toContain("equip-canino-fogo-gelo");
  });

  it("Angelica invoca Ebony e Ivory exaustos na base", () => {
    const state = minimalPlayingState({
      catalog,
      activePlayer: 0,
      troops: {
        angelica: {
          instanceId: "angelica",
          cardId: "angelica-capita",
          owner: 0,
          zone: "base",
          arenaId: null,
          exhausted: false,
          pinned: false,
          movementLocked: false,
          equipmentId: null,
          currentHealth: 2,
          attack: 2,
          attachedSpell: null,
          healthBonus: 0,
          ...defaultTroopFields({ attack: 2, health: 2 } as never),
        },
      },
    });
    const next = activateCaptainAbility(state, "angelica");
    expect(next.troops.angelica?.exhausted).toBe(true);
    const tokens = Object.values(next.troops).filter(
      (t) => t.cardId === EBONY_TOKEN_ID || t.cardId === IVORY_TOKEN_ID,
    );
    expect(tokens).toHaveLength(2);
    expect(tokens.every((t) => t.zone === "base" && t.exhausted)).toBe(true);
  });
});
