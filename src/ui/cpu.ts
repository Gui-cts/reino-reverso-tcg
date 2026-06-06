import {
  arenaUsesRandomCombatTargets,
  canAffordSpellCost,
  canPlaySpellNow,
  canTargetSpell,
  cardHasKeyword,
  getAvailableEssence,
  getCombatAssigningPlayer,
  getContestedArenaNames,
  getLegalCombatTargets,
  getRRUnansweredArenaNames,
  hasAttackedThisStrike,
  isSpellCard,
  troopCanFlyBetweenArenas,
} from "../game";
import { arenaBlocksNormalExit } from "../game/arena-effects";
import {
  canPayEssenceCost,
  countTroopsInZone,
  getTroopsInZone,
  opponent,
} from "../game/helpers";
import { canAffordCardCost, getEssenceCost, isLeaderFormCard } from "../game/card-meta";
import { spellRequiresTarget } from "../game/spell-stack";
import type {
  ArenaDefinition,
  CardDefinition,
  GameAction,
  GameState,
  PlayerId,
  SpellEffectId,
  TroopInstance,
} from "../game/types";
import { MAX_TROOPS_PER_ZONE } from "../game/types";

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function availableArenaIds(state: GameState, player: PlayerId): string[] {
  const other = opponent(player);
  const taken = new Set([
    ...state.selectedArenaIds[player],
    ...state.selectedArenaIds[other],
    ...state.arenaSetupPicks,
  ]);
  return state.arenaPool
    .filter((a) => {
      if (a.phase !== state.gamePhase) return false;
      if (a.neutral && state.gamePhase !== "reino-reverso") return false;
      return !taken.has(a.id);
    })
    .map((a) => a.id);
}

function scoreArena(arena: ArenaDefinition, phase: GameState["gamePhase"]): number {
  const scores: Record<string, number> = {
    none: 1,
    "no-magic": 2,
    "gargoyle-fill": 7,
    "susej-on-dominate": 8,
    "random-buff-on-combat": 6,
    "draw-two-on-dominate": 9,
    "ping-after-strike": 5,
    "conquest-3-corruption": 6,
    "no-leave-by-move": 8,
    "random-combat-target": 7,
    "exile-on-death": 7,
    "spells-cost-less": 4,
    "rr-vacuum-2": 8,
    "rr-mutual-wipe-leader-damage": 6,
    "rr-loser-only-vacuum": 9,
  };
  let s = scores[arena.effect] ?? 3;
  if (phase === "reino-reverso" && arena.neutral) s -= 2;
  if (phase === "mundo-normal" && arena.effect === "conquest-3-corruption") s -= 1;
  return s;
}

function pickArenaSetup(state: GameState, player: PlayerId): GameAction | null {
  const ids = availableArenaIds(state, player);
  if (ids.length === 0) return null;

  const ranked = ids
    .map((id) => state.arenaPool.find((a) => a.id === id)!)
    .filter(Boolean)
    .sort((a, b) => scoreArena(b, state.gamePhase) - scoreArena(a, state.gamePhase));

  const top = ranked.slice(0, Math.min(3, ranked.length));
  const pick = pickRandom(top) ?? ranked[0]!;
  return { type: "SELECT_ARENA", player, arenaId: pick.id };
}

function pickPostPhaseChoice(state: GameState, player: PlayerId): GameAction {
  const troops = countTroopsInZone(state, player, "arena");
  const corruption = state.players[player].corruption;

  if (troops >= 2) {
    return { type: "POST_PHASE_CHOICE", player, choice: "essence" };
  }
  if (troops === 0) {
    return { type: "POST_PHASE_CHOICE", player, choice: "recycle" };
  }
  if (corruption < 3) {
    return { type: "POST_PHASE_CHOICE", player, choice: "corruption" };
  }
  return { type: "POST_PHASE_CHOICE", player, choice: "essence" };
}

function livingInArena(state: GameState, player: PlayerId, arenaId: string) {
  return getTroopsInZone(state, player, "arena", arenaId).filter((t) => t.currentHealth > 0);
}

function handTroopDefs(state: GameState, cpu: PlayerId) {
  const out: {
    troopId: string;
    cardId: string;
    cost: number;
    hasEssence: boolean;
    power: number;
    index: number;
  }[] = [];
  state.players[cpu].hand.forEach((troopId, index) => {
    const troop = state.troops[troopId];
    if (!troop || troop.owner !== cpu) return;
    const def = state.catalog[troop.cardId];
    if (!def || isSpellCard(def) || isLeaderFormCard(def)) return;
    out.push({
      troopId,
      cardId: troop.cardId,
      cost: def.cost,
      hasEssence: Boolean(def.hasEssenceSymbol),
      power: def.attack + def.health,
      index,
    });
  });
  return out;
}

function pickCpuMulligan(state: GameState, cpu: PlayerId): GameAction {
  const hand = handTroopDefs(state, cpu);
  const badIndices = hand
    .filter((h) => !h.hasEssence && h.cost >= 3)
    .map((h) => h.index);

  if (badIndices.length >= 2) {
    return { type: "MULLIGAN", player: cpu, handIndices: badIndices.slice(0, 4) };
  }
  return { type: "SKIP_MULLIGAN", player: cpu };
}

function scoreSpellTarget(
  _state: GameState,
  cpu: PlayerId,
  effect: SpellEffectId,
  target: TroopInstance,
): number {
  const inArena = target.zone === "arena";
  const isAlly = target.owner === cpu;
  const power = target.attack + target.currentHealth;

  switch (effect) {
    case "iron-skin":
      return (isAlly ? 100 : -1000) + (inArena ? 50 : 0) + power;
    case "encore":
      return (isAlly ? 100 : -1000) + (inArena ? 60 : 0) + target.attack * 2;
    case "blood-cauldron":
      return (!isAlly ? 100 : -1000) + (200 - target.currentHealth);
    case "gust-wind":
      return (!isAlly ? 100 : -200) + (inArena ? power * 2 : 0);
    case "omega":
      return (!isAlly ? 100 : -1000) + power * 3;
    case "constriction":
      return (!isAlly ? 100 : -1000) + target.attack * 2 + (inArena ? 50 : 0);
    case "ethereal":
      return (isAlly ? 100 : -1000) + (inArena ? 80 : 0) + power;
    default:
      return isAlly ? power : -power;
  }
}

function scoreSpellAction(
  _state: GameState,
  _cpu: PlayerId,
  def: CardDefinition,
  bestTargetScore: number,
): number {
  const effect = def.spellEffect!;
  let base = bestTargetScore;
  if (effect === "draw-two" || effect === "troop-tutor" || effect === "spell-tutor") {
    base = 80;
  }
  if (effect === "omega") base += 40;
  if (effect === "counterspell") base -= 200;
  base -= def.cost * 5;
  return base;
}

function pickPlaySpell(state: GameState, cpu: PlayerId): GameAction | null {
  type Candidate = { spellId: string; targetId?: string; score: number };
  const candidates: Candidate[] = [];

  for (const spellId of state.players[cpu].hand) {
    const spellInst = state.troops[spellId];
    if (!spellInst || spellInst.owner !== cpu) continue;
    const spellDef = state.catalog[spellInst.cardId];
    if (!spellDef || !isSpellCard(spellDef) || !spellDef.spellEffect) continue;
    if (!canPlaySpellNow(state, cpu, spellDef)) continue;
    if (!canAffordSpellCost(state, cpu, spellDef)) continue;

    const effect = spellDef.spellEffect;

    if (!spellRequiresTarget(effect)) {
      candidates.push({
        spellId,
        score: scoreSpellAction(state, cpu, spellDef, 80),
      });
      continue;
    }

    const targets = Object.values(state.troops).filter((t) =>
      canTargetSpell(state, cpu, spellDef, t),
    );
    if (targets.length === 0) continue;

    const scored = targets
      .map((t) => ({
        t,
        s: scoreSpellTarget(state, cpu, effect, t),
      }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);

    if (scored.length === 0) continue;

    candidates.push({
      spellId,
      targetId: scored[0]!.t.instanceId,
      score: scoreSpellAction(state, cpu, spellDef, scored[0]!.s),
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;

  if (best.score <= 0) return null;

  return {
    type: "PLAY_SPELL",
    player: cpu,
    spellInstanceId: best.spellId,
    ...(best.targetId ? { targetTroopId: best.targetId } : {}),
  };
}

function cpuHasPlayableSpell(state: GameState, cpu: PlayerId): boolean {
  return pickPlaySpell(state, cpu) !== null;
}

function pickCpuCombatMagic(state: GameState, cpu: PlayerId): GameAction | null {
  if (!state.combat || state.combat.subPhase !== "magic") return null;

  const spell = pickPlaySpell(state, cpu);
  if (spell) return spell;

  if (!state.combat.magicPassed[cpu]) {
    return { type: "PASS_COMBAT_MAGIC", player: cpu };
  }
  return null;
}

/** Magias rápidas (ou reação) fora da vez principal ou após passar na fase de magias. */
function pickCpuReactiveSpell(state: GameState, cpu: PlayerId): GameAction | null {
  if (state.matchPhase !== "playing") return null;
  if (state.turnPhase !== "main" && state.turnPhase !== "combat") return null;

  if (state.combat?.subPhase === "magic" && !state.combat.magicPassed[cpu]) {
    return null;
  }
  if (state.turnPhase === "main" && state.activePlayer === cpu && !state.combat) {
    return null;
  }
  if (
    state.combat?.subPhase === "strike" &&
    getCombatAssigningPlayer(state.combat) === cpu
  ) {
    return null;
  }

  return pickPlaySpell(state, cpu);
}

function pickSacrificeForEssence(state: GameState, cpu: PlayerId): GameAction | null {
  if (state.players[cpu].sacrificedThisTurn) return null;

  const hand = handTroopDefs(state, cpu);
  if (hand.length === 0) return null;

  const sacrificable = [...hand]
    .filter((h) => h.hasEssence)
    .sort((a, b) => a.power - b.power);
  if (sacrificable.length === 0) return null;

  const available = getAvailableEssence(state, cpu).length;
  const maxCostInHand = Math.max(...hand.map((h) => h.cost));

  const canPlaySomething = hand.some((h) => {
    const def = state.catalog[h.cardId];
    return def ? canAffordCardCost(state, cpu, def) : false;
  });

  if (!canPlaySomething) {
    return { type: "SACRIFICE_ESSENCE", troopId: sacrificable[0]!.troopId };
  }

  if (available < maxCostInHand && hand.length >= 3) {
    return { type: "SACRIFICE_ESSENCE", troopId: sacrificable[0]!.troopId };
  }

  return null;
}

function pickPlayTroop(state: GameState, cpu: PlayerId): GameAction | null {
  if (countTroopsInZone(state, cpu, "base") >= MAX_TROOPS_PER_ZONE) return null;

  const affordable = handTroopDefs(state, cpu)
    .filter((h) => {
      const def = state.catalog[h.cardId];
      return def ? canAffordCardCost(state, cpu, def) : false;
    })
    .sort((a, b) => b.cost - a.cost || b.power - a.power);

  if (affordable.length === 0) return null;
  return { type: "PLAY_TROOP", troopId: affordable[0]!.troopId };
}

function findArenaForMove(state: GameState, cpu: PlayerId): { arenaId: string } | null {
  const baseTroops = getTroopsInZone(state, cpu, "base").filter(
    (t) => !t.exhausted && !t.pinned,
  );
  if (baseTroops.length === 0) return null;

  const unanswered = getRRUnansweredArenaNames(state, cpu);
  if (unanswered.length > 0) {
    const arena = state.arenas.find((a) => unanswered.includes(a.name));
    if (
      arena &&
      arena.dominatedBy === null &&
      countTroopsInZone(state, cpu, "arena", arena.id) < MAX_TROOPS_PER_ZONE
    ) {
      return { arenaId: arena.id };
    }
  }

  let pressureArena: { id: string; enemyCount: number; allyCount: number } | null = null;
  for (const arena of state.arenas) {
    if (arena.dominatedBy !== null) continue;
    const allies = countTroopsInZone(state, cpu, "arena", arena.id);
    const enemies = countTroopsInZone(state, opponent(cpu), "arena", arena.id);
    if (allies >= MAX_TROOPS_PER_ZONE) continue;
    if (enemies === 0 && state.gamePhase !== "reino-reverso") continue;
    if (enemies > 0 && (!pressureArena || enemies > pressureArena.enemyCount)) {
      pressureArena = { id: arena.id, enemyCount: enemies, allyCount: allies };
    }
  }
  if (pressureArena) return { arenaId: pressureArena.id };

  let bestArena = state.arenas.find((a) => a.dominatedBy === null);
  if (!bestArena) return null;
  let bestCount = countTroopsInZone(state, cpu, "arena", bestArena.id);

  for (const arena of state.arenas) {
    if (arena.dominatedBy !== null) continue;
    const n = countTroopsInZone(state, cpu, "arena", arena.id);
    if (n < bestCount) {
      bestCount = n;
      bestArena = arena;
    }
  }

  if (countTroopsInZone(state, cpu, "arena", bestArena.id) >= MAX_TROOPS_PER_ZONE) {
    return null;
  }
  return { arenaId: bestArena.id };
}

function pickFlyingMove(state: GameState, cpu: PlayerId): GameAction | null {
  const flyers = Object.values(state.troops).filter(
    (t) =>
      t.owner === cpu &&
      t.zone === "arena" &&
      t.arenaId &&
      !t.exhausted &&
      !t.pinned &&
      troopCanFlyBetweenArenas(state, t),
  );
  if (flyers.length === 0) return null;

  const target = findArenaForMove(state, cpu);
  if (!target) return null;

  const troop =
    flyers.find((t) => t.arenaId !== target.arenaId) ??
    [...flyers].sort(
      (a, b) => b.attack + b.currentHealth - (a.attack + a.currentHealth),
    )[0];
  if (!troop?.arenaId || troop.arenaId === target.arenaId) return null;
  if (troop.arenaId && arenaBlocksNormalExit(state, troop.arenaId)) return null;

  return {
    type: "MOVE_TROOP",
    troopId: troop.instanceId,
    to: "arena",
    arenaId: target.arenaId,
  };
}

function pickMoveTroop(state: GameState, cpu: PlayerId): GameAction | null {
  const fly = pickFlyingMove(state, cpu);
  if (fly) return fly;

  const baseTroops = getTroopsInZone(state, cpu, "base").filter(
    (t) => !t.exhausted && !t.pinned,
  );
  if (baseTroops.length === 0) return null;

  const target = findArenaForMove(state, cpu);
  if (!target) return null;

  return {
    type: "MOVE_TROOP",
    troopId: baseTroops[0]!.instanceId,
    to: "arena",
    arenaId: target.arenaId,
  };
}

function pickDeclareCombat(state: GameState, cpu: PlayerId): GameAction | null {
  const contested = getContestedArenaNames(state, cpu);
  if (contested.length === 0) return null;

  let best: { arenaId: string; allies: number; enemies: number } | null = null;
  for (const name of contested) {
    const arena = state.arenas.find((a) => a.name === name);
    if (!arena) continue;
    const allies = livingInArena(state, cpu, arena.id).length;
    const enemies = livingInArena(state, opponent(cpu), arena.id).length;
    if (allies === 0) continue;
    if (!best || allies > best.allies || (allies === best.allies && enemies < best.enemies)) {
      best = { arenaId: arena.id, allies, enemies };
    }
  }
  if (!best) return null;
  return { type: "DECLARE_COMBAT", arenaId: best.arenaId };
}

function pickEmpathyMarkMainPhase(state: GameState, cpu: PlayerId): GameAction | null {
  if (getAvailableEssence(state, cpu).length < 1) return null;
  for (const arena of state.arenas) {
    if (arena.dominatedBy !== null) continue;
    const allies = livingInArena(state, cpu, arena.id).filter((t) => !t.hasEmpathy);
    const enemies = livingInArena(state, opponent(cpu), arena.id);
    if (allies.length === 0 || enemies.length === 0) continue;
    const bestTarget = [...allies].sort((a, b) => (b.currentHealth) - (a.currentHealth))[0];
    if (bestTarget) {
      return { type: "USE_LEADER_ABILITY", player: cpu, targetTroopId: bestTarget.instanceId };
    }
  }
  return null;
}

function pickLeaderAbility(state: GameState, cpu: PlayerId): GameAction | null {
  const pl = state.players[cpu];
  if (!pl.leaderId || pl.leaderAbilityUsedThisTurn || pl.leaderExhausted) return null;
  const leaderDef = state.catalog[pl.leaderId];
  if (!leaderDef?.leaderAbilityId) return null;

  if (!state.combat && leaderDef.leaderAbilityId === "arcane-melody") {
    if (state.turnPhase === "main" && state.activePlayer === cpu) {
      return { type: "USE_LEADER_ABILITY", player: cpu, targetTroopId: "" };
    }
    return null;
  }

  if (!state.combat && leaderDef.leaderAbilityId === "empathy-mark") {
    return pickEmpathyMarkMainPhase(state, cpu);
  }
  if (!state.combat) return null;

  if (leaderDef.leaderAbilityId === "shield") {
    if (getAvailableEssence(state, cpu).length < 2) return null;
    const arenaId = state.combat.arenaId;
    const allies = livingInArena(state, cpu, arenaId).filter((t) => !t.shielded);
    if (allies.length === 0) return null;
    const enemies = livingInArena(state, opponent(cpu), arenaId);
    if (enemies.length === 0) return null;
    const maxEnemyAtk = Math.max(...enemies.map((e) => e.attack));
    const bestTarget = [...allies].sort((a, b) => {
      const aVulnerable = a.currentHealth <= maxEnemyAtk ? 1000 : 0;
      const bVulnerable = b.currentHealth <= maxEnemyAtk ? 1000 : 0;
      return (bVulnerable + b.attack) - (aVulnerable + a.attack);
    })[0];
    if (!bestTarget) return null;
    return { type: "USE_LEADER_ABILITY", player: cpu, targetTroopId: bestTarget.instanceId };
  }

  if (leaderDef.leaderAbilityId === "frost-convert") {
    if (getAvailableEssence(state, cpu).length < 2) return null;
    const arenaId = state.combat.arenaId;
    const allies = livingInArena(state, cpu, arenaId).filter((t) => !t.isFrostborn);
    if (allies.length === 0) return null;
    const bestTarget = [...allies].sort((a, b) => (b.attack + b.currentHealth) - (a.attack + a.currentHealth))[0];
    if (!bestTarget) return null;
    return { type: "USE_LEADER_ABILITY", player: cpu, targetTroopId: bestTarget.instanceId };
  }

  if (leaderDef.leaderAbilityId === "empathy-mark") {
    if (getAvailableEssence(state, cpu).length < 1) return null;
    const arenaId = state.combat.arenaId;
    const allies = livingInArena(state, cpu, arenaId).filter((t) => !t.hasEmpathy);
    if (allies.length === 0) return null;
    const enemies = livingInArena(state, opponent(cpu), arenaId);
    if (enemies.length === 0) return null;
    const bestTarget = [...allies].sort((a, b) => {
      const aFrontline = a.currentHealth >= 3 ? 100 : 0;
      const bFrontline = b.currentHealth >= 3 ? 100 : 0;
      return (bFrontline + b.currentHealth) - (aFrontline + a.currentHealth);
    })[0];
    if (!bestTarget) return null;
    return { type: "USE_LEADER_ABILITY", player: cpu, targetTroopId: bestTarget.instanceId };
  }

  return null;
}

function pickBestCombatAttack(
  state: GameState,
  cpu: PlayerId,
): GameAction | null {
  const combat = state.combat;
  if (!combat || state.turnPhase !== "combat" || combat.subPhase !== "strike") return null;
  if (getCombatAssigningPlayer(combat) !== cpu) return null;

  const { arenaId } = combat;
  const allies = livingInArena(state, cpu, arenaId).filter(
    (t) => !hasAttackedThisStrike(combat, t.instanceId),
  );
  const allEnemies = livingInArena(state, opponent(cpu), arenaId);
  if (allies.length === 0 || allEnemies.length === 0) return null;

  let best: { attackerId: string; targetId: string; score: number } | null = null;

  for (const attacker of allies) {
    const candidates = arenaUsesRandomCombatTargets(state, arenaId)
      ? [pickRandom(allEnemies)!]
      : getLegalCombatTargets(state, cpu, arenaId);

    const attackerDef = state.catalog[attacker.cardId];
    const hasFatiar = attackerDef ? cardHasKeyword(attackerDef, "fatiar") : false;

    for (const target of candidates) {
      const lethal = target.currentHealth <= attacker.attack;
      const overkill = attacker.attack - target.currentHealth;
      const tradeDies = attacker.currentHealth <= target.attack;

      let score = 0;
      score += lethal ? 1000 : 0;
      if (hasFatiar && lethal && overkill > 0 && allEnemies.length > 1) {
        score += 500 + overkill * 50;
      }
      score += 100 - target.currentHealth;
      score += attacker.attack;
      score -= tradeDies ? Math.round(target.attack * 0.3) : 0;
      if (!lethal && !tradeDies) {
        score += attacker.currentHealth > target.attack ? 20 : 0;
      }

      if (!best || score > best.score) {
        best = {
          attackerId: attacker.instanceId,
          targetId: target.instanceId,
          score,
        };
      }
    }
  }

  if (!best) return null;
  return {
    type: "EXECUTE_COMBAT_ATTACK",
    attackerId: best.attackerId,
    targetId: best.targetId,
  };
}

function hasMainPhaseWork(state: GameState, cpu: PlayerId): boolean {
  if (pickSacrificeForEssence(state, cpu)) return true;
  if (pickPlaySpell(state, cpu)) return true;
  if (pickPlayTroop(state, cpu)) return true;
  if (pickMoveTroop(state, cpu)) return true;
  if (pickDeclareCombat(state, cpu)) return true;
  return false;
}

function pickMainTurnAction(state: GameState, cpu: PlayerId): GameAction | null {
  if (state.matchPhase !== "playing" || state.turnPhase !== "main" || state.combat) {
    return null;
  }
  if (state.activePlayer !== cpu) return null;

  const leaderAb = pickLeaderAbility(state, cpu);
  if (leaderAb) return leaderAb;

  const combat = pickDeclareCombat(state, cpu);
  if (combat) return combat;

  const sacrifice = pickSacrificeForEssence(state, cpu);
  if (sacrifice) return sacrifice;

  const spell = pickPlaySpell(state, cpu);
  if (spell) return spell;

  const play = pickPlayTroop(state, cpu);
  if (play) return play;

  const move = pickMoveTroop(state, cpu);
  if (move) return move;

  const combatAfterMove = pickDeclareCombat(state, cpu);
  if (combatAfterMove) return combatAfterMove;

  const playAgain = pickPlayTroop(state, cpu);
  if (playAgain) return playAgain;

  const moveAgain = pickMoveTroop(state, cpu);
  if (moveAgain) return moveAgain;

  const contested = getContestedArenaNames(state, cpu);
  if (contested.length > 0) return null;

  if (hasMainPhaseWork(state, cpu)) return null;

  return { type: "END_TURN" };
}

function pickPendingSpellAction(state: GameState, cpuPlayer: PlayerId): GameAction | null {
  const pending = state.pendingSpell;
  if (!pending) return null;

  if (pending.awaitingCounterPayment && pending.caster === cpuPlayer) {
    const pay = canPayEssenceCost(state, cpuPlayer, { exhaust: 2 });
    return {
      type: "RESOLVE_COUNTER_PAYMENT",
      player: cpuPlayer,
      payTwoEssence: pay,
    };
  }

  if (pending.counterWindowOpen && opponent(pending.caster) === cpuPlayer) {
    for (const spellId of state.players[cpuPlayer].hand) {
      const def = state.catalog[state.troops[spellId]?.cardId ?? ""];
      if (def?.spellEffect === "counterspell" && canPlaySpellNow(state, cpuPlayer, def)) {
        if (canPayEssenceCost(state, cpuPlayer, getEssenceCost(def))) {
          return { type: "PLAY_SPELL", player: cpuPlayer, spellInstanceId: spellId };
        }
      }
    }
    return { type: "PASS_SPELL_COUNTER", player: cpuPlayer };
  }

  return null;
}

export function pickCpuAction(state: GameState, cpuPlayer: PlayerId): GameAction | null {
  const pendingAct = pickPendingSpellAction(state, cpuPlayer);
  if (pendingAct) return pendingAct;
  const cpu = cpuPlayer;

  if (state.matchPhase === "setup_arenas_p0" && cpu === 0) {
    if (state.selectedArenaIds[0].length < 2) return pickArenaSetup(state, 0);
    return null;
  }

  if (state.matchPhase === "setup_arenas_p1" && cpu === 1) {
    if (state.selectedArenaIds[1].length < 2) return pickArenaSetup(state, 1);
    return null;
  }

  if (state.matchPhase === "mulligan_p0" && cpu === 0) {
    return pickCpuMulligan(state, 0);
  }

  if (state.matchPhase === "mulligan_p1" && cpu === 1) {
    return pickCpuMulligan(state, 1);
  }

  if (state.matchPhase === "phase_end_choice_p1" && cpu === 1) {
    return pickPostPhaseChoice(state, 1);
  }
  if (state.matchPhase === "phase_end_choice_p0" && cpu === 0) {
    return pickPostPhaseChoice(state, 0);
  }

  if (state.matchPhase === "setup_abismo_winner" && state.phaseWinner === cpu) {
    if (state.arenaSetupPicks.length < 2) return pickArenaSetup(state, cpu);
    return null;
  }

  if (state.matchPhase === "setup_abismo_loser" && state.phaseWinner !== null) {
    if (cpu === opponent(state.phaseWinner)) {
      return pickArenaSetup(state, cpu);
    }
    return null;
  }

  if (state.matchPhase === "setup_rr_winner" && state.phaseWinner === cpu) {
    return pickArenaSetup(state, cpu);
  }

  if (state.combat?.subPhase === "magic") {
    const magic = pickCpuCombatMagic(state, cpu);
    if (magic) return magic;
  }

  const reactive = pickCpuReactiveSpell(state, cpu);
  if (reactive) return reactive;

  const leaderAbility = pickLeaderAbility(state, cpu);
  if (leaderAbility) return leaderAbility;

  const combatAction = pickBestCombatAttack(state, cpu);
  if (combatAction) return combatAction;

  return pickMainTurnAction(state, cpu);
}

export function cpuControlsPhase(state: GameState, cpuPlayer: PlayerId): boolean {
  if (state.matchPhase === "finished") return false;

  if (state.matchPhase === "setup_arenas_p0" && cpuPlayer === 0) return true;
  if (state.matchPhase === "setup_arenas_p1" && cpuPlayer === 1) return true;
  if (state.matchPhase === "mulligan_p0" && cpuPlayer === 0) return true;
  if (state.matchPhase === "mulligan_p1" && cpuPlayer === 1) return true;
  if (state.matchPhase === "phase_end_choice_p0" && cpuPlayer === 0) return true;
  if (state.matchPhase === "phase_end_choice_p1" && cpuPlayer === 1) return true;
  if (state.matchPhase === "setup_abismo_winner" && state.phaseWinner === cpuPlayer) {
    return true;
  }
  if (
    state.matchPhase === "setup_abismo_loser" &&
    state.phaseWinner !== null &&
    cpuPlayer === opponent(state.phaseWinner)
  ) {
    return true;
  }
  if (state.matchPhase === "setup_rr_winner" && state.phaseWinner === cpuPlayer) {
    return true;
  }

  const pending = state.pendingSpell;
  if (pending?.awaitingCounterPayment && pending.caster === cpuPlayer) return true;
  if (pending?.counterWindowOpen && opponent(pending.caster) === cpuPlayer) return true;

  if (state.combat) {
    if (state.combat.subPhase === "magic") {
      if (!state.combat.magicPassed[cpuPlayer]) return true;
      return cpuHasPlayableSpell(state, cpuPlayer);
    }
    if (getCombatAssigningPlayer(state.combat) === cpuPlayer) return true;
    return cpuHasPlayableSpell(state, cpuPlayer);
  }

  if (state.matchPhase === "playing" && state.activePlayer === cpuPlayer && state.turnPhase === "main") {
    return true;
  }

  if (state.matchPhase === "playing" && state.turnPhase === "main") {
    return cpuHasPlayableSpell(state, cpuPlayer);
  }

  if (state.matchPhase === "playing" && state.turnPhase === "combat") {
    return cpuHasPlayableSpell(state, cpuPlayer);
  }

  return false;
}
