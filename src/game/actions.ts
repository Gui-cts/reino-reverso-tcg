import {
  endCombatStrike,
  executeCombatAttack,
  getContestedArenaNames,
  passCombatMagic,
  startCombat,
} from "./combat";
import { setConquestWatchOnEndTurn } from "./conquest";
import {
  appendLog,
  countTroopsInZone,
  getAvailableEssence,
  getAvailableNonTempEssence,
  payCorruptionCost,
  payEssenceCost,
  getTroopName,
  opponent,
  sanitizePlayerHands,
} from "./helpers";
import { arenaBlocksNormalExit } from "./arena-effects";
import {
  applyPostPhaseChoiceForPlayer,
  finalizePhaseTransition,
  finishArenaSetupAndResume,
} from "./phase-transition";
import { drawFromDeck, finalizeArenas } from "./state";
import { runTurnBegin } from "./turn";
import { applyRRNonResponsePenaltyAtEndTurn } from "./reino-reverso";
import {
  canAffordCardCost,
  formatCardCost,
  getCorruptionCost,
  getEssenceCost,
} from "./card-meta";
import { troopCanFlyBetweenArenas, troopEntersReadyOnDeploy } from "./keywords";
import {
  isSpellCard,
  isTroopCard,
  passSpellCounter,
  playSpell,
  resolveCounterPayment,
} from "./spells";
import { buryDeadTroops } from "./troop-cleanup";
import { isLeaderFormCard } from "./card-meta";
import type { GameAction, GameState, PlayerId } from "./types";
import { LEADER_EVOLUTION_CORRUPTION_COST, MAX_TROOPS_PER_ZONE, maxCorruptionForPhase } from "./types";

function endPlayerTurn(state: GameState): GameState {
  const player = state.activePlayer;
  let next = setConquestWatchOnEndTurn(state, player);

  if (next.combat) {
    return { ...next, log: appendLog(next, "Termine o combate antes de encerrar o turno.") };
  }

  const contested = getContestedArenaNames(next, player);
  if (contested.length > 0) {
    return {
      ...next,
      log: appendLog(
        next,
        `Há tropas inimigas em: ${contested.join(", ")}. Declare combate antes de encerrar o turno.`,
      ),
    };
  }

  if (next.gamePhase === "reino-reverso") {
    next = applyRRNonResponsePenaltyAtEndTurn(next, player);
    if (next.matchPhase === "finished") return next;
  }

  const nextPlayer = opponent(player);
  next = {
    ...next,
    turnNumber: next.turnNumber + 1,
    log: appendLog(next, `Fim do turno — vez do Jogador ${nextPlayer + 1}`),
  };

  return runTurnBegin(next, nextPlayer);
}

function handleMulligan(
  state: GameState,
  player: PlayerId,
  handIndices: number[],
): GameState {
  if (state.mulliganUsed[player]) {
    return { ...state, log: appendLog(state, "Mulligan já usado nesta partida.") };
  }

  const indices = [...new Set(handIndices)].sort((a, b) => b - a);
  if (indices.some((i) => i < 0 || i >= state.players[player].hand.length)) {
    return state;
  }

  const pl = { ...state.players[player] };
  const troops = { ...state.troops };
  const cardIdsToReturn: string[] = [];
  for (const i of indices) {
    const troopId = pl.hand[i];
    if (!troopId) continue;
    const t = troops[troopId];
    if (t) cardIdsToReturn.push(t.cardId);
    delete troops[troopId];
    pl.hand.splice(i, 1);
  }

  pl.deck = shuffleDeck([...pl.deck, ...cardIdsToReturn]);

  let next: GameState = {
    ...state,
    troops,
    players: [...state.players] as GameState["players"],
    mulliganUsed: [...state.mulliganUsed] as [boolean, boolean],
  };
  (next.players as GameState["players"])[player] = pl;
  next.mulliganUsed[player] = true;

  next = drawFromDeck(next, player, cardIdsToReturn.length);
  next = {
    ...next,
    log: appendLog(
      next,
      `Jogador ${player + 1} fez mulligan de ${cardIdsToReturn.length} carta(s).`,
    ),
  };

  return advanceMulliganPhase(next);
}

function shuffleDeck(deck: string[]): string[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function advanceMulliganPhase(state: GameState): GameState {
  if (state.matchPhase === "mulligan_p0") {
    return { ...state, matchPhase: "mulligan_p1", log: appendLog(state, "Mulligan do Jogador 2.") };
  }
  if (state.matchPhase === "mulligan_p1") {
    const started = {
      ...state,
      matchPhase: "playing" as const,
      log: appendLog(state, "Partida iniciada! Jogador 1 começa."),
    };
    return runTurnBegin(started, 0);
  }
  return state;
}

function playTroop(state: GameState, troopId: string): GameState {
  if (state.matchPhase !== "playing" || state.turnPhase !== "main" || state.combat) {
    return state;
  }

  const player = state.activePlayer;
  const pl = state.players[player];
  if (!pl.hand.includes(troopId)) return state;

  const troop = state.troops[troopId];
  if (!troop) return state;

  if (troop.owner !== player) {
    return {
      ...state,
      log: appendLog(state, "Esta carta não pertence ao jogador da vez."),
    };
  }

  const def = state.catalog[troop.cardId];
  if (!def) return state;

  if (isLeaderFormCard(def)) {
    return {
      ...state,
      log: appendLog(state, `${def.name} é uma forma do Líder — sacrifique (✦) para recursos ou use para evoluir (5 Corrupção).`),
    };
  }

  if (!isTroopCard(def)) {
    return {
      ...state,
      log: appendLog(state, "Magias devem ser lançadas em uma tropa — selecione a magia e clique no alvo."),
    };
  }

  const payment = getEssenceCost(def);
  const corruptionCost = getCorruptionCost(def);

  if (!canAffordCardCost(state, player, def, payment)) {
    const pl2 = state.players[player];
    const corMsg =
      corruptionCost > 0 && pl2.corruption < corruptionCost
        ? ` Corrupção: precisa ${corruptionCost}, tem ${pl2.corruption}.`
        : "";
    return {
      ...state,
      log: appendLog(
        state,
        `Recursos insuficientes (${formatCardCost(def)}; essência pronta: ${getAvailableEssence(state, player).length}).${corMsg}`,
      ),
    };
  }

  const nonTempAvail = getAvailableNonTempEssence(state, player);
  if (nonTempAvail.length < payment.exhaust) {
    return {
      ...state,
      log: appendLog(state, "Essência temporária só pode pagar feitiços — insuficiente para tropas."),
    };
  }

  if (countTroopsInZone(state, player, "base") >= MAX_TROOPS_PER_ZONE) {
    return { ...state, log: appendLog(state, "Base cheia (máx. 3 tropas).") };
  }

  const paid = payEssenceCost(state, player, payment);
  if (!paid.ok) {
    return { ...state, log: appendLog(state, "Não foi possível pagar o custo em Essência.") };
  }
  let next = paid.state;

  const paidCorruption = payCorruptionCost(next, player, corruptionCost);
  if (!paidCorruption.ok) {
    return { ...state, log: appendLog(next, "Não foi possível pagar o custo em Corrupção.") };
  }
  next = paidCorruption.state;
  const hand = next.players[player].hand.filter((id) => id !== troopId);
  const players = [...next.players] as GameState["players"];
  players[player] = { ...next.players[player], hand };

  const entersReady = troopEntersReadyOnDeploy(def);
  const troops = { ...next.troops };
  troops[troopId] = {
    ...troop,
    owner: player,
    zone: "base",
    arenaId: null,
    exhausted: !entersReady,
    currentHealth: def.health,
    attack: def.attack,
    attachedSpell: troop.attachedSpell,
    healthBonus: troop.healthBonus,
  };

  next = {
    ...next,
    players,
    troops,
    log: appendLog(
      next,
      `Jogador ${player + 1} convocou ${def.name} na base (${entersReady ? "Investida — pronta" : "exausta"}). Custo: ${formatCardCost(def)}.`,
    ),
  };
  return sanitizePlayerHands(next);
}

function sacrificeEssence(state: GameState, troopId: string): GameState {
  if (state.turnPhase !== "main" || state.combat) return state;
  const player = state.activePlayer;
  const pl = state.players[player];
  if (pl.sacrificedThisTurn) {
    return { ...state, log: appendLog(state, "Já sacrificou essência neste turno.") };
  }

  if (!pl.hand.includes(troopId)) return state;

  const troop = state.troops[troopId];
  if (!troop) return state;

  if (troop.owner !== player) {
    return {
      ...state,
      log: appendLog(state, "Esta carta não pertence ao jogador da vez."),
    };
  }

  const def = state.catalog[troop.cardId];
  if (isSpellCard(def)) {
    return { ...state, log: appendLog(state, "Magias não podem virar Essência.") };
  }
  if (!def?.hasEssenceSymbol) {
    return { ...state, log: appendLog(state, "Esta carta não tem símbolo de Essência.") };
  }

  const reward = def.sacrificeReward ?? { essence: 1, corruption: 0 };
  let idCounter = state.nextInstanceId;
  const newEssenceIds: string[] = [];
  let essencePool = { ...state.essencePool };

  for (let i = 0; i < reward.essence; i++) {
    const essenceId = `essence-${idCounter++}`;
    essencePool[essenceId] = {
      instanceId: essenceId,
      cardId: troop.cardId,
      owner: player,
      exhausted: false,
    };
    newEssenceIds.push(essenceId);
  }

  const cap = maxCorruptionForPhase(state.gamePhase);
  const corruptionGain = Math.min(reward.corruption, cap - pl.corruption);

  const hand = pl.hand.filter((hid) => hid !== troopId);
  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...pl,
    hand,
    essenceIds: [...pl.essenceIds, ...newEssenceIds],
    sacrificedThisTurn: true,
    corruption: pl.corruption + corruptionGain,
  };

  const troops = { ...state.troops };
  delete troops[troopId];

  const parts: string[] = [];
  if (reward.essence > 0) parts.push(`${reward.essence} Essência`);
  if (corruptionGain > 0) parts.push(`${corruptionGain} Corrupção`);
  const rewardLabel = parts.join(" + ") || "Essência";

  return sanitizePlayerHands({
    ...state,
    players,
    troops,
    essencePool,
    nextInstanceId: idCounter,
    log: appendLog(
      state,
      `Jogador ${player + 1} sacrificou ${def.name} → ${rewardLabel}.`,
    ),
  });
}

function moveTroop(
  state: GameState,
  troopId: string,
  to: "base" | "arena",
  arenaId?: string,
): GameState {
  if (state.turnPhase !== "main" || state.combat) return state;

  const troop = state.troops[troopId];
  if (!troop || troop.owner !== state.activePlayer) return state;
  if (troop.pinned) {
    return { ...state, log: appendLog(state, "Tropa presa — não pode mover.") };
  }
  if (troop.movementLocked) {
    return {
      ...state,
      log: appendLog(
        state,
        `${getTroopName(state, troop)} está vinculada — não pode se mover neste turno.`,
      ),
    };
  }
  if (troop.exhausted) {
    return {
      ...state,
      log: appendLog(
        state,
        `${getTroopName(state, troop)} está exausta — passe o turno para desvirar (preparação).`,
      ),
    };
  }

  const player = state.activePlayer;

  if (to === "base") {
    if (troop.zone !== "arena") return state;
    if (troop.arenaId && arenaBlocksNormalExit(state, troop.arenaId)) {
      const arena = state.arenas.find((a) => a.id === troop.arenaId);
      return {
        ...state,
        log: appendLog(
          state,
          `${arena?.name ?? "Arena"} — tropas não podem sair pelo movimento normal.`,
        ),
      };
    }
    if (countTroopsInZone(state, player, "base") >= MAX_TROOPS_PER_ZONE) {
      return { ...state, log: appendLog(state, "Base cheia.") };
    }
    const troops = { ...state.troops };
    troops[troopId] = { ...troop, zone: "base", arenaId: null, exhausted: true };
    return {
      ...state,
      troops,
      log: appendLog(state, `${getTroopName(state, troop)} retornou à base.`),
    };
  }

  if (!arenaId) return state;
  const arena = state.arenas.find((a) => a.id === arenaId);
  if (!arena) return state;
  if (arena.dominatedBy !== null) {
    return {
      ...state,
      log: appendLog(
        state,
        `${arena.name} está dominada — não é possível enviar tropas para lá.`,
      ),
    };
  }
  if (troop.zone === "arena" && troop.arenaId === arenaId) {
    return { ...state, log: appendLog(state, "A tropa já está nesta arena.") };
  }

  if (troop.zone === "arena" && troop.arenaId !== arenaId) {
    if (!troopCanFlyBetweenArenas(state, troop)) {
      return {
        ...state,
        log: appendLog(state, "Só tropas com Voar podem mudar de arena diretamente."),
      };
    }
    if (troop.arenaId && arenaBlocksNormalExit(state, troop.arenaId)) {
      const from = state.arenas.find((a) => a.id === troop.arenaId);
      return {
        ...state,
        log: appendLog(
          state,
          `${from?.name ?? "Arena"} — tropas não podem sair pelo movimento normal.`,
        ),
      };
    }
    if (countTroopsInZone(state, player, "arena", arenaId) >= MAX_TROOPS_PER_ZONE) {
      return { ...state, log: appendLog(state, "Arena de destino cheia.") };
    }
    const troops = { ...state.troops };
    troops[troopId] = { ...troop, zone: "arena", arenaId, exhausted: true };
    return {
      ...state,
      troops,
      log: appendLog(
        state,
        `${getTroopName(state, troop)} voou para ${arena.name} (exausta).`,
      ),
    };
  }

  if (troop.zone !== "base") return state;
  if (countTroopsInZone(state, player, "arena", arenaId) >= MAX_TROOPS_PER_ZONE) {
    return { ...state, log: appendLog(state, "Arena cheia.") };
  }

  const troops = { ...state.troops };
  troops[troopId] = { ...troop, zone: "arena", arenaId, exhausted: true };
  return {
    ...state,
    troops,
    log: appendLog(state, `${getTroopName(state, troop)} foi para ${arena.name}.`),
  };
}

function findArenaDef(state: GameState, arenaId: string): GameState["arenaPool"][0] | undefined {
  return state.arenaPool.find((a) => {
    if (a.id !== arenaId || a.phase !== state.gamePhase) return false;
    if (a.neutral && state.gamePhase !== "reino-reverso") return false;
    return true;
  });
}

function selectMundoNormalArena(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  const expected = player === 0 ? "setup_arenas_p0" : "setup_arenas_p1";
  if (state.matchPhase !== expected) return state;
  if (!findArenaDef(state, arenaId)) return state;

  const selected = [...state.selectedArenaIds] as [string[], string[]];
  const list = selected[player];
  if (list.includes(arenaId)) {
    selected[player] = list.filter((id) => id !== arenaId);
  } else if (list.length < 2) {
    const taken = selected[opponent(player)];
    if (taken.includes(arenaId)) {
      return { ...state, log: appendLog(state, "Arena já escolhida pelo outro jogador.") };
    }
    selected[player] = [...list, arenaId];
  }

  let next: GameState = { ...state, selectedArenaIds: selected };

  if (selected[player].length === 2) {
    if (player === 0) {
      next = {
        ...next,
        matchPhase: "setup_arenas_p1",
        log: appendLog(next, "Jogador 2: escolha 2 arenas."),
      };
    } else {
      next = finalizeArenas(next);
    }
  }

  return next;
}

function selectAbismoWinnerArena(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  if (state.matchPhase !== "setup_abismo_winner" || state.phaseWinner !== player) {
    return state;
  }
  if (!findArenaDef(state, arenaId)) return state;

  let picks = [...state.arenaSetupPicks];
  if (picks.includes(arenaId)) {
    picks = picks.filter((id) => id !== arenaId);
  } else if (picks.length < 2) {
    picks = [...picks, arenaId];
  }

  if (picks.length === 2) {
    const loser = opponent(player);
    return {
      ...state,
      arenaSetupPicks: picks,
      matchPhase: "setup_abismo_loser",
      log: appendLog(
        state,
        `Jogador ${loser + 1} escolhe 1 arena do Abismo (restante).`,
      ),
    };
  }

  return { ...state, arenaSetupPicks: picks };
}

function selectAbismoLoserArena(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  const winner = state.phaseWinner;
  if (state.matchPhase !== "setup_abismo_loser" || winner === null) return state;
  if (player !== opponent(winner)) return state;
  if (!findArenaDef(state, arenaId)) return state;
  if (state.arenaSetupPicks.includes(arenaId)) {
    return { ...state, log: appendLog(state, "Arena já escolhida pelo vencedor.") };
  }

  const allPicks = [...state.arenaSetupPicks, arenaId];
  const ready = finishArenaSetupAndResume(state, allPicks, winner);
  return runTurnBegin(ready, winner);
}

function selectReinoReversoArena(
  state: GameState,
  player: PlayerId,
  arenaId: string,
): GameState {
  if (state.matchPhase !== "setup_rr_winner" || state.phaseWinner !== player) {
    return state;
  }
  if (!findArenaDef(state, arenaId)) return state;

  const ready = finishArenaSetupAndResume(state, [arenaId], player);
  return runTurnBegin(ready, player);
}

function selectArena(state: GameState, player: PlayerId, arenaId: string): GameState {
  switch (state.matchPhase) {
    case "setup_arenas_p0":
    case "setup_arenas_p1":
      return selectMundoNormalArena(state, player, arenaId);
    case "setup_abismo_winner":
      return selectAbismoWinnerArena(state, player, arenaId);
    case "setup_abismo_loser":
      return selectAbismoLoserArena(state, player, arenaId);
    case "setup_rr_winner":
      return selectReinoReversoArena(state, player, arenaId);
    default:
      return state;
  }
}

function handlePostPhaseChoice(
  state: GameState,
  player: PlayerId,
  choice: "essence" | "corruption" | "recycle",
): GameState {
  const expected: GameState["matchPhase"] =
    player === 0 ? "phase_end_choice_p0" : "phase_end_choice_p1";
  if (state.matchPhase !== expected) {
    return {
      ...state,
      log: appendLog(
        state,
        player === 0
          ? "Aguardando a escolha pós-fase do Jogador 1."
          : "Aguardando a escolha pós-fase do Jogador 2.",
      ),
    };
  }

  let next = applyPostPhaseChoiceForPlayer(state, player, choice);

  if (player === 0) {
    return {
      ...next,
      matchPhase: "phase_end_choice_p1",
      log: appendLog(next, "Jogador 2 — escolha pós-fase (suas tropas nas arenas)."),
    };
  }

  return finalizePhaseTransition(next);
}

function useLeaderAbility(
  state: GameState,
  player: PlayerId,
  targetTroopId: string,
): GameState {
  if (state.matchPhase !== "playing") return state;
  if (!state.combat && state.activePlayer !== player) {
    return state;
  }
  const pl = state.players[player];
  if (pl.leaderExhausted) {
    return { ...state, log: appendLog(state, "Líder exausto — desvira na preparação.") };
  }
  if (pl.leaderAbilityUsedThisTurn) {
    return { ...state, log: appendLog(state, "Habilidade do Líder já usada neste turno.") };
  }
  if (!pl.leaderId) {
    return { ...state, log: appendLog(state, "Nenhum Líder selecionado.") };
  }
  const leaderDef = state.catalog[pl.leaderId];
  if (!leaderDef?.leaderAbilityId) {
    return { ...state, log: appendLog(state, "Este Líder não tem habilidade ativa.") };
  }

  if (leaderDef.leaderAbilityId === "shield") {
    if (!state.combat) {
      return { ...state, log: appendLog(state, "Escudo só pode ser usado durante o combate.") };
    }

    const shieldCost = { exhaust: 2 };
    const canPay = getAvailableEssence(state, player).length >= shieldCost.exhaust;
    if (!canPay) {
      return {
        ...state,
        log: appendLog(state, `Escudo exige ${shieldCost.exhaust} Essência pronta (tem ${getAvailableEssence(state, player).length}).`),
      };
    }

    const target = state.troops[targetTroopId];
    if (!target || target.owner !== player) {
      return { ...state, log: appendLog(state, "Alvo inválido — escolha uma tropa aliada.") };
    }
    if (target.zone !== "arena") {
      return { ...state, log: appendLog(state, "Alvo deve estar em uma arena.") };
    }
    if (target.shielded) {
      return { ...state, log: appendLog(state, "Esta tropa já tem escudo.") };
    }

    const paid = payEssenceCost(state, player, shieldCost);
    if (!paid.ok) {
      return { ...state, log: appendLog(state, "Não foi possível pagar o custo do Escudo.") };
    }
    let next = paid.state;

    const troops = { ...next.troops };
    troops[targetTroopId] = { ...target, shielded: true };
    const players = [...next.players] as GameState["players"];
    players[player] = { ...players[player], leaderAbilityUsedThisTurn: true, leaderExhausted: true };

    const troopName = next.catalog[target.cardId]?.name ?? targetTroopId;
    return {
      ...next,
      troops,
      players,
      log: appendLog(
        next,
        `Jogador ${player + 1} usou Escudo do Líder em ${troopName} (−2 Essência) — próximo dano será absorvido.`,
      ),
    };
  }

  if (leaderDef.leaderAbilityId === "frost-convert") {
    if (!state.combat) {
      return { ...state, log: appendLog(state, "Cria do Inverno só pode ser usada durante o combate.") };
    }

    const frostCost = { exhaust: 2 };
    const canPay = getAvailableEssence(state, player).length >= frostCost.exhaust;
    if (!canPay) {
      return {
        ...state,
        log: appendLog(state, `Cria do Inverno exige ${frostCost.exhaust} Essência pronta (tem ${getAvailableEssence(state, player).length}).`),
      };
    }

    const target = state.troops[targetTroopId];
    if (!target || target.owner !== player) {
      return { ...state, log: appendLog(state, "Alvo inválido — escolha uma tropa aliada.") };
    }
    if (target.zone !== "arena") {
      return { ...state, log: appendLog(state, "Alvo deve estar em uma arena.") };
    }
    if (target.isFrostborn) {
      return { ...state, log: appendLog(state, "Esta tropa já é uma Cria do Inverno.") };
    }

    const paid = payEssenceCost(state, player, frostCost);
    if (!paid.ok) {
      return { ...state, log: appendLog(state, "Não foi possível pagar o custo de Cria do Inverno.") };
    }
    let next = paid.state;

    const troops = { ...next.troops };
    troops[targetTroopId] = { ...target, isFrostborn: true };
    const players = [...next.players] as GameState["players"];
    players[player] = { ...players[player], leaderAbilityUsedThisTurn: true, leaderExhausted: true };

    const troopName = next.catalog[target.cardId]?.name ?? targetTroopId;
    return {
      ...next,
      troops,
      players,
      log: appendLog(
        next,
        `Jogador ${player + 1} transformou ${troopName} em Cria do Inverno (−2 Essência) — ganha comportamento de gelo.`,
      ),
    };
  }

  if (leaderDef.leaderAbilityId === "empathy-mark") {
    if (state.combat === null && state.turnPhase !== "main") {
      return { ...state, log: appendLog(state, "Empatia pode ser usada na fase principal ou no combate.") };
    }

    const empathyCost = { exhaust: 1 };
    const canPay = getAvailableEssence(state, player).length >= empathyCost.exhaust;
    if (!canPay) {
      return {
        ...state,
        log: appendLog(state, `Empatia exige ${empathyCost.exhaust} Essência pronta (tem ${getAvailableEssence(state, player).length}).`),
      };
    }

    const target = state.troops[targetTroopId];
    if (!target || target.owner !== player) {
      return { ...state, log: appendLog(state, "Alvo inválido — escolha uma tropa aliada.") };
    }
    if (target.zone !== "arena") {
      return { ...state, log: appendLog(state, "Alvo deve estar em uma arena.") };
    }
    if (target.hasEmpathy) {
      return { ...state, log: appendLog(state, "Esta tropa já tem Empatia.") };
    }

    const paid = payEssenceCost(state, player, empathyCost);
    if (!paid.ok) {
      return { ...state, log: appendLog(state, "Não foi possível pagar o custo de Empatia.") };
    }
    let next = paid.state;

    const troops = { ...next.troops };
    troops[targetTroopId] = { ...target, hasEmpathy: true, shielded: true };
    const players = [...next.players] as GameState["players"];
    players[player] = { ...players[player], leaderAbilityUsedThisTurn: true, leaderExhausted: true };

    const troopName = next.catalog[target.cardId]?.name ?? targetTroopId;
    return {
      ...next,
      troops,
      players,
      log: appendLog(
        next,
        `Jogador ${player + 1} marcou ${troopName} com Empatia (−1 Essência) — ganha Protetor + Escudo.`,
      ),
    };
  }

  if (leaderDef.leaderAbilityId === "arcane-melody") {
    if (state.turnPhase !== "main" || state.combat) {
      return { ...state, log: appendLog(state, "Melodia Arcana só pode ser usada na fase principal (sem combate).") };
    }

    const isUpgraded = pl.leaderId === "klaus-delta";
    const count = isUpgraded ? 2 : 1;

    let idCounter = state.nextInstanceId;
    const essencePool = { ...state.essencePool };
    const newEssenceIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const essenceId = `essence-temp-${idCounter++}`;
      essencePool[essenceId] = {
        instanceId: essenceId,
        cardId: pl.leaderId!,
        owner: player,
        exhausted: false,
        spellOnly: true,
      };
      newEssenceIds.push(essenceId);
    }

    const players = [...state.players] as GameState["players"];
    players[player] = {
      ...pl,
      essenceIds: [...pl.essenceIds, ...newEssenceIds],
      leaderAbilityUsedThisTurn: true,
      leaderExhausted: true,
    };

    return {
      ...state,
      players,
      essencePool,
      nextInstanceId: idCounter,
      log: appendLog(
        state,
        `Jogador ${player + 1} usou Melodia Arcana — +${count} Essência temporária (só feitiços). Líder exausto.`,
      ),
    };
  }

  return state;
}

function evolveLeader(
  state: GameState,
  player: PlayerId,
  formId: string,
  formInstanceId: string,
): GameState {
  if (state.matchPhase !== "playing" || state.turnPhase !== "main" || state.combat) {
    return state;
  }
  if (state.activePlayer !== player) {
    return { ...state, log: appendLog(state, "Não é seu turno.") };
  }

  const pl = state.players[player];
  if (!pl.leaderId) {
    return { ...state, log: appendLog(state, "Nenhum Líder selecionado.") };
  }
  const currentLeader = state.catalog[pl.leaderId];
  if (!currentLeader?.leaderFormIds?.includes(formId)) {
    return { ...state, log: appendLog(state, "Forma de evolução inválida.") };
  }

  if (!pl.hand.includes(formInstanceId)) {
    return { ...state, log: appendLog(state, "Você precisa ter a carta da forma na mão.") };
  }
  const formInstance = state.troops[formInstanceId];
  if (!formInstance || formInstance.cardId !== formId) {
    return { ...state, log: appendLog(state, "Carta inválida para evolução.") };
  }

  const newForm = state.catalog[formId];
  if (!newForm) {
    return { ...state, log: appendLog(state, "Forma de Líder não encontrada no catálogo.") };
  }
  if (pl.corruption < LEADER_EVOLUTION_CORRUPTION_COST) {
    return {
      ...state,
      log: appendLog(
        state,
        `Corrupção insuficiente para evoluir (precisa ${LEADER_EVOLUTION_CORRUPTION_COST}, tem ${pl.corruption}).`,
      ),
    };
  }

  const hand = pl.hand.filter((id) => id !== formInstanceId);
  const troops = { ...state.troops };
  delete troops[formInstanceId];

  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...pl,
    hand,
    leaderId: formId,
    corruption: pl.corruption - LEADER_EVOLUTION_CORRUPTION_COST,
  };

  return sanitizePlayerHands({
    ...state,
    players,
    troops,
    log: appendLog(
      state,
      `Jogador ${player + 1} evoluiu o Líder para ${newForm.name}! (carta consumida, −${LEADER_EVOLUTION_CORRUPTION_COST} Corrupção)`,
    ),
  });
}

function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SELECT_ARENA":
      return selectArena(state, action.player, action.arenaId);

    case "MULLIGAN":
      return handleMulligan(state, action.player, action.handIndices);

    case "SKIP_MULLIGAN":
      if (state.mulliganUsed[action.player]) return advanceMulliganPhase(state);
      return advanceMulliganPhase({
        ...state,
        mulliganUsed: state.mulliganUsed.map((u, i) =>
          i === action.player ? true : u,
        ) as [boolean, boolean],
        log: appendLog(state, `Jogador ${action.player + 1} manteve a mão.`),
      });

    case "PLAY_TROOP":
      return playTroop(state, action.troopId);

    case "PLAY_SPELL":
      return playSpell(state, action.player, action.spellInstanceId, action.targetTroopId);

    case "PASS_SPELL_COUNTER":
      return passSpellCounter(state, action.player);

    case "RESOLVE_COUNTER_PAYMENT":
      return resolveCounterPayment(state, action.player, action.payTwoEssence);

    case "PASS_COMBAT_MAGIC":
      return passCombatMagic(state, action.player);

    case "SACRIFICE_ESSENCE":
      return sacrificeEssence(state, action.troopId);

    case "MOVE_TROOP":
      return moveTroop(state, action.troopId, action.to, action.arenaId);

    case "DECLARE_COMBAT":
      if (state.turnPhase !== "main") return state;
      return startCombat(state, action.arenaId);

    case "EXECUTE_COMBAT_ATTACK":
      if (!state.combat) return state;
      return executeCombatAttack(state, action.attackerId, action.targetId);

    case "END_COMBAT_STRIKE":
      return endCombatStrike(state);

    case "END_TURN":
      return endPlayerTurn(state);

    case "POST_PHASE_CHOICE":
      return handlePostPhaseChoice(state, action.player, action.choice);

    case "USE_LEADER_ABILITY":
      return useLeaderAbility(state, action.player, action.targetTroopId);

    case "EVOLVE_LEADER":
      return evolveLeader(state, action.player, action.formId, action.formInstanceId);

    default:
      return state;
  }
}

export function dispatch(state: GameState, action: GameAction): GameState {
  if (state.matchPhase === "finished") return state;
  return buryDeadTroops(applyAction(state, action));
}
