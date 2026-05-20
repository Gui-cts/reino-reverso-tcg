import { applyLeaderDamageTo } from "./phase-transition";
import { drawFromDeck } from "./state";
import {
  appendLog,
  getTroopsInZone,
  getTroopName,
  opponent,
} from "./helpers";
import type {
  CardDefinition,
  DeathEffectId,
  GameState,
  KeywordId,
  PlayerId,
  TroopInstance,
} from "./types";

export function cardHasKeyword(
  def: CardDefinition | undefined,
  keyword: KeywordId,
): boolean {
  return def?.keywords?.includes(keyword) ?? false;
}

export function troopHasKeyword(
  state: GameState,
  troop: TroopInstance,
  keyword: KeywordId,
): boolean {
  return cardHasKeyword(state.catalog[troop.cardId], keyword);
}

export function keywordLabel(keyword: KeywordId): string {
  switch (keyword) {
    case "protetor":
      return "Protetor";
    case "investida":
      return "Investida";
    case "testamento":
      return "Testamento";
    case "eco":
      return "Eco";
    case "vincular":
      return "Vincular";
    case "silencio":
      return "Silêncio";
    case "fatiar":
      return "Fatiar";
    case "voar":
      return "Voar";
    default:
      return keyword;
  }
}

export function describeDeathEffect(effect: DeathEffectId): string {
  switch (effect) {
    case "draw-one":
      return "ao morrer: compra 1 carta";
    case "ping-leader-1":
      return "ao morrer: 1 de dano no Líder inimigo";
    default:
      return "";
  }
}

export function formatKeywordsLine(def: CardDefinition): string {
  const parts: string[] = [];
  if (def.keywords) {
    for (const kw of def.keywords) {
      if (kw === "testamento" && def.deathEffect) {
        parts.push(`${keywordLabel(kw)} (${describeDeathEffect(def.deathEffect)})`);
      } else {
        parts.push(keywordLabel(kw));
      }
    }
  }
  return parts.join(" · ");
}

export function describeKeywordRule(keyword: KeywordId): string {
  switch (keyword) {
    case "protetor":
      return "Inimigos devem atacar Protetores nesta arena antes das outras tropas (magias não).";
    case "investida":
      return "Entra na base pronta para se mover (não exausta ao ser convocada).";
    case "testamento":
      return "Efeito ao morrer — não é magia (Bar do João não bloqueia).";
    case "eco":
      return "Ao morrer: uma tropa aliada na base fica pronta.";
    case "vincular":
      return "Ao causar dano em combate: alvo não pode se mover no próximo turno dele.";
    case "silencio":
      return "Não pode receber Encore, Pele de Ferro ou outras magias presas.";
    case "fatiar":
      return "Dano excedente ao matar continua em outro inimigo legal na arena (mesmo ataque).";
    case "voar":
      return "Pode mover entre arenas (não só base ↔ arena).";
    default:
      return "";
  }
}

/** Próximo alvo para dano excedente de Fatiar. */
export function pickNextCleaveTarget(
  state: GameState,
  striker: PlayerId,
  arenaId: string,
  _troops: Record<string, TroopInstance>,
  alreadyHit: Set<string>,
): TroopInstance | null {
  const legal = getLegalCombatTargets(state, striker, arenaId).filter(
    (t) => t.currentHealth > 0 && !alreadyHit.has(t.instanceId),
  );
  if (legal.length === 0) return null;
  return [...legal].sort((a, b) => a.currentHealth - b.currentHealth)[0]!;
}

export function troopCanFlyBetweenArenas(
  state: GameState,
  troop: TroopInstance,
): boolean {
  return troopHasKeyword(state, troop, "voar");
}

/** Alvos legais de ataque corpo a corpo nesta arena. */
export function getLegalCombatTargets(
  state: GameState,
  striker: PlayerId,
  arenaId: string,
): TroopInstance[] {
  const enemies = getTroopsInZone(state, opponent(striker), "arena", arenaId).filter(
    (t) => t.currentHealth > 0 && !t.etherealThisTurn,
  );
  const protectors = enemies.filter((t) => troopHasKeyword(state, t, "protetor"));
  if (protectors.length > 0) return protectors;
  return enemies;
}

export function isLegalCombatTarget(
  state: GameState,
  striker: PlayerId,
  arenaId: string,
  target: TroopInstance,
): boolean {
  if (target.owner === striker || target.zone !== "arena" || target.arenaId !== arenaId) {
    return false;
  }
  if (target.currentHealth <= 0) return false;
  return getLegalCombatTargets(state, striker, arenaId).some(
    (t) => t.instanceId === target.instanceId,
  );
}

function applyEcoOnDeath(state: GameState, troop: TroopInstance): GameState {
  const owner = troop.owner;
  const allies = getTroopsInZone(state, owner, "base").filter(
    (t) => t.currentHealth > 0 && t.instanceId !== troop.instanceId,
  );
  if (allies.length === 0) {
    return {
      ...state,
      log: appendLog(
        state,
        `Eco (${getTroopName(state, troop)}) — nenhuma tropa aliada na base para preparar.`,
      ),
    };
  }
  const pick = allies[0]!;
  const troops = {
    ...state.troops,
    [pick.instanceId]: { ...pick, exhausted: false },
  };
  return {
    ...state,
    troops,
    log: appendLog(
      state,
      `Eco — ${getTroopName(state, pick)} na base ficou pronta após a morte de ${getTroopName(state, troop)}.`,
    ),
  };
}

function resolveDeathEffect(
  state: GameState,
  troop: TroopInstance,
  effect: DeathEffectId,
): GameState {
  const owner = troop.owner;
  const name = getTroopName(state, troop);

  switch (effect) {
    case "draw-one": {
      let next = drawFromDeck(state, owner, 1);
      if (next.matchPhase === "finished") return next;
      return {
        ...next,
        log: appendLog(next, `Testamento (${name}) — Jogador ${owner + 1} compra 1 carta.`),
      };
    }
    case "ping-leader-1": {
      const target = opponent(owner);
      return applyLeaderDamageTo(
        state,
        target,
        1,
        `Testamento (${name}) — 1 de dano no Líder do Jogador ${target + 1}.`,
        owner,
      );
    }
    default:
      return state;
  }
}

/** Dispara Eco / Testamento — nunca passa por regras de magia de arena. */
export function applyTroopDeathTriggers(
  state: GameState,
  troop: TroopInstance,
): GameState {
  const def = state.catalog[troop.cardId];
  if (!def) return state;

  let next = state;

  if (cardHasKeyword(def, "testamento") && def.deathEffect) {
    next = resolveDeathEffect(next, troop, def.deathEffect);
    if (next.matchPhase === "finished") return next;
  }

  if (cardHasKeyword(def, "eco")) {
    next = applyEcoOnDeath(next, troop);
  }

  return next;
}

export function applyVincularAfterCombatHit(
  state: GameState,
  attacker: TroopInstance,
  target: TroopInstance,
): GameState {
  if (!troopHasKeyword(state, attacker, "vincular")) return state;
  if (target.currentHealth <= 0) {
    return {
      ...state,
      log: appendLog(
        state,
        `Vincular — ${getTroopName(state, target)} caiu antes de ser presa ao solo.`,
      ),
    };
  }

  const troops = {
    ...state.troops,
    [target.instanceId]: { ...target, movementLocked: true },
  };
  return {
    ...state,
    troops,
    log: appendLog(
      state,
      `Vincular — ${getTroopName(state, target)} não poderá se mover no próximo turno.`,
    ),
  };
}

export function clearMovementLocksForPlayer(state: GameState, player: PlayerId): GameState {
  const troops = { ...state.troops };
  let changed = false;
  for (const t of Object.values(troops)) {
    if (t.owner === player && t.movementLocked) {
      troops[t.instanceId] = { ...t, movementLocked: false };
      changed = true;
    }
  }
  if (!changed) return state;
  return { ...state, troops };
}

export function troopEntersReadyOnDeploy(def: CardDefinition | undefined): boolean {
  return cardHasKeyword(def, "investida");
}

export function troopBlocksEnchantments(
  state: GameState,
  target: TroopInstance,
): boolean {
  return troopHasKeyword(state, target, "silencio");
}
