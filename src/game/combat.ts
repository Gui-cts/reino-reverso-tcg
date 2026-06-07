import type { CombatState, GameState, PlayerId, TroopInstance } from "./types";
import { appendLog, getArena, getTroopName, getTroopsInZone, opponent } from "./helpers";
import {
  applyArenaOnCombatDeclared,
  arenaUsesRandomCombatTargets,
  sanatorioPingAfterStrike,
} from "./arena-effects";
import { finalizeReinoReversoCombat } from "./reino-reverso";
import { applyStrikeDamage } from "./combat-damage";
import { isLegalCombatTarget } from "./keywords";
import { resolveEncoreBeforeAttack } from "./spells";

function livingTroops(troops: TroopInstance[]): TroopInstance[] {
  return troops.filter((t) => t.currentHealth > 0);
}

/** Jogador que está atacando neste golpe de combate. */
export function getCombatAssigningPlayer(combat: CombatState): PlayerId {
  return combat.strikingPlayer;
}

export function isCombatMagicPhase(state: GameState): boolean {
  return state.combat?.subPhase === "magic";
}

export function isCombatStrikePhase(state: GameState): boolean {
  return state.combat?.subPhase === "strike";
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
  if (!state.combat || state.combat.subPhase !== "strike") return state;
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

function finishCombatWithWinner(
  state: GameState,
  arenaId: string,
  winner: PlayerId,
  message: string,
): GameState {
  if (state.gamePhase === "reino-reverso") {
    return finalizeReinoReversoCombat(state, arenaId, winner, message);
  }
  return endCombat(state, message);
}

function isSanatorioArena(state: GameState, arenaId: string): boolean {
  return getArena(state, arenaId).effect === "ping-after-strike";
}

function combatWouldEnd(state: GameState, arenaId: string): boolean {
  const p0 = livingTroops(getTroopsInZone(state, 0, "arena", arenaId));
  const p1 = livingTroops(getTroopsInZone(state, 1, "arena", arenaId));
  return p0.length === 0 || p1.length === 0;
}

function applySanatorioIfStrikeEndsCombat(state: GameState, arenaId: string): GameState {
  if (!state.combat || !isSanatorioArena(state, arenaId)) return state;
  if (!combatWouldEnd(state, arenaId)) return state;
  return sanatorioPingAfterStrike(state, arenaId);
}

export function checkCombatEndAfterDamage(
  state: GameState,
  arenaId: string,
  messagePrefix: string,
): GameState {
  const p0 = livingTroops(getTroopsInZone(state, 0, "arena", arenaId));
  const p1 = livingTroops(getTroopsInZone(state, 1, "arena", arenaId));

  if (p0.length === 0 && p1.length === 0) {
    const msg = `${messagePrefix} — ambos os lados caíram.`;
    if (state.gamePhase === "reino-reverso") {
      return finalizeReinoReversoCombat(state, arenaId, null, msg);
    }
    return endCombat(state, msg);
  }
  if (p0.length === 0 || p1.length === 0) {
    const winner = p0.length > 0 ? 0 : 1;
    return finishCombatWithWinner(
      state,
      arenaId,
      winner,
      `${messagePrefix} — Jogador ${winner + 1} venceu na arena.`,
    );
  }
  return state;
}

function beginCombatStrikePhase(state: GameState): GameState {
  if (!state.combat) return state;
  const combat = state.combat;
  const arena = getArena(state, combat.arenaId);
  const role =
    combat.strikingPlayer === combat.declaredBy ? "atacante" : "defensor";

  return {
    ...state,
    combat: {
      ...combat,
      subPhase: "strike",
      magicPassed: [false, false],
      attackedThisStrike: [],
    },
    log: appendLog(
      state,
      `Golpe ${combat.strike} em ${arena.name} — Jogador ${combat.strikingPlayer + 1} (${role}): um ataque por vez.`,
    ),
  };
}

function beginCombatMagicPhase(
  state: GameState,
  opts: { strike: number; strikingPlayer: PlayerId; magicWindow: number },
): GameState {
  if (!state.combat) return state;
  const arena = getArena(state, opts.strike ? state.combat.arenaId : state.combat.arenaId);

  return {
    ...state,
    combat: {
      ...state.combat,
      strike: opts.strike,
      strikingPlayer: opts.strikingPlayer,
      subPhase: "magic",
      magicWindow: opts.magicWindow,
      magicPassed: [false, false],
      attackedThisStrike: [],
    },
    log: appendLog(
      state,
      `Fase de magias ${opts.magicWindow} (${arena.name}) — ambos podem lançar magias de combate/rápidas ou passar.`,
    ),
  };
}

/** Ambos passaram na fase de magias → inicia o golpe de ataques. */
export function passCombatMagic(state: GameState, player: PlayerId): GameState {
  if (!state.combat || state.combat.subPhase !== "magic") {
    return { ...state, log: appendLog(state, "Não há fase de magias agora.") };
  }

  if (state.combat.magicPassed[player]) {
    return {
      ...state,
      log: appendLog(state, `Jogador ${player + 1} já passou nesta fase de magias.`),
    };
  }

  const magicPassed = [...state.combat.magicPassed] as [boolean, boolean];
  magicPassed[player] = true;

  let next: GameState = {
    ...state,
    combat: { ...state.combat, magicPassed },
    log: appendLog(
      state,
      `Jogador ${player + 1} passou na fase de magias ${state.combat.magicWindow}.`,
    ),
  };

  if (magicPassed[0] && magicPassed[1]) {
    next = beginCombatStrikePhase(next);
  }
  return next;
}

function advanceToNextStrike(state: GameState): GameState {
  if (!state.combat) return state;

  const { arenaId, strikingPlayer, strike } = state.combat;

  let stateAfterPing = state;
  if (isSanatorioArena(state, arenaId) && !combatWouldEnd(state, arenaId)) {
    stateAfterPing = sanatorioPingAfterStrike(state, arenaId);
  }
  stateAfterPing = checkCombatEndAfterDamage(
    stateAfterPing,
    arenaId,
    "Combate encerrado após efeito da arena",
  );
  if (!stateAfterPing.combat) return stateAfterPing;

  const nextStriker = opponent(strikingPlayer);
  const nextAllies = alliesInCombatArena(stateAfterPing, nextStriker);

  if (nextAllies.length === 0) {
    return finishCombatWithWinner(
      stateAfterPing,
      arenaId,
      strikingPlayer,
      `Combate encerrado — Jogador ${strikingPlayer + 1} venceu na arena.`,
    );
  }

  const nextStrike = strike + 1;
  return beginCombatMagicPhase(stateAfterPing, {
    strike: nextStrike,
    strikingPlayer: nextStriker,
    magicWindow: nextStrike,
  });
}

export function executeCombatAttack(
  state: GameState,
  attackerId: string,
  targetId: string,
): GameState {
  if (!state.combat || state.turnPhase !== "combat") return state;
  if (state.combat.subPhase !== "strike") {
    return {
      ...state,
      log: appendLog(state, "Aguarde o fim da fase de magias para atacar."),
    };
  }

  const { arenaId, strikingPlayer, attackedThisStrike } = state.combat;
  const attacker = state.troops[attackerId];
  let target = state.troops[targetId];

  if (!attacker || attacker.owner !== strikingPlayer) {
    return { ...state, log: appendLog(state, "Selecione uma de suas tropas para atacar.") };
  }
  if (attackedThisStrike.includes(attackerId)) {
    return {
      ...state,
      log: appendLog(state, "Esta tropa já atacou neste golpe."),
    };
  }
  if (attacker.exhausted) {
    return {
      ...state,
      log: appendLog(state, `${getTroopName(state, attacker)} está exausta e não pode atacar.`),
    };
  }
  if (attacker.attackSuppressed) {
    return {
      ...state,
      log: appendLog(state, `${getTroopName(state, attacker)} não pode atacar (Constrição).`),
    };
  }
  if (attacker.zone !== "arena" || attacker.arenaId !== arenaId || attacker.currentHealth <= 0) {
    return state;
  }
  let resolvedTargetId = targetId;
  if (arenaUsesRandomCombatTargets(state, arenaId)) {
    const enemies = livingTroops(
      getTroopsInZone(state, opponent(strikingPlayer), "arena", arenaId),
    );
    if (enemies.length === 0) {
      return {
        ...state,
        log: appendLog(state, "Cidade das Curvas — não há alvos inimigos vivos."),
      };
    }
    const pick = enemies[Math.floor(Math.random() * enemies.length)]!;
    resolvedTargetId = pick.instanceId;
    target = pick;
  } else {
    if (!target || target.owner === strikingPlayer) {
      return { ...state, log: appendLog(state, "Escolha uma tropa inimiga como alvo.") };
    }
    if (target.zone !== "arena" || target.arenaId !== arenaId || target.currentHealth <= 0) {
      return { ...state, log: appendLog(state, "Alvo inválido ou já destruído.") };
    }
    if (!isLegalCombatTarget(state, strikingPlayer, arenaId, target)) {
      return {
        ...state,
        log: appendLog(
          state,
          "Há Protetores inimigos — ataque um Protetor antes das outras tropas.",
        ),
      };
    }
  }

  const encoreCheck = resolveEncoreBeforeAttack(state, attackerId, resolvedTargetId);
  let nextAfterEncore = encoreCheck.state;
  if (!encoreCheck.proceed) {
    return tryAutoEndStrike(nextAfterEncore);
  }

  const targetAfterEncore = nextAfterEncore.troops[resolvedTargetId];
  if (!targetAfterEncore || targetAfterEncore.currentHealth <= 0) {
    return {
      ...nextAfterEncore,
      log: appendLog(nextAfterEncore, "Alvo inválido ou já destruído."),
    };
  }

  const arena = getArena(state, arenaId);
  const strike = applyStrikeDamage(
    nextAfterEncore,
    attacker,
    arenaId,
    strikingPlayer,
    resolvedTargetId,
    arena.name,
    arenaUsesRandomCombatTargets(state, arenaId),
  );

  let next: GameState = {
    ...strike.state,
    troops: strike.troops,
    combat: {
      ...nextAfterEncore.combat!,
      attackedThisStrike: [...attackedThisStrike, attackerId],
    },
    log: appendLog(nextAfterEncore, strike.logLine),
  };

  next = applySanatorioIfStrikeEndsCombat(next, arenaId);
  next = checkCombatEndAfterDamage(next, arenaId, "Combate encerrado");
  if (!next.combat) return next;
  return tryAutoEndStrike(next);
}

export function endCombatStrike(state: GameState): GameState {
  if (!state.combat || state.turnPhase !== "combat") return state;
  if (state.combat.subPhase !== "strike") {
    return {
      ...state,
      log: appendLog(state, "Só é possível encerrar o golpe durante a fase de ataques."),
    };
  }

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
  const combat: CombatState = {
    arenaId,
    strike: 1,
    declaredBy,
    strikingPlayer: declaredBy,
    attackedThisStrike: [],
    subPhase: "magic",
    magicWindow: 1,
    magicPassed: [false, false],
  };

  let next: GameState = {
    ...state,
    combat,
    turnPhase: "combat",
    log: appendLog(state, `Combate declarado em ${arena.name}!`),
  };

  next = applyArenaOnCombatDeclared(next, arenaId);
  return {
    ...next,
    log: appendLog(
      next,
      `Fase de magias 1 (${arena.name}) — ambos podem lançar magias de combate/rápidas ou passar.`,
    ),
  };
}
