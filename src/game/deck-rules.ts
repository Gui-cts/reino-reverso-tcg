import {
  isCaptainCard,
  isDeckableCard,
  isLeaderCard,
  isLeaderExclusiveCard,
  isSignatureCard,
  normalizeCardDefinition,
} from "./card-meta";
import type { CardCatalog, CardDefinition, DeckDefinition } from "./types";

export type DeckValidationError = {
  code: string;
  message: string;
};

export type DeckValidationResult = {
  valid: boolean;
  errors: DeckValidationError[];
};

const DEFAULT_MIN_DECK_SIZE = 40;
const DEFAULT_MAX_COPIES = 4;
const EXCLUSIVE_MAX_COPIES = 1;

function catalogMap(cards: CardDefinition[]): Record<string, CardDefinition> {
  return Object.fromEntries(cards.map((c) => [c.id, normalizeCardDefinition(c)]));
}

/**
 * Valida um baralho para o deckbuilder / partida.
 * Mínimo de {@link DEFAULT_MIN_DECK_SIZE} cartas, sem máximo.
 * `leaderId` deve ser a carta de Líder escolhida (fora do baralho jogável).
 */
export function validateDeck(
  deck: DeckDefinition,
  catalog: Record<string, CardDefinition>,
  options?: { minDeckSize?: number; maxCopies?: number },
): DeckValidationResult {
  const errors: DeckValidationError[] = [];
  const minDeckSize = options?.minDeckSize ?? DEFAULT_MIN_DECK_SIZE;
  const maxCopies = options?.maxCopies ?? DEFAULT_MAX_COPIES;
  const counts = new Map<string, number>();

  if (deck.leaderId) {
    const leader = catalog[deck.leaderId];
    if (!leader) {
      errors.push({
        code: "leader_missing",
        message: `Líder "${deck.leaderId}" não existe no catálogo.`,
      });
    } else if (!isLeaderCard(leader)) {
      errors.push({
        code: "leader_invalid_type",
        message: `"${leader.name}" não é uma carta de Líder.`,
      });
    }
  }

  for (const id of deck.cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  if (deck.cardIds.length < minDeckSize) {
    errors.push({
      code: "deck_size",
      message: `O baralho precisa de no mínimo ${minDeckSize} cartas (atual: ${deck.cardIds.length}).`,
    });
  }

  for (const [id, count] of counts) {
    const def = catalog[id];
    if (!def) {
      errors.push({ code: "unknown_card", message: `Carta desconhecida: ${id}.` });
      continue;
    }

    if (!isDeckableCard(def)) {
      errors.push({
        code: "not_deckable",
        message: `"${def.name}" não pode ir no baralho (${def.cardType ?? "tipo inválido"}).`,
      });
    }

    if (isLeaderCard(def)) {
      errors.push({
        code: "leader_in_deck",
        message: `O Líder "${def.name}" fica fora do baralho — use leaderId.`,
      });
    }

    const limit = isLeaderExclusiveCard(def) ? EXCLUSIVE_MAX_COPIES : maxCopies;
    if (count > limit) {
      const roleLabel = isSignatureCard(def) ? "assinatura" : isCaptainCard(def) ? "capitã" : "cópias";
      errors.push({
        code: isLeaderExclusiveCard(def) ? "exclusive_copies" : "max_copies",
        message: `"${def.name}": máximo ${limit} (${roleLabel}) — tem ${count}.`,
      });
    }

    if (isLeaderExclusiveCard(def)) {
      if (!deck.leaderId) {
        errors.push({
          code: "exclusive_no_leader",
          message: `"${def.name}" exige um Líder no deck.`,
        });
      } else if (def.requiredLeaderId && def.requiredLeaderId !== deck.leaderId) {
        errors.push({
          code: "exclusive_wrong_leader",
          message: `"${def.name}" é exclusiva do Líder "${def.requiredLeaderId}".`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateStarterDeck(catalogData: CardCatalog): DeckValidationResult {
  const catalog = catalogMap(catalogData.cards);
  const map = catalog;
  const errors: DeckValidationError[] = [];

  const presets = catalogData.presetDecks ?? [];
  if (presets.length > 0) {
    for (const preset of presets) {
      const cardIds =
        preset.cardIds?.length
          ? preset.cardIds
          : catalogData.starterDeck.filter((id) => !map[id]?.leaderFormOf);
      const result = validateDeck({ leaderId: preset.leaderId, cardIds }, catalog);
      errors.push(...result.errors);
    }
    return { valid: errors.length === 0, errors };
  }

  return validateDeck({ leaderId: null, cardIds: catalogData.starterDeck }, catalog);
}
