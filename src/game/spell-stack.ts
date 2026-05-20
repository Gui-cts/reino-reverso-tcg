import { checkCombatEndAfterDamage } from "./combat";
import { drawFromDeck } from "./state";
import {
  appendLog,
  canPayEssenceCost,
  countTroopsInZone,
  getTroopName,
  nextInstanceId,
  opponent,
  payEssenceCost,
  sanitizePlayerHands,
} from "./helpers";
import { defaultTroopFields, isSpellCard, isTroopCard, rollD6 } from "./spells";
import type {
  CardDefinition,
  GameState,
  PendingSpellState,
  PlayerId,
  SpellEffectId,
  TroopInstance,
} from "./types";
import { MAX_TROOPS_PER_ZONE } from "./types";

export function spellRequiresTarget(effect: SpellEffectId): boolean {
  switch (effect) {
    case "draw-two":
    case "troop-tutor":
    case "spell-tutor":
    case "counterspell":
      return false;
    default:
      return true;
  }
}

export function troopIsUntargetable(
  troop: TroopInstance,
  _options?: { allowAreaSpell?: boolean },
): boolean {
  return Boolean(troop.etherealThisTurn);
}

function tutorFromDeck(
  state: GameState,
  player: PlayerId,
  match: (def: CardDefinition) => boolean,
  notFoundMsg: string,
): GameState {
  const pl = state.players[player];
  const idx = pl.deck.findIndex((id) => {
    const def = state.catalog[id];
    return def && match(def);
  });
  if (idx === -1) {
    return { ...state, log: appendLog(state, notFoundMsg) };
  }

  const cardId = pl.deck[idx]!;
  const def = state.catalog[cardId]!;
  const deck = [...pl.deck];
  deck.splice(idx, 1);

  const [idNum, nextId] = nextInstanceId(state);
  const instanceId = `troop-${idNum}`;
  const troops = {
    ...state.troops,
    [instanceId]: {
      instanceId,
      cardId,
      owner: player,
      ...defaultTroopFields(def),
      exhausted: false,
      pinned: false,
      movementLocked: false,
      zone: "hand" as const,
      arenaId: null,
    },
  };

  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...pl,
    deck,
    hand: [...pl.hand, instanceId],
  };

  return {
    ...state,
    players,
    troops,
    nextInstanceId: nextId,
    log: appendLog(state, `${def.name} foi revelada e colocada na mão do Jogador ${player + 1}.`),
  };
}

export function applySpellEffect(
  state: GameState,
  caster: PlayerId,
  effect: SpellEffectId,
  targetTroopId: string | null,
  spellName: string,
): GameState {
  const arenaId = state.combat?.arenaId ?? null;

  switch (effect) {
    case "draw-two": {
      let next = drawFromDeck(state, caster, 2);
      return {
        ...next,
        log: appendLog(next, `${spellName}: Jogador ${caster + 1} compra 2 cartas.`),
      };
    }
    case "troop-tutor":
      return tutorFromDeck(
        state,
        caster,
        (d) => isTroopCard(d) && !d.isToken,
        `${spellName}: nenhuma tropa encontrada no deck.`,
      );
    case "spell-tutor":
      return tutorFromDeck(
        state,
        caster,
        (d) => isSpellCard(d),
        `${spellName}: nenhum feitiço encontrado no deck.`,
      );
    case "constriction": {
      if (!targetTroopId) return state;
      const target = state.troops[targetTroopId];
      if (!target || target.owner === caster) return state;
      const troops = {
        ...state.troops,
        [targetTroopId]: {
          ...target,
          pinned: true,
          attackSuppressed: true,
        },
      };
      return {
        ...state,
        troops,
        log: appendLog(
          state,
          `${spellName}: ${getTroopName(state, target)} presa — não ataca no próximo combate do dono.`,
        ),
      };
    }
    case "ethereal": {
      if (!targetTroopId) return state;
      const target = state.troops[targetTroopId];
      if (!target || target.owner !== caster) return state;
      const troops = {
        ...state.troops,
        [targetTroopId]: { ...target, etherealThisTurn: true },
      };
      return {
        ...state,
        troops,
        log: appendLog(
          state,
          `${spellName}: ${getTroopName(state, target)} não pode ser alvo de ataques nem feitiços pontuais neste turno.`,
        ),
      };
    }
    case "omega": {
      if (!targetTroopId) return state;
      const target = state.troops[targetTroopId];
      if (!target || target.owner === caster) return state;
      if (target.zone !== "base" && target.zone !== "arena") return state;
      const troops = { ...state.troops };
      delete troops[targetTroopId];
      const owner = target.owner;
      const players = [...state.players] as GameState["players"];
      players[owner] = {
        ...players[owner],
        discard: [...players[owner].discard, target.cardId],
      };
      let next: GameState = {
        ...state,
        players,
        troops,
        log: appendLog(
          state,
          `${spellName}: ${getTroopName(state, target)} foi destruída instantaneamente.`,
        ),
      };
      next = sanitizePlayerHands(next);
      if (arenaId && next.combat) {
        return checkCombatEndAfterDamage(next, arenaId, "Combate encerrado após Omega.");
      }
      return next;
    }
    case "encore":
    case "iron-skin":
    case "blood-cauldron":
    case "gust-wind": {
      if (!targetTroopId) return state;
      const target = state.troops[targetTroopId];
      if (!target) return state;
      const troops = { ...state.troops };

      if (effect === "blood-cauldron") {
        const roll = rollD6();
        const even = roll % 2 === 0;
        let logMsg = `${spellName} em ${getTroopName(state, target)} — 1d6: ${roll}. `;
        if (even) {
          const hp = Math.max(0, target.currentHealth - 2);
          troops[targetTroopId] = { ...target, currentHealth: hp };
          logMsg += "Par — 2 de dano!";
        } else {
          logMsg += "Ímpar — sem dano.";
        }
        let next: GameState = { ...state, troops, log: appendLog(state, logMsg) };
        next = sanitizePlayerHands(next);
        if (arenaId && next.combat) {
          return checkCombatEndAfterDamage(next, arenaId, "Combate encerrado após magia");
        }
        return next;
      }

      if (effect === "iron-skin") {
        troops[targetTroopId] = {
          ...target,
          healthBonus: target.healthBonus + 2,
          currentHealth: target.currentHealth + 2,
          attachedSpell: "iron-skin",
        };
        return sanitizePlayerHands({
          ...state,
          troops,
          log: appendLog(
            state,
            `${spellName} em ${getTroopName(state, target)} — +2 de vida permanente.`,
          ),
        });
      }

      if (effect === "encore") {
        troops[targetTroopId] = { ...target, attachedSpell: "encore" };
        return sanitizePlayerHands({
          ...state,
          troops,
          log: appendLog(
            state,
            `${spellName} em ${getTroopName(state, target)} — ataques podem errar (1d6 ímpar).`,
          ),
        });
      }

      if (effect === "gust-wind") {
        if (countTroopsInZone(state, target.owner, "base") >= MAX_TROOPS_PER_ZONE) {
          return { ...state, log: appendLog(state, "Base do alvo cheia — Lufada falhou.") };
        }
        troops[targetTroopId] = {
          ...target,
          zone: "base",
          arenaId: null,
          exhausted: true,
        };
        let next: GameState = {
          ...state,
          troops,
          log: appendLog(
            state,
            `${spellName} — ${getTroopName(state, target)} voltou à base (exausta).`,
          ),
        };
        next = sanitizePlayerHands(next);
        if (arenaId && next.combat) {
          return checkCombatEndAfterDamage(next, arenaId, "Combate encerrado após magia");
        }
        return next;
      }
      return state;
    }
    default:
      return state;
  }
}

export function openPendingSpell(
  state: GameState,
  pending: PendingSpellState,
  logMsg: string,
): GameState {
  return {
    ...state,
    pendingSpell: pending,
    log: appendLog(state, logMsg),
  };
}

export function resolvePendingSpell(state: GameState): GameState {
  const pending = state.pendingSpell;
  if (!pending) return state;

  const name = state.catalog[pending.spellCardId]?.name ?? pending.spellCardId;
  const next = applySpellEffect(
    state,
    pending.caster,
    pending.effect,
    pending.targetTroopId,
    name,
  );
  return {
    ...next,
    pendingSpell: null,
    log: appendLog(next, `${name} resolve.`),
  };
}

export function cancelPendingSpell(state: GameState, reason: string): GameState {
  const pending = state.pendingSpell;
  if (!pending) return state;
  const name = state.catalog[pending.spellCardId]?.name ?? "Feitiço";
  return {
    ...state,
    pendingSpell: null,
    log: appendLog(state, `${name} foi anulado. ${reason}`),
  };
}

export function canRespondWithCounter(
  state: GameState,
  player: PlayerId,
  spellDef: CardDefinition,
): boolean {
  if (spellDef.spellEffect !== "counterspell") return false;
  const pending = state.pendingSpell;
  if (!pending?.counterWindowOpen) return false;
  return player === opponent(pending.caster);
}

export function tryPayCounterCost(state: GameState, caster: PlayerId): GameState {
  const payment = { exhaust: 2 };
  if (!canPayEssenceCost(state, caster, payment)) {
    return cancelPendingSpell(
      state,
      `Jogador ${caster + 1} não pagou 2 essências — efeito cancelado.`,
    );
  }
  const paid = payEssenceCost(state, caster, payment);
  if (!paid.ok) {
    return cancelPendingSpell(state, "Falha ao pagar essências.");
  }
  const next = resolvePendingSpell({
    ...paid.state,
    pendingSpell: state.pendingSpell,
  });
  return {
    ...next,
    log: appendLog(
      next,
      `Jogador ${caster + 1} exaurtiu 2 essências — o feitiço resolve.`,
    ),
  };
}
