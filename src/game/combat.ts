import type { CombatState, GameState, PlayerId, TroopInstance } from "./types";
import { appendLog, getArena, getTroopName, getTroopsInZone, opponent } from "./helpers";
import { applyArenaOnCombatDeclared, sanatorioPingAfterStrike } from "./arena-effects";

function livingTroops(troops: TroopInstance[]): TroopInstance[] {
  return troops.filter((t) => t.currentHealth > 0);
}

function applyDamage(
  troops: Record<string, TroopInstance>,
  troopId: string,
  damage: number,
): Record<string, TroopInstance> {
  const t = troops[troopId];
  if (!t) return troops;
  const currentHealth = Math.max(0, t.currentHealth - damage);
  return { ...troops, [troopId]: { ...t, currentHealth } };
}

/** Jogador que está atacando neste golpe de combate. */
export function getCombatAssigningPlayer(combat: CombatState): PlayerId {
  return combat.strikingPlayer;
}

export function hasAttackedThisStrike(combat: CombatState, troopId: string): boolean {
  return combat.attackedThisStrike.includes(troopId);
}

/** Arenas com tropas dos dois jogadores — exige combate antes do fim de turno. */
export function getContestedArenaNames(state: GameState, player: PlayerId): string[] {
  return state.arenas
    .filter((a) => {
      if (a.dominatedBy !== null) return false;
      const mine = getTroopsInZone(state, player, "arena", a.id).length > 0;
      const theirs = getTroopsInZone(state, opponent(player), "arena", a.id).length > 0;
      return mine && theirs;
    })
    .map((a) => a.name);
}

function alliesInCombatArena(state: GameState, player: PlayerId): TroopInstance[] {
  if (!state.combat) return [];
  return livingTroops(getTroopsInZone(state, player, "arena", state.combat.arenaId));
}

/** Todas as tropas vivas do jogador já atacaram neste golpe. */
export function allStrikeTroopsAttacked(state: GameState, player: PlayerId): boolean {
  if (!state.combat) return false;
  const allies = alliesInCombatArena(state, player);
  if (allies.length === 0) return true;
  return allies.every((t) => state.combat!.attackedThisStrike.includes(t.instanceId));
}

function tryAutoEndStrike(state: GameState): GameState {
  if (!state.combat) return state;
  const striker = state.combat.strikingPlayer;
  if (!allStrikeTroopsAttacked(state, striker)) return state;
  return endCombatStrike({
    ...state,
    log: appendLog(
      state,
      `Jogador ${striker + 1} concluiu os ataques — passando a vez.`,
    ),
  });
}

function endCombat(state: GameState, message: string): GameState {
  return {
    ...state,
    combat: null,
    turnPhase: "main",
    log: appendLog(state, message),
  };
}

function checkCombatEndAfterDamage(
  state: GameState,
  arenaId: string,
  messagePrefix: string,
): GameState {
  const p0 = livingTroops(getTroopsInZone(state, 0, "arena", arenaId));
  const p1 = livingTroops(getTroopsInZone(state, 1, "arena", arenaId));

  if (p0.length === 0 && p1.length === 0) {
    return endCombat(state, `${messagePrefix} — ambos os lados caíram.`);
  }
  if (p0.length === 0 || p1.length === 0) {
    const winner = p0.length > 0 ? 0 : 1;
    return endCombat(
      state,
      `${messagePrefix} — Jogador ${winner + 1} venceu na arena.`,
    );
  }
  return state;
}

function advanceToNextStrike(state: GameState): GameState {
  if (!state.combat) return state;

  const { arenaId, strikingPlayer, strike } = state.combat;
  let stateAfterPing = sanatorioPingAfterStrike(state, arenaId);
  stateAfterPing = checkCombatEndAfterDamage(
    stateAfterPing,
    arenaId,
    "Combate encerrado após efeito da arena",
  );
  if (!stateAfterPing.combat) return stateAfterPing;
  const combat = stateAfterPing.combat;

  const arena = getArena(stateAfterPing, arenaId);
  const nextStriker = opponent(strikingPlayer);
  const nextAllies = alliesInCombatArena(stateAfterPing, nextStriker);

  if (nextAllies.length === 0) {
    return endCombat(
      stateAfterPing,
      `Combate encerrado — Jogador ${strikingPlayer + 1} venceu na arena.`,
    );
  }

  const role = nextStriker === combat.declaredBy ? "atacante" : "defensor";
  return {
    ...stateAfterPing,
    combat: {
      ...combat,
      strike: strike + 1,
      strikingPlayer: nextStriker,
      attackedThisStrike: [],
    },
    log: appendLog(
      stateAfterPing,
      `Golpe ${strike + 1} em ${arena.name} — Jogador ${nextStriker + 1} (${role}) ataca.`,
    ),
  };
}

/** Um ataque por vez; revide só se o alvo ainda está vivo no momento do golpe. */
export function executeCombatAttack(
  state: GameState,
  attackerId: string,
  targetId: string,
): GameState {
  if (!state.combat || state.turnPhase !== "combat") return state;

  const { arenaId, strikingPlayer, attackedThisStrike } = state.combat;
  const attacker = state.troops[attackerId];
  const target = state.troops[targetId];

  if (!attacker || attacker.owner !== strikingPlayer) {
    return { ...state, log: appendLog(state, "Selecione uma de suas tropas para atacar.") };
  }
  if (attackedThisStrike.includes(attackerId)) {
    return {
      ...state,
      log: appendLog(state, "Esta tropa já atacou neste golpe."),
    };
  }
  if (attacker.zone !== "arena" || attacker.arenaId !== arenaId || attacker.currentHealth <= 0) {
    return state;
  }
  if (!target || target.owner === strikingPlayer) {
    return { ...state, log: appendLog(state, "Escolha uma tropa inimiga como alvo.") };
  }
  if (target.zone !== "arena" || target.arenaId !== arenaId || target.currentHealth <= 0) {
    return { ...state, log: appendLog(state, "Alvo inválido ou já destruído.") };
  }

  const retaliate = target.attack;
  let troops = { ...state.troops };
  troops = applyDamage(troops, targetId, attacker.attack);
  troops = applyDamage(troops, attackerId, retaliate);

  const arena = getArena(state, arenaId);
  let next: GameState = {
    ...state,
    troops,
    combat: {
      ...state.combat,
      attackedThisStrike: [...attackedThisStrike, attackerId],
    },
    log: appendLog(
      state,
      `${getTroopName(state, attacker)} atacou ${getTroopName(state, target)} em ${arena.name} (troca de dano).`,
    ),
  };

  next = checkCombatEndAfterDamage(
    next,
    arenaId,
    "Combate encerrado",
  );
  if (!next.combat) return next;
  return tryAutoEndStrike(next);
}

export function endCombatStrike(state: GameState): GameState {
  if (!state.combat || state.turnPhase !== "combat") return state;

  const { strikingPlayer, strike } = state.combat;
  return advanceToNextStrike({
    ...state,
    log: appendLog(state, `Jogador ${strikingPlayer + 1} encerrou o golpe ${strike}.`),
  });
}

export function startCombat(state: GameState, arenaId: string): GameState {
  const arena = getArena(state, arenaId);

  if (arena.dominatedBy !== null) {
    return {
      ...state,
      log: appendLog(state, `${arena.name} está dominada — combate não é permitido.`),
    };
  }

  const p0 = livingTroops(getTroopsInZone(state, 0, "arena", arenaId));
  const p1 = livingTroops(getTroopsInZone(state, 1, "arena", arenaId));

  if (p0.length === 0 || p1.length === 0) {
    return {
      ...state,
      log: appendLog(state, "Combate requer tropas dos dois jogadores na arena."),
    };
  }

  const declaredBy = state.activePlayer;
  let next = state;
  const combat: CombatState = {
    arenaId,
    strike: 1,
    declaredBy,
    strikingPlayer: declaredBy,
    attackedThisStrike: [],
  };

  next = {
    ...next,
    combat,
    turnPhase: "combat",
    log: appendLog(
      next,
      `Combate em ${arena.name}! Golpe 1 — Jogador ${declaredBy + 1} (atacante): um ataque por vez.`,
    ),
  };

  return applyArenaOnCombatDeclared(next, arenaId);
}
