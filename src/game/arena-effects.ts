import { drawFromDeck } from "./state";
import { addCardToDeck, spawnTroopInArena } from "./tokens";
import { appendLog, countTroopsInZone, getArena, getTroopName, getTroopsInZone } from "./helpers";
import type { GameState, PlayerId } from "./types";
import { maxCorruptionForPhase, MAX_TROOPS_PER_ZONE } from "./types";

const GARGOYLE_CARD = "token-gargula";
const SUSEJ_CARD = "susej-arauto";

function livingInArena(state: GameState, arenaId: string) {
  return [...getTroopsInZone(state, 0, "arena", arenaId), ...getTroopsInZone(state, 1, "arena", arenaId)];
}

function applyDamageToTroop(
  troops: GameState["troops"],
  troopId: string,
  damage: number,
): GameState["troops"] {
  const t = troops[troopId];
  if (!t) return troops;
  return {
    ...troops,
    [troopId]: { ...t, currentHealth: Math.max(0, t.currentHealth - damage) },
  };
}

/** Preenche slots vazios com Gárgulas 1/1 (Estação da Luz). */
function fillGargoyles(state: GameState, arenaId: string): GameState {
  let next = state;
  for (const player of [0, 1] as PlayerId[]) {
    let slots = MAX_TROOPS_PER_ZONE - countTroopsInZone(next, player, "arena", arenaId);
    while (slots > 0) {
      const before = countTroopsInZone(next, player, "arena", arenaId);
      next = spawnTroopInArena(next, player, arenaId, GARGOYLE_CARD, 1, 1, { entersReady: true });
      if (countTroopsInZone(next, player, "arena", arenaId) === before) break;
      slots--;
    }
  }
  return {
    ...next,
    log: appendLog(next, "Estação da Luz — Gárgulas 1/1 preencheram os espaços vazios."),
  };
}

/** Ringue: uma tropa aleatória na arena ganha +1/+1 permanente. */
function ringueRandomBuff(state: GameState, arenaId: string): GameState {
  const troops = livingInArena(state, arenaId);
  if (troops.length === 0) return state;
  const pick = troops[Math.floor(Math.random() * troops.length)]!;
  const troopsMap = {
    ...state.troops,
    [pick.instanceId]: {
      ...pick,
      attack: pick.attack + 1,
      currentHealth: pick.currentHealth + 1,
    },
  };
  return {
    ...state,
    troops: troopsMap,
    log: appendLog(
      state,
      `Ringue do Colecionador — ${getTroopName(state, pick)} ganhou +1/+1 permanente.`,
    ),
  };
}

/** Sanatório: 1 de dano em todas as tropas vivas na arena após um golpe. */
export function sanatorioPingAfterStrike(state: GameState, arenaId: string): GameState {
  if (getArena(state, arenaId).effect !== "ping-after-strike") return state;

  let troops = { ...state.troops };
  for (const t of livingInArena(state, arenaId)) {
    troops = applyDamageToTroop(troops, t.instanceId, 1);
  }
  return {
    ...state,
    troops,
    log: appendLog(
      state,
      "Sanatório São Augustinho — 1 de dano em todas as tropas remanescentes.",
    ),
  };
}

export function applyArenaOnCombatDeclared(state: GameState, arenaId: string): GameState {
  const arena = getArena(state, arenaId);
  switch (arena.effect) {
    case "gargoyle-fill":
      return fillGargoyles(state, arenaId);
    case "random-buff-on-combat":
      return ringueRandomBuff(state, arenaId);
    case "no-magic":
      return {
        ...state,
        combat: state.combat ? { ...state.combat, noMagic: true } : state.combat,
        log: appendLog(
          state,
          `${arena.name} — magias bloqueadas neste combate (quando existirem).`,
        ),
      };
    case "spells-cost-less":
      return {
        ...state,
        combat: state.combat
          ? { ...state.combat, spellsCostLess: true }
          : state.combat,
        log: appendLog(
          state,
          `${arena.name} — magias nesta arena custam 1 a menos (quando existirem).`,
        ),
      };
    default:
      return state;
  }
}

export function arenaBlocksNormalExit(state: GameState, arenaId: string): boolean {
  return getArena(state, arenaId).effect === "no-leave-by-move";
}

export function arenaUsesRandomCombatTargets(state: GameState, arenaId: string): boolean {
  return getArena(state, arenaId).effect === "random-combat-target";
}

export function arenaExilesDeadTroops(state: GameState, arenaId: string): boolean {
  return getArena(state, arenaId).effect === "exile-on-death";
}

/** Redução de custo de magia na arena em combate (0 ou 1). */
export function spellCostReductionInCombat(state: GameState): number {
  return state.combat?.spellsCostLess ? 1 : 0;
}

export function applyArenaOnDominate(
  state: GameState,
  arenaId: string,
  player: PlayerId,
): GameState {
  const arena = getArena(state, arenaId);
  let next = state;

  switch (arena.effect) {
    case "draw-two-on-dominate":
      next = drawFromDeck(next, player, 2);
      next = {
        ...next,
        log: appendLog(next, "Mansão dos Omegas — Jogador comprou 2 cartas."),
      };
      break;
    case "susej-on-dominate":
      if (next.catalog[SUSEJ_CARD]) {
        next = addCardToDeck(next, player, SUSEJ_CARD, true);
        next = {
          ...next,
          log: appendLog(
            next,
            "Colégio Aurélio — Susej embaralhado no baralho (carta em desenvolvimento).",
          ),
        };
      }
      break;
    case "conquest-3-corruption": {
      const players = [...next.players] as GameState["players"];
      const cur = players[player].corruption;
      const cap = maxCorruptionForPhase(next.gamePhase);
      players[player] = {
        ...players[player],
        corruption: Math.min(cap, cur + 1),
      };
      next = {
        ...next,
        players,
        log: appendLog(
          next,
          `Templo das Sombras — Jogador ${player + 1} ganhou +1 Corrupção (${Math.min(cap, cur + 1)}/${cap}).`,
        ),
      };
      break;
    }
    default:
      break;
  }

  return next;
}

export function isMagicAllowedInCombat(state: GameState): boolean {
  return !state.combat?.noMagic;
}
