// src/net/room-service.ts
import { randomBytes } from "node:crypto";

// src/game/helpers.ts
function opponent(p) {
  return p === 0 ? 1 : 0;
}
function appendLog(state, message) {
  const next = [...state.log, message];
  return next.length > 80 ? next.slice(-80) : next;
}
function nextInstanceId(state) {
  return [state.nextInstanceId, state.nextInstanceId + 1];
}
function getTroopsInZone(state, player, zone, arenaId) {
  return Object.values(state.troops).filter((t) => {
    if (t.owner !== player || t.zone !== zone || t.currentHealth <= 0) return false;
    if (zone === "arena") return t.arenaId === arenaId;
    return true;
  });
}
function countTroopsInZone(state, player, zone, arenaId) {
  return getTroopsInZone(state, player, zone, arenaId).length;
}
function getPlayerEssence(state, player) {
  return state.players[player].essenceIds.map((id) => state.essencePool[id]).filter((e) => Boolean(e) && e.owner === player);
}
function getAvailableEssence(state, player) {
  return getPlayerEssence(state, player).filter((e) => !e.exhausted);
}
function getAvailableNonTempEssence(state, player) {
  return getAvailableEssence(state, player).filter((e) => !e.spellOnly);
}
function getArena(state, arenaId) {
  const arena = state.arenas.find((a) => a.id === arenaId);
  if (!arena) throw new Error(`Arena n\xE3o encontrada: ${arenaId}`);
  return arena;
}
function getCardName(state, cardId) {
  return state.catalog[cardId]?.name ?? cardId;
}
function getTroopName(state, troop) {
  return getCardName(state, troop.cardId);
}
function canPayEssenceCost(state, player, payment) {
  const available = getAvailableEssence(state, player);
  const sacrifice = payment.sacrifice ?? 0;
  if (available.length < payment.exhaust) return false;
  if (sacrifice > payment.exhaust) return false;
  return true;
}
function payEssenceCost(state, player, payment, preferTemp = false) {
  const sacrifice = payment.sacrifice ?? 0;
  const pool = getPlayerEssence(state, player);
  if (pool.length < payment.exhaust || sacrifice > payment.exhaust) {
    return { state, ok: false };
  }
  let next = state;
  const exhaustedIds = [];
  for (let i = 0; i < payment.exhaust; i++) {
    const available = getAvailableEssence(next, player).sort(
      (a, b) => preferTemp ? (b.spellOnly ? 1 : 0) - (a.spellOnly ? 1 : 0) : (a.spellOnly ? 1 : 0) - (b.spellOnly ? 1 : 0)
    );
    const pick = available[0] ?? getPlayerEssence(next, player).find((e) => !exhaustedIds.includes(e.instanceId));
    if (!pick) return { state, ok: false };
    const essencePool = { ...next.essencePool };
    essencePool[pick.instanceId] = { ...pick, exhausted: true };
    exhaustedIds.push(pick.instanceId);
    next = { ...next, essencePool };
  }
  if (sacrifice > 0) {
    const toSacrifice = exhaustedIds.slice(0, sacrifice);
    let essencePool = { ...next.essencePool };
    let essenceIds = [...next.players[player].essenceIds];
    let essenceDiscard = [...next.players[player].essenceDiscard];
    const players = [...next.players];
    for (const id of toSacrifice) {
      const inst = essencePool[id];
      if (!inst) continue;
      essenceDiscard.push(inst.cardId);
      delete essencePool[id];
      essenceIds = essenceIds.filter((eid) => eid !== id);
    }
    players[player] = { ...players[player], essenceIds, essenceDiscard };
    next = { ...next, players, essencePool };
  }
  return { state: next, ok: true };
}
function canPayCorruptionCost(state, player, amount) {
  if (amount <= 0) return true;
  return state.players[player].corruption >= amount;
}
function payCorruptionCost(state, player, amount) {
  if (amount <= 0) return { state, ok: true };
  if (!canPayCorruptionCost(state, player, amount)) {
    return { state, ok: false };
  }
  const players = [...state.players];
  players[player] = {
    ...players[player],
    corruption: players[player].corruption - amount
  };
  return { state: { ...state, players }, ok: true };
}
function sanitizePlayerHands(state) {
  const players = [...state.players];
  for (const p of [0, 1]) {
    players[p] = {
      ...players[p],
      hand: players[p].hand.filter((id) => state.troops[id]?.owner === p)
    };
  }
  return { ...state, players };
}
function untapEssence(state, player) {
  const essencePool = { ...state.essencePool };
  for (const id of state.players[player].essenceIds) {
    const e = essencePool[id];
    if (e && e.owner === player) {
      essencePool[id] = { ...e, exhausted: false };
    }
  }
  return { ...state, essencePool };
}

// src/game/card-meta.ts
function normalizeCardDefinition(raw) {
  const cardType = resolveCardType(raw);
  const faction = raw.faction ?? "neutra";
  const cardRole = cardType === "troop" ? raw.cardRole ?? "normal" : "normal";
  return {
    ...raw,
    cardType,
    faction,
    cardRole,
    cardKind: raw.cardKind ?? (cardType === "spell" ? "spell" : "troop")
  };
}
function resolveCardType(def) {
  if (def.cardType) return def.cardType;
  if (def.cardKind === "spell" || def.spellEffect) return "spell";
  if (def.isToken) return "troop";
  return "troop";
}
function getCardType(def) {
  if (!def) return "troop";
  return def.cardType ?? resolveCardType(def);
}
function isLeaderCard(def) {
  return getCardType(def) === "leader";
}
function isCaptainCard(def) {
  return Boolean(def && def.cardRole === "captain");
}
function isDeckableCard(def) {
  if (!def || def.isToken) return false;
  if (def.leaderFormOf) return true;
  const type = getCardType(def);
  return type === "troop" || type === "spell" || type === "artifact" || type === "equipment";
}
function isLeaderFormCard(def) {
  return Boolean(def?.leaderFormOf);
}
function getEssenceCost(def) {
  if (def.essenceCost) return { ...def.essenceCost };
  return { exhaust: def.cost };
}
function formatEssenceCost(def) {
  const { exhaust, sacrifice } = getEssenceCost(def);
  if (!sacrifice) return `${exhaust} ess\xEAncia(s)`;
  return `exaurte ${exhaust} e sacrifique ${sacrifice} (descarte de Ess\xEAncia)`;
}
function getCorruptionCost(def) {
  if (def.corruptionCost !== void 0) return def.corruptionCost;
  if (def.spellEffect === "omega") return 1;
  return 0;
}
function formatCorruptionCost(def) {
  const amount = getCorruptionCost(def);
  if (amount <= 0) return "";
  return amount === 1 ? "1 Corrup\xE7\xE3o" : `${amount} Corrup\xE7\xE3o`;
}
function formatCardCost(def) {
  const parts = [];
  const { exhaust, sacrifice } = getEssenceCost(def);
  if (exhaust > 0 || sacrifice) {
    parts.push(formatEssenceCost(def));
  }
  const cor = formatCorruptionCost(def);
  if (cor) parts.push(cor);
  return parts.length > 0 ? parts.join(" + ") : "sem custo";
}
function canAffordCardCost(state, player, def, essencePayment) {
  const payment = essencePayment ?? getEssenceCost(def);
  return canPayEssenceCost(state, player, payment) && canPayCorruptionCost(state, player, getCorruptionCost(def));
}

// src/game/deck-rules.ts
var DEFAULT_MIN_DECK_SIZE = 40;
var DEFAULT_MAX_COPIES = 4;
var CAPTAIN_MAX_COPIES = 1;
function catalogMap(cards) {
  return Object.fromEntries(cards.map((c) => [c.id, normalizeCardDefinition(c)]));
}
function validateDeck(deck, catalog, options) {
  const errors = [];
  const minDeckSize = options?.minDeckSize ?? DEFAULT_MIN_DECK_SIZE;
  const maxCopies = options?.maxCopies ?? DEFAULT_MAX_COPIES;
  const counts = /* @__PURE__ */ new Map();
  if (deck.leaderId) {
    const leader = catalog[deck.leaderId];
    if (!leader) {
      errors.push({
        code: "leader_missing",
        message: `L\xEDder "${deck.leaderId}" n\xE3o existe no cat\xE1logo.`
      });
    } else if (!isLeaderCard(leader)) {
      errors.push({
        code: "leader_invalid_type",
        message: `"${leader.name}" n\xE3o \xE9 uma carta de L\xEDder.`
      });
    }
  }
  for (const id of deck.cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (deck.cardIds.length < minDeckSize) {
    errors.push({
      code: "deck_size",
      message: `O baralho precisa de no m\xEDnimo ${minDeckSize} cartas (atual: ${deck.cardIds.length}).`
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
        message: `"${def.name}" n\xE3o pode ir no baralho (${def.cardType ?? "tipo inv\xE1lido"}).`
      });
    }
    if (isLeaderCard(def)) {
      errors.push({
        code: "leader_in_deck",
        message: `O L\xEDder "${def.name}" fica fora do baralho \u2014 use leaderId.`
      });
    }
    const limit = isCaptainCard(def) ? CAPTAIN_MAX_COPIES : maxCopies;
    if (count > limit) {
      errors.push({
        code: isCaptainCard(def) ? "captain_copies" : "max_copies",
        message: `"${def.name}": m\xE1ximo ${limit} c\xF3pia(s) (tem ${count}).`
      });
    }
    if (isCaptainCard(def)) {
      if (!deck.leaderId) {
        errors.push({
          code: "captain_no_leader",
          message: `A capit\xE3 "${def.name}" exige um L\xEDder no deck.`
        });
      } else if (def.requiredLeaderId && def.requiredLeaderId !== deck.leaderId) {
        errors.push({
          code: "captain_wrong_leader",
          message: `"${def.name}" s\xF3 pode ser usada com o L\xEDder "${def.requiredLeaderId}".`
        });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
function validateStarterDeck(catalogData) {
  const catalog = catalogMap(catalogData.cards);
  return validateDeck(
    { leaderId: null, cardIds: catalogData.starterDeck },
    catalog
  );
}

// src/game/cards.ts
function normalizeCatalog(data) {
  const cards = data.cards.map(normalizeCardDefinition);
  const starterDeck = [...data.starterDeck];
  const check = validateStarterDeck({ cards, starterDeck });
  if (!check.valid) {
    console.warn(
      "[deck] starterDeck inv\xE1lido:",
      check.errors.map((e) => e.message).join("; ")
    );
  }
  return { cards, starterDeck };
}
function buildCatalogMap(cards) {
  return Object.fromEntries(cards.map((c) => [c.id, normalizeCardDefinition(c)]));
}
function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// src/game/arenas.ts
var MUNDO_NORMAL_ARENAS = [
  {
    id: "ruas-sao-paulo",
    name: "Ruas de S\xE3o Paulo",
    neutral: true,
    phase: "mundo-normal",
    effect: "none",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "bar-do-jao",
    name: "Bar do Jo\xE3o",
    neutral: false,
    phase: "mundo-normal",
    effect: "no-magic",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "estacao-da-luz",
    name: "Esta\xE7\xE3o da Luz",
    neutral: false,
    phase: "mundo-normal",
    effect: "gargoyle-fill",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "colegio-aurelio",
    name: "Col\xE9gio Aur\xE9lio de Camargo",
    neutral: false,
    phase: "mundo-normal",
    effect: "susej-on-dominate",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "ringue-colecionador",
    name: "Ringue do Colecionador",
    neutral: false,
    phase: "mundo-normal",
    effect: "random-buff-on-combat",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "mansao-omegas",
    name: "Mans\xE3o dos Omegas",
    neutral: false,
    phase: "mundo-normal",
    effect: "draw-two-on-dominate",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "sanatorio-augustinho",
    name: "Sanat\xF3rio S\xE3o Augustinho",
    neutral: false,
    phase: "mundo-normal",
    effect: "ping-after-strike",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "templo-sombras",
    name: "Templo das Sombras",
    neutral: false,
    phase: "mundo-normal",
    effect: "conquest-3-corruption",
    conquestPointsToDominate: 3,
    pickedBy: null
  }
];
var ABISMO_ARENAS = [
  {
    id: "armazem-colecionador",
    name: "Armaz\xE9m do Colecionador",
    neutral: false,
    phase: "abismo",
    effect: "no-leave-by-move",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "cidade-das-curvas",
    name: "Cidade das Curvas",
    neutral: false,
    phase: "abismo",
    effect: "random-combat-target",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "prisao-conglomerado",
    name: "Pris\xE3o do Conglomerado",
    neutral: false,
    phase: "abismo",
    effect: "exile-on-death",
    conquestPointsToDominate: 2,
    pickedBy: null
  },
  {
    id: "castelo-pedra-rubra",
    name: "Castelo de Pedra Rubra",
    neutral: false,
    phase: "abismo",
    effect: "spells-cost-less",
    conquestPointsToDominate: 2,
    pickedBy: null
  }
];
var REINO_REVERSO_ARENAS = [
  {
    id: "arena-reino-reverso",
    name: "Arena do Reino Reverso",
    neutral: true,
    phase: "reino-reverso",
    effect: "none",
    conquestPointsToDominate: 99,
    pickedBy: null
  },
  {
    id: "vacuo-eterno",
    name: "V\xE1cuo Eterno",
    neutral: false,
    phase: "reino-reverso",
    effect: "rr-vacuum-2",
    conquestPointsToDominate: 99,
    pickedBy: null
  },
  {
    id: "salao-lordes",
    name: "Sal\xE3o dos Lordes",
    neutral: false,
    phase: "reino-reverso",
    effect: "rr-mutual-wipe-leader-damage",
    conquestPointsToDominate: 99,
    pickedBy: null
  },
  {
    id: "trono-negro",
    name: "Trono Negro",
    neutral: false,
    phase: "reino-reverso",
    effect: "rr-loser-only-vacuum",
    conquestPointsToDominate: 99,
    pickedBy: null
  }
];
function arenasForPhase(phase) {
  switch (phase) {
    case "mundo-normal":
      return MUNDO_NORMAL_ARENAS;
    case "abismo":
      return ABISMO_ARENAS;
    case "reino-reverso":
      return REINO_REVERSO_ARENAS;
  }
}

// src/game/types.ts
var LEADER_MAX_HP = 15;
var MAX_TROOPS_PER_ZONE = 3;
var INITIAL_HAND_SIZE = 5;
var CARDS_DRAW_PER_TURN = 1;
var LEADER_EVOLUTION_CORRUPTION_COST = 5;
function maxCorruptionForPhase(phase) {
  switch (phase) {
    case "mundo-normal":
      return 5;
    case "abismo":
      return 10;
    case "reino-reverso":
      return 999;
  }
}

// src/game/phase-transition.ts
function dominationsToWinPhase(phase) {
  switch (phase) {
    case "mundo-normal":
      return 3;
    case "abismo":
      return 2;
    case "reino-reverso":
      return null;
  }
}
function phaseDisplayName(phase) {
  switch (phase) {
    case "mundo-normal":
      return "Mundo Normal";
    case "abismo":
      return "Abismo";
    case "reino-reverso":
      return "Reino Reverso";
  }
}
function nextWorldPhase(phase) {
  switch (phase) {
    case "mundo-normal":
      return "abismo";
    case "abismo":
      return "reino-reverso";
    case "reino-reverso":
      return null;
  }
}
function troopsInArenaForPlayer(state, player) {
  return Object.values(state.troops).filter(
    (t) => t.zone === "arena" && t.currentHealth > 0 && t.owner === player
  );
}
function removeTroopFromField(state, troop) {
  const players = [...state.players];
  const p = troop.owner;
  players[p] = {
    ...players[p],
    hand: players[p].hand.filter((id) => id !== troop.instanceId)
  };
  const troops = { ...state.troops };
  delete troops[troop.instanceId];
  let nextId = state.nextInstanceId;
  return {
    state: { ...state, players, troops, nextInstanceId: nextId },
    nextId
  };
}
function addEssenceFromTroop(state, troop, nextId) {
  const [idNum, newNext] = nextInstanceId({ ...state, nextInstanceId: nextId });
  const essenceId = `essence-${idNum}`;
  const players = [...state.players];
  const p = troop.owner;
  players[p] = {
    ...players[p],
    essenceIds: [...players[p].essenceIds, essenceId]
  };
  const essencePool = {
    ...state.essencePool,
    [essenceId]: {
      instanceId: essenceId,
      cardId: troop.cardId,
      owner: p,
      exhausted: false
    }
  };
  return {
    state: { ...state, players, essencePool, nextInstanceId: newNext },
    nextId: newNext
  };
}
function applyPostPhaseChoiceForPlayer(state, player, choice) {
  const arenaTroops = troopsInArenaForPlayer(state, player);
  let next = state;
  let nextId = state.nextInstanceId;
  if (choice === "recycle") {
    const players = [...next.players];
    const troops = { ...next.troops };
    for (const troop of arenaTroops) {
      players[player] = {
        ...players[player],
        deck: shuffle([...players[player].deck, troop.cardId]),
        hand: players[player].hand.filter((id) => id !== troop.instanceId)
      };
      delete troops[troop.instanceId];
    }
    next = {
      ...next,
      players,
      troops,
      log: appendLog(
        next,
        `Jogador ${player + 1} reciclou ${arenaTroops.length} tropa(s) suas nas arenas.`
      )
    };
  } else if (choice === "corruption") {
    for (const troop of arenaTroops) {
      const removed = removeTroopFromField(next, troop);
      next = removed.state;
      nextId = removed.nextId;
    }
    const gain = Math.min(3, arenaTroops.length);
    const players = [...next.players];
    if (gain > 0) {
      const cur = players[player].corruption;
      const cap = maxCorruptionForPhase(next.gamePhase);
      players[player] = {
        ...players[player],
        corruption: Math.min(cap, cur + gain)
      };
    }
    next = {
      ...next,
      players,
      nextInstanceId: nextId,
      log: appendLog(
        next,
        `Jogador ${player + 1} escolheu Corrup\xE7\xE3o (+${gain}).`
      )
    };
  } else {
    for (const troop of arenaTroops) {
      const removed = removeTroopFromField(next, troop);
      next = removed.state;
      nextId = removed.nextId;
      const withEssence = addEssenceFromTroop(next, troop, nextId);
      next = withEssence.state;
      nextId = withEssence.nextId;
    }
    next = {
      ...next,
      nextInstanceId: nextId,
      log: appendLog(
        next,
        `Jogador ${player + 1} converteu ${arenaTroops.length} tropa(s) suas em Ess\xEAncia.`
      )
    };
  }
  return next;
}
function finalizePhaseTransition(state) {
  return startNextPhaseSetup(clearArenaField(state));
}
function clearArenaField(state) {
  const conquestWatch = {};
  const troops = { ...state.troops };
  const players = [...state.players];
  for (const t of Object.values(troops)) {
    if (t.zone !== "arena") continue;
    const p = t.owner;
    players[p] = {
      ...players[p],
      hand: players[p].hand.filter((id) => id !== t.instanceId),
      discard: [...players[p].discard, t.cardId]
    };
    delete troops[t.instanceId];
  }
  return {
    ...state,
    arenas: [],
    conquestWatch,
    troops,
    players: players.map((pl) => ({
      ...pl,
      dominatedArenas: 0
    })),
    combat: null,
    turnPhase: "main"
  };
}
function beginPhaseEndChoice(state, winner, completedPhase) {
  const nextPhase = nextWorldPhase(completedPhase);
  if (!nextPhase) {
    return {
      ...state,
      matchPhase: "finished",
      winner,
      winReason: `${phaseDisplayName(completedPhase)} vencido`
    };
  }
  return {
    ...state,
    matchPhase: "phase_end_choice_p0",
    phaseWinner: winner,
    combat: null,
    turnPhase: "main",
    log: appendLog(
      state,
      `Jogador ${winner + 1} venceu o ${phaseDisplayName(completedPhase)}! Cada jogador escolhe o destino das **pr\xF3prias** tropas nas arenas.`
    )
  };
}
function startNextPhaseSetup(state) {
  const winner = state.phaseWinner;
  if (winner === null) return state;
  const completed = state.gamePhase;
  const nextPhase = nextWorldPhase(completed);
  if (!nextPhase) return state;
  const pool = arenasForPhase(nextPhase).map((a) => ({ ...a }));
  let matchPhase;
  let logMsg;
  if (nextPhase === "abismo") {
    matchPhase = "setup_abismo_winner";
    logMsg = `Fase Abismo \u2014 Jogador ${winner + 1} (vencedor) escolhe 2 arenas.`;
  } else {
    matchPhase = "setup_rr_winner";
    logMsg = `Reino Reverso \u2014 Jogador ${winner + 1} escolhe a arena final.`;
  }
  return {
    ...state,
    gamePhase: nextPhase,
    arenaPool: pool,
    selectedArenaIds: [[], []],
    arenaSetupPicks: [],
    matchPhase,
    phaseWinner: winner,
    log: appendLog(state, logMsg)
  };
}
function buildArenasFromPickIds(state, pickIds) {
  return pickIds.map((id) => {
    const d = state.arenaPool.find((a) => a.id === id);
    return {
      id: d.id,
      name: d.name,
      neutral: d.neutral,
      phase: d.phase,
      effect: d.effect,
      conquestPointsToDominate: d.conquestPointsToDominate,
      dominatedBy: null,
      conquestPoints: { 0: 0, 1: 0 }
    };
  });
}
function finishArenaSetupAndResume(state, pickIds, firstPlayer) {
  const arenas = buildArenasFromPickIds(state, pickIds);
  const conquestWatch = {};
  for (const a of arenas) conquestWatch[a.id] = null;
  return {
    ...state,
    arenas,
    conquestWatch,
    arenaSetupPicks: [],
    matchPhase: "playing",
    activePlayer: firstPlayer,
    turnPhase: "main",
    log: appendLog(
      state,
      `${phaseDisplayName(state.gamePhase)} \u2014 ${arenas.map((a) => a.name).join(", ")}. Jogador ${firstPlayer + 1} come\xE7a.`
    )
  };
}
function applyLeaderDamageTo(state, target, damage, reason, attacker) {
  const winnerOnKo = attacker ?? opponent(target);
  const players = [...state.players];
  const hp = Math.max(0, players[target].leaderHp - damage);
  players[target] = { ...players[target], leaderHp: hp };
  let next = {
    ...state,
    players,
    log: appendLog(state, reason)
  };
  if (hp <= 0) {
    next = {
      ...next,
      matchPhase: "finished",
      winner: winnerOnKo,
      winReason: "L\xEDder derrotado",
      log: appendLog(next, `Jogador ${winnerOnKo + 1} venceu a partida!`)
    };
  }
  return next;
}
function applyLeaderDamage(state, attacker, damage, reason) {
  return applyLeaderDamageTo(state, opponent(attacker), damage, reason, attacker);
}
function applyDeckoutLoss(state, player) {
  if (state.matchPhase === "finished") return state;
  const winner = opponent(player);
  return {
    ...state,
    matchPhase: "finished",
    winner,
    winReason: "Deck esgotado",
    log: appendLog(
      state,
      `Jogador ${player + 1} n\xE3o p\xF4de comprar (deck vazio) \u2014 Jogador ${winner + 1} vence!`
    )
  };
}

// src/game/equipment.ts
function isEquipmentCard(def) {
  return Boolean(def && getCardType(def) === "equipment");
}
function getEnemyEquippedTroops(state, player) {
  const enemy = player === 0 ? 1 : 0;
  return Object.values(state.troops).filter(
    (t) => t.owner === enemy && t.equipmentId !== null && (t.zone === "base" || t.zone === "arena") && t.currentHealth > 0
  );
}
function destroyEquipmentOnTroop(state, troopId, logPrefix) {
  const troop = state.troops[troopId];
  if (!troop?.equipmentId) return state;
  const eq = state.equipments[troop.equipmentId];
  if (!eq) {
    const troops2 = { ...state.troops, [troopId]: { ...troop, equipmentId: null } };
    return { ...state, troops: troops2 };
  }
  const eqDef = state.catalog[eq.cardId];
  const bonusAtk = eqDef?.attack ?? 0;
  const bonusHp = eqDef?.health ?? 0;
  const troops = { ...state.troops };
  troops[troopId] = {
    ...troop,
    equipmentId: null,
    attack: Math.max(0, troop.attack - bonusAtk),
    healthBonus: Math.max(0, troop.healthBonus - bonusHp),
    currentHealth: Math.max(1, troop.currentHealth - bonusHp)
  };
  const equipments = { ...state.equipments };
  delete equipments[eq.instanceId];
  const owner = troop.owner;
  const players = [...state.players];
  players[owner] = {
    ...players[owner],
    discard: [...players[owner].discard, eq.cardId]
  };
  const eqName = eqDef?.name ?? eq.cardId;
  return {
    ...state,
    troops,
    equipments,
    players,
    log: appendLog(state, `${logPrefix} \u2014 ${eqName} foi destru\xEDdo.`)
  };
}
function destroyEnemyRelic(state, caster) {
  const enemy = caster === 0 ? 1 : 0;
  const enemyArtifacts = Object.values(state.artifacts).filter((a) => a.owner === enemy);
  if (enemyArtifacts.length > 0) {
    const target = enemyArtifacts[0];
    const targetName = state.catalog[target.cardId]?.name ?? "Artefato";
    const artifacts = { ...state.artifacts };
    delete artifacts[target.instanceId];
    const players = [...state.players];
    players[enemy] = {
      ...players[enemy],
      discard: [...players[enemy].discard, target.cardId]
    };
    return {
      ...state,
      artifacts,
      players,
      log: appendLog(state, `${targetName} do Jogador ${enemy + 1} foi destru\xEDdo!`)
    };
  }
  const equipped = getEnemyEquippedTroops(state, caster);
  if (equipped.length === 0) {
    return {
      ...state,
      log: appendLog(state, "Nenhum artefato/equipamento inimigo para destruir.")
    };
  }
  const victim = equipped[0];
  const eq = state.equipments[victim.equipmentId];
  const eqName = eq ? state.catalog[eq.cardId]?.name ?? "Equipamento" : "Equipamento";
  return destroyEquipmentOnTroop(
    state,
    victim.instanceId,
    `${eqName} em ${getTroopName(state, victim)}`
  );
}

// src/game/keywords.ts
function cardHasKeyword(def, keyword) {
  return def?.keywords?.includes(keyword) ?? false;
}
function troopHasKeyword(state, troop, keyword) {
  return cardHasKeyword(state.catalog[troop.cardId], keyword);
}
function pickNextCleaveTarget(state, striker, arenaId, _troops, alreadyHit) {
  const legal = getLegalCombatTargets(state, striker, arenaId).filter(
    (t) => t.currentHealth > 0 && !alreadyHit.has(t.instanceId)
  );
  if (legal.length === 0) return null;
  return [...legal].sort((a, b) => a.currentHealth - b.currentHealth)[0];
}
function troopCanFlyBetweenArenas(state, troop) {
  return troopHasKeyword(state, troop, "voar");
}
function getLegalCombatTargets(state, striker, arenaId) {
  const enemies = getTroopsInZone(state, opponent(striker), "arena", arenaId).filter(
    (t) => t.currentHealth > 0 && !t.etherealThisTurn
  );
  const protectors = enemies.filter((t) => troopHasKeyword(state, t, "protetor") || t.hasEmpathy);
  if (protectors.length > 0) return protectors;
  return enemies;
}
function isLegalCombatTarget(state, striker, arenaId, target) {
  if (target.owner === striker || target.zone !== "arena" || target.arenaId !== arenaId) {
    return false;
  }
  if (target.currentHealth <= 0) return false;
  return getLegalCombatTargets(state, striker, arenaId).some(
    (t) => t.instanceId === target.instanceId
  );
}
function applyEcoOnDeath(state, troop) {
  const owner = troop.owner;
  const allies = getTroopsInZone(state, owner, "base").filter(
    (t) => t.currentHealth > 0 && t.instanceId !== troop.instanceId
  );
  if (allies.length === 0) {
    return {
      ...state,
      log: appendLog(
        state,
        `Eco (${getTroopName(state, troop)}) \u2014 nenhuma tropa aliada na base para preparar.`
      )
    };
  }
  const pick = allies[0];
  const troops = {
    ...state.troops,
    [pick.instanceId]: { ...pick, exhausted: false }
  };
  return {
    ...state,
    troops,
    log: appendLog(
      state,
      `Eco \u2014 ${getTroopName(state, pick)} na base ficou pronta ap\xF3s a morte de ${getTroopName(state, troop)}.`
    )
  };
}
function resolveDeathEffect(state, troop, effect) {
  const owner = troop.owner;
  const name = getTroopName(state, troop);
  switch (effect) {
    case "draw-one": {
      let next = drawFromDeck(state, owner, 1);
      if (next.matchPhase === "finished") return next;
      return {
        ...next,
        log: appendLog(next, `Testamento (${name}) \u2014 Jogador ${owner + 1} compra 1 carta.`)
      };
    }
    case "ping-leader-1": {
      const target = opponent(owner);
      return applyLeaderDamageTo(
        state,
        target,
        1,
        `Testamento (${name}) \u2014 1 de dano no L\xEDder do Jogador ${target + 1}.`,
        owner
      );
    }
    default:
      return state;
  }
}
function applyEmpathyOnDeath(state, troop) {
  const owner = troop.owner;
  const arenaId = troop.arenaId;
  if (!arenaId) return state;
  const allies = getTroopsInZone(state, owner, "arena", arenaId).filter(
    (t) => t.currentHealth > 0 && t.instanceId !== troop.instanceId
  );
  if (allies.length === 0) {
    return {
      ...state,
      log: appendLog(
        state,
        `Empatia (${getTroopName(state, troop)}) \u2014 nenhuma tropa aliada na arena para fortalecer.`
      )
    };
  }
  const troops = { ...state.troops };
  for (const ally of allies) {
    troops[ally.instanceId] = {
      ...ally,
      attack: ally.attack + 1,
      currentHealth: ally.currentHealth + 1,
      healthBonus: ally.healthBonus + 1
    };
  }
  return {
    ...state,
    troops,
    log: appendLog(
      state,
      `Empatia \u2014 ${getTroopName(state, troop)} morreu; ${allies.length} aliado(s) na arena ganharam +1/+1.`
    )
  };
}
function applyTroopDeathTriggers(state, troop) {
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
  if (troop.hasEmpathy && next.players[troop.owner].leaderId === "noah-delta-empatia") {
    next = applyEmpathyOnDeath(next, troop);
  }
  return next;
}
function applyVincularAfterCombatHit(state, attacker, target) {
  if (!troopHasKeyword(state, attacker, "vincular")) return state;
  if (target.currentHealth <= 0) {
    return {
      ...state,
      log: appendLog(
        state,
        `Vincular \u2014 ${getTroopName(state, target)} caiu antes de ser presa ao solo.`
      )
    };
  }
  const troops = {
    ...state.troops,
    [target.instanceId]: { ...target, movementLocked: true }
  };
  return {
    ...state,
    troops,
    log: appendLog(
      state,
      `Vincular \u2014 ${getTroopName(state, target)} n\xE3o poder\xE1 se mover no pr\xF3ximo turno.`
    )
  };
}
function clearMovementLocksForPlayer(state, player) {
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
function troopEntersReadyOnDeploy(def) {
  return cardHasKeyword(def, "investida");
}
function troopBlocksEnchantments(state, target) {
  return troopHasKeyword(state, target, "silencio");
}
function applyLandingEffect(state, troop) {
  const def = state.catalog[troop.cardId];
  if (!def?.landingEffect || !cardHasKeyword(def, "aterrisagem")) return state;
  if (def.landingEffect === "destroy-enemy-artifact") {
    return destroyEnemyRelic(state, troop.owner);
  }
  return state;
}

// src/game/spell-stack.ts
function spellRequiresTarget(effect) {
  switch (effect) {
    case "draw-two":
    case "troop-tutor":
    case "spell-tutor":
    case "counterspell":
    case "destroy-artifact":
      return false;
    default:
      return true;
  }
}
function troopIsUntargetable(troop, _options) {
  return Boolean(troop.etherealThisTurn);
}
function tutorFromDeck(state, player, match, notFoundMsg) {
  const pl = state.players[player];
  const idx = pl.deck.findIndex((id) => {
    const def2 = state.catalog[id];
    return def2 && match(def2);
  });
  if (idx === -1) {
    return { ...state, log: appendLog(state, notFoundMsg) };
  }
  const cardId = pl.deck[idx];
  const def = state.catalog[cardId];
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
      equipmentId: null,
      zone: "hand",
      arenaId: null
    }
  };
  const players = [...state.players];
  players[player] = {
    ...pl,
    deck,
    hand: [...pl.hand, instanceId]
  };
  return {
    ...state,
    players,
    troops,
    nextInstanceId: nextId,
    log: appendLog(state, `${def.name} foi revelada e colocada na m\xE3o do Jogador ${player + 1}.`)
  };
}
function applySpellEffect(state, caster, effect, targetTroopId, spellName, targetArtifactId) {
  void targetArtifactId;
  const arenaId = state.combat?.arenaId ?? null;
  switch (effect) {
    case "draw-two": {
      let next = drawFromDeck(state, caster, 2);
      return {
        ...next,
        log: appendLog(next, `${spellName}: Jogador ${caster + 1} compra 2 cartas.`)
      };
    }
    case "troop-tutor":
      return tutorFromDeck(
        state,
        caster,
        (d) => isTroopCard(d) && !d.isToken,
        `${spellName}: nenhuma tropa encontrada no deck.`
      );
    case "spell-tutor":
      return tutorFromDeck(
        state,
        caster,
        (d) => isSpellCard(d),
        `${spellName}: nenhum feiti\xE7o encontrado no deck.`
      );
    case "constriction": {
      if (!targetTroopId) return state;
      const target = state.troops[targetTroopId];
      if (!target || target.owner === caster) return state;
      const troops = {
        ...state.troops,
        [targetTroopId]: {
          ...target,
          movementLocked: true,
          attackSuppressed: true
        }
      };
      return {
        ...state,
        troops,
        log: appendLog(
          state,
          `${spellName}: ${getTroopName(state, target)} presa \u2014 n\xE3o ataca no pr\xF3ximo combate do dono.`
        )
      };
    }
    case "ethereal": {
      if (!targetTroopId) return state;
      const target = state.troops[targetTroopId];
      if (!target || target.owner !== caster) return state;
      const troops = {
        ...state.troops,
        [targetTroopId]: { ...target, etherealThisTurn: true }
      };
      return {
        ...state,
        troops,
        log: appendLog(
          state,
          `${spellName}: ${getTroopName(state, target)} n\xE3o pode ser alvo de ataques nem feiti\xE7os pontuais neste turno.`
        )
      };
    }
    case "omega": {
      if (!targetTroopId) return state;
      const target = state.troops[targetTroopId];
      if (!target || target.owner === caster) return state;
      if (target.zone !== "base" && target.zone !== "arena") return state;
      const troops = {
        ...state.troops,
        [targetTroopId]: { ...target, currentHealth: 0 }
      };
      let next = {
        ...state,
        troops,
        log: appendLog(
          state,
          `${spellName}: ${getTroopName(state, target)} foi destru\xEDda instantaneamente.`
        )
      };
      if (arenaId && next.combat) {
        return checkCombatEndAfterDamage(next, arenaId, "Combate encerrado ap\xF3s Omega.");
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
        let logMsg = `${spellName} em ${getTroopName(state, target)} \u2014 1d6: ${roll}. `;
        if (even) {
          const hp = Math.max(0, target.currentHealth - 2);
          troops[targetTroopId] = { ...target, currentHealth: hp };
          logMsg += "Par \u2014 2 de dano!";
        } else {
          logMsg += "\xCDmpar \u2014 sem dano.";
        }
        let next = { ...state, troops, log: appendLog(state, logMsg) };
        next = sanitizePlayerHands(next);
        if (arenaId && next.combat) {
          return checkCombatEndAfterDamage(next, arenaId, "Combate encerrado ap\xF3s magia");
        }
        return next;
      }
      if (effect === "iron-skin") {
        troops[targetTroopId] = {
          ...target,
          healthBonus: target.healthBonus + 2,
          currentHealth: target.currentHealth + 2,
          attachedSpell: "iron-skin"
        };
        return sanitizePlayerHands({
          ...state,
          troops,
          log: appendLog(
            state,
            `${spellName} em ${getTroopName(state, target)} \u2014 +2 de vida permanente.`
          )
        });
      }
      if (effect === "encore") {
        troops[targetTroopId] = { ...target, attachedSpell: "encore" };
        return sanitizePlayerHands({
          ...state,
          troops,
          log: appendLog(
            state,
            `${spellName} em ${getTroopName(state, target)} \u2014 ataques podem errar (1d6 \xEDmpar).`
          )
        });
      }
      if (effect === "gust-wind") {
        if (countTroopsInZone(state, target.owner, "base") >= MAX_TROOPS_PER_ZONE) {
          return { ...state, log: appendLog(state, "Base do alvo cheia \u2014 Lufada falhou.") };
        }
        troops[targetTroopId] = {
          ...target,
          zone: "base",
          arenaId: null,
          exhausted: true
        };
        let next = {
          ...state,
          troops,
          log: appendLog(
            state,
            `${spellName} \u2014 ${getTroopName(state, target)} voltou \xE0 base (exausta).`
          )
        };
        next = sanitizePlayerHands(next);
        if (arenaId && next.combat) {
          return checkCombatEndAfterDamage(next, arenaId, "Combate encerrado ap\xF3s magia");
        }
        return next;
      }
      return state;
    }
    case "destroy-artifact": {
      return destroyEnemyRelic(state, caster);
    }
    default:
      return state;
  }
}
function openPendingSpell(state, pending, logMsg) {
  return {
    ...state,
    pendingSpell: pending,
    log: appendLog(state, logMsg)
  };
}
function resolvePendingSpell(state) {
  const pending = state.pendingSpell;
  if (!pending) return state;
  const name = state.catalog[pending.spellCardId]?.name ?? pending.spellCardId;
  const next = applySpellEffect(
    state,
    pending.caster,
    pending.effect,
    pending.targetTroopId,
    name,
    pending.targetArtifactId
  );
  return {
    ...next,
    pendingSpell: null,
    log: appendLog(next, `${name} resolve.`)
  };
}
function cancelPendingSpell(state, reason) {
  const pending = state.pendingSpell;
  if (!pending) return state;
  const name = state.catalog[pending.spellCardId]?.name ?? "Feiti\xE7o";
  return {
    ...state,
    pendingSpell: null,
    log: appendLog(state, `${name} foi anulado. ${reason}`)
  };
}
function canRespondWithCounter(state, player, spellDef) {
  if (spellDef.spellEffect !== "counterspell") return false;
  const pending = state.pendingSpell;
  if (!pending?.counterWindowOpen) return false;
  return player === opponent(pending.caster);
}
function tryPayCounterCost(state, caster) {
  const payment = { exhaust: 2 };
  if (!canPayEssenceCost(state, caster, payment)) {
    return cancelPendingSpell(
      state,
      `Jogador ${caster + 1} n\xE3o pagou 2 ess\xEAncias \u2014 efeito cancelado.`
    );
  }
  const paid = payEssenceCost(state, caster, payment);
  if (!paid.ok) {
    return cancelPendingSpell(state, "Falha ao pagar ess\xEAncias.");
  }
  const next = resolvePendingSpell({
    ...paid.state,
    pendingSpell: state.pendingSpell
  });
  return {
    ...next,
    log: appendLog(
      next,
      `Jogador ${caster + 1} exaurtiu 2 ess\xEAncias \u2014 o feiti\xE7o resolve.`
    )
  };
}

// src/game/spells.ts
function isSpellCard(def) {
  if (!def) return false;
  if (def.cardType === "spell") return true;
  if (def.cardType && def.cardType !== "troop") return false;
  return def.cardKind === "spell" || Boolean(def.spellEffect);
}
function isTroopCard(def) {
  if (!def) return false;
  if (def.cardType === "troop" || def.isToken) return true;
  return !isSpellCard(def) && !def.isToken;
}
function getCardSpeed(def) {
  if (def.cardSpeed) return def.cardSpeed;
  if (isSpellCard(def)) return "standard";
  return "standard";
}
function isCombatMagicWindow(state) {
  return state.turnPhase === "combat" && state.combat?.subPhase === "magic";
}
function speedLabel(speed) {
  switch (speed) {
    case "fast":
      return "R\xE1pida";
    case "combat":
      return "Combate";
    case "turn":
      return "Turno";
    default:
      return "Padr\xE3o";
  }
}
function defaultTroopFields(def) {
  if (isSpellCard(def)) {
    return {
      attack: 0,
      currentHealth: 1,
      attachedSpell: null,
      healthBonus: 0,
      movementLocked: false,
      equipmentId: null
    };
  }
  return {
    attack: def.attack,
    currentHealth: def.health,
    attachedSpell: null,
    healthBonus: 0,
    movementLocked: false,
    equipmentId: null
  };
}
function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}
function effectiveSpellCost(state, def) {
  let cost = def.cost;
  if (state.combat?.spellsCostLess) {
    cost = Math.max(0, cost - spellCostReductionInCombat(state));
  }
  return cost;
}
function isFieldTroop(t) {
  return (t.zone === "base" || t.zone === "arena") && t.currentHealth > 0;
}
function canPlaySpellNow(state, player, spellDef) {
  if (state.matchPhase !== "playing" || !isSpellCard(spellDef)) return false;
  if (state.combat && !isMagicAllowedInCombat(state)) return false;
  const speed = getCardSpeed(spellDef);
  if (speed === "fast") {
    return state.turnPhase === "main" || state.turnPhase === "combat";
  }
  if (speed === "turn") {
    return state.turnPhase === "main" && state.activePlayer === player && !state.combat;
  }
  if (speed === "combat") {
    return isCombatMagicWindow(state);
  }
  if (spellDef.spellEffect === "counterspell" && canRespondWithCounter(state, player, spellDef)) {
    return true;
  }
  if (speed === "standard") {
    if (state.turnPhase === "main" && state.activePlayer === player && !state.combat) {
      return true;
    }
    if (isCombatMagicWindow(state)) return true;
    return false;
  }
  return false;
}
function canTargetSpell(state, caster, spellDef, target) {
  if (!spellDef.spellEffect || !isFieldTroop(target)) return false;
  if (troopIsUntargetable(target)) return false;
  if (target.zone === "arena" && target.arenaId) {
    const arena = state.arenas.find((a) => a.id === target.arenaId);
    if (arena?.effect === "no-magic") return false;
  }
  const inCombat = state.combat !== null;
  const combatArenaId = state.combat?.arenaId;
  switch (spellDef.spellEffect) {
    case "constriction":
      if (target.owner === caster) return false;
      if (target.zone !== "base" && target.zone !== "arena") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      return true;
    case "ethereal":
      if (target.owner !== caster) return false;
      if (target.zone !== "base" && target.zone !== "arena") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      return true;
    case "omega":
      if (target.owner === caster) return false;
      if (target.zone !== "base" && target.zone !== "arena") return false;
      return true;
    case "encore":
    case "iron-skin":
      if (troopBlocksEnchantments(state, target)) return false;
      if (target.owner !== caster || target.attachedSpell !== null) return false;
      if (inCombat && target.zone === "base") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      return true;
    case "blood-cauldron":
      if (target.owner !== opponent(caster)) return false;
      if (target.zone !== "arena") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      return true;
    case "gust-wind":
      if (target.zone !== "arena") return false;
      if (inCombat && combatArenaId && target.arenaId !== combatArenaId) return false;
      if (countTroopsInZone(state, target.owner, "base") >= MAX_TROOPS_PER_ZONE) {
        return false;
      }
      return true;
    default:
      return false;
  }
}
function playSpell(state, caster, spellInstanceId, targetTroopId, targetArtifactId) {
  const pl = state.players[caster];
  if (!pl.hand.includes(spellInstanceId)) {
    return { ...state, log: appendLog(state, "Magia n\xE3o est\xE1 na sua m\xE3o.") };
  }
  const spellInst = state.troops[spellInstanceId];
  if (!spellInst || spellInst.owner !== caster) return state;
  const spellDef = state.catalog[spellInst.cardId];
  if (!spellDef || !isSpellCard(spellDef) || !spellDef.spellEffect) {
    return { ...state, log: appendLog(state, "Esta carta n\xE3o \xE9 uma magia.") };
  }
  const effect = spellDef.spellEffect;
  if (effect === "counterspell") {
    const pending = state.pendingSpell;
    if (!pending?.counterWindowOpen || caster !== opponent(pending.caster)) {
      return { ...state, log: appendLog(state, "Contramagia s\xF3 ap\xF3s um feiti\xE7o oponente.") };
    }
  } else if (state.pendingSpell) {
    return { ...state, log: appendLog(state, "Resolva o feiti\xE7o pendente antes de lan\xE7ar outro.") };
  }
  if (!canPlaySpellNow(state, caster, spellDef)) {
    return {
      ...state,
      log: appendLog(
        state,
        `${spellDef.name} (${speedLabel(getCardSpeed(spellDef))}) n\xE3o pode ser lan\xE7ada agora.`
      )
    };
  }
  const needsTarget = spellRequiresTarget(effect);
  const targetId = targetTroopId ?? null;
  if (needsTarget) {
    if (!targetId) {
      return { ...state, log: appendLog(state, "Esta magia precisa de um alvo.") };
    }
    const target = state.troops[targetId];
    if (!target) {
      return { ...state, log: appendLog(state, "Alvo inv\xE1lido.") };
    }
    if (!canTargetSpell(state, caster, spellDef, target)) {
      return {
        ...state,
        log: appendLog(
          state,
          "Alvo inv\xE1lido para esta magia (zona, arena ou j\xE1 encantada)."
        )
      };
    }
  }
  const baseCost = getEssenceCost(spellDef);
  const reduced = effectiveSpellCost(state, spellDef);
  const payment = { ...baseCost, exhaust: Math.max(0, reduced) };
  const corruptionCost = getCorruptionCost(spellDef);
  if (!canPayEssenceCost(state, caster, payment)) {
    return {
      ...state,
      log: appendLog(
        state,
        `Ess\xEAncia insuficiente para ${spellDef.name} (precisa ${payment.exhaust}).`
      )
    };
  }
  if (!canPayCorruptionCost(state, caster, corruptionCost)) {
    return {
      ...state,
      log: appendLog(
        state,
        `${spellDef.name} exige ${corruptionCost} Corrup\xE7\xE3o (voc\xEA tem ${pl.corruption}/${maxCorruptionForPhase(state.gamePhase)}).`
      )
    };
  }
  const paid = payEssenceCost(state, caster, payment, true);
  if (!paid.ok) {
    return { ...state, log: appendLog(state, "N\xE3o foi poss\xEDvel pagar o custo em Ess\xEAncia.") };
  }
  let next = paid.state;
  const paidCorruption = payCorruptionCost(next, caster, corruptionCost);
  if (!paidCorruption.ok) {
    return {
      ...state,
      log: appendLog(state, "N\xE3o foi poss\xEDvel pagar o custo em Corrup\xE7\xE3o.")
    };
  }
  next = paidCorruption.state;
  const players = [...next.players];
  const hand = players[caster].hand.filter((id) => id !== spellInstanceId);
  players[caster] = {
    ...players[caster],
    hand,
    discard: [...players[caster].discard, spellInst.cardId]
  };
  const troops = { ...next.troops };
  delete troops[spellInstanceId];
  next = { ...next, players, troops };
  if (effect === "counterspell") {
    const pending = state.pendingSpell;
    return openPendingSpell(
      next,
      { ...pending, counterWindowOpen: false, awaitingCounterPayment: true },
      `${spellDef.name} \u2014 Jogador ${pending.caster + 1} pode exaurir 2 ess\xEAncias para o feiti\xE7o resolver.`
    );
  }
  return openPendingSpell(
    next,
    {
      caster,
      spellCardId: spellInst.cardId,
      effect,
      targetTroopId: targetId,
      targetArtifactId: targetArtifactId ?? null,
      counterWindowOpen: true,
      awaitingCounterPayment: false
    },
    `${spellDef.name} lan\xE7ado \u2014 oponente pode jogar Contramagia ou passar.`
  );
}
function passSpellCounter(state, player) {
  const pending = state.pendingSpell;
  if (!pending?.counterWindowOpen) return state;
  if (player !== opponent(pending.caster)) {
    return { ...state, log: appendLog(state, "S\xF3 o oponente do lan\xE7ador pode passar.") };
  }
  let next = resolvePendingSpell({ ...state, pendingSpell: { ...pending, counterWindowOpen: false } });
  return { ...next, log: appendLog(next, "Feiti\xE7o resolvido.") };
}
function resolveCounterPayment(state, player, payTwoEssence) {
  const pending = state.pendingSpell;
  if (!pending?.awaitingCounterPayment) return state;
  if (player !== pending.caster) {
    return { ...state, log: appendLog(state, "S\xF3 o lan\xE7ador do feiti\xE7o responde \xE0 Contramagia.") };
  }
  if (!payTwoEssence) {
    return cancelPendingSpell(state, "Jogador optou por n\xE3o pagar.");
  }
  return tryPayCounterCost(state, player);
}
function resolveEncoreBeforeAttack(state, attackerId, targetId) {
  const target = state.troops[targetId];
  if (!target || target.attachedSpell !== "encore") {
    return { state, proceed: true };
  }
  const roll = rollD6();
  const misses = roll % 2 === 1;
  const attacker = state.troops[attackerId];
  const attackerName = attacker ? getTroopName(state, attacker) : "Atacante";
  const targetName = getTroopName(state, target);
  if (!misses) {
    return {
      state: {
        ...state,
        log: appendLog(
          state,
          `Encore (${targetName}) \u2014 1d6: ${roll} (par). ${attackerName} acerta.`
        )
      },
      proceed: true
    };
  }
  const combat = state.combat;
  if (!combat) return { state, proceed: true };
  return {
    state: {
      ...state,
      combat: {
        ...combat,
        attackedThisStrike: [...combat.attackedThisStrike, attackerId]
      },
      log: appendLog(
        state,
        `Encore (${targetName}) \u2014 1d6: ${roll} (\xEDmpar). ${attackerName} erra o ataque!`
      )
    },
    proceed: false
  };
}

// src/game/state.ts
var ARENA_POOL = arenasForPhase("mundo-normal");
function emptyPlayer() {
  return {
    leaderHp: LEADER_MAX_HP,
    leaderId: null,
    deck: [],
    hand: [],
    discard: [],
    essenceDiscard: [],
    exile: [],
    essenceIds: [],
    dominatedArenas: 0,
    sacrificedThisTurn: false,
    corruption: 0,
    leaderAbilityUsedThisTurn: false,
    leaderExhausted: false
  };
}
function drawCards(player, count, troops, catalog, owner, nextId) {
  let deck = [...player.deck];
  let hand = [...player.hand];
  let troopsOut = { ...troops };
  let id = nextId;
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) break;
    const cardId = deck.shift();
    const def = catalog[cardId];
    if (!def) continue;
    const instanceId = `troop-${id++}`;
    troopsOut[instanceId] = {
      instanceId,
      cardId,
      owner,
      ...defaultTroopFields(def),
      exhausted: false,
      pinned: false,
      movementLocked: false,
      equipmentId: null,
      zone: "hand",
      arenaId: null
    };
    hand.push(instanceId);
  }
  return {
    player: { ...player, deck, hand },
    troops: troopsOut,
    nextId: id
  };
}
function createInitialGame(catalogData, options = {}) {
  const cpuPlayer = options.cpuPlayer ?? null;
  const catalog = buildCatalogMap(catalogData.cards);
  const allBaseLeaders = catalogData.cards.filter(
    (c) => c.cardType === "leader" && !c.leaderFormOf
  );
  const chosenLeaderId = options.leaderId ?? allBaseLeaders[0]?.id ?? null;
  const cpuLeader = allBaseLeaders.find((l) => l.id !== chosenLeaderId) ?? allBaseLeaders[0];
  const cpuLeaderId = cpuPlayer !== null ? cpuLeader?.id ?? chosenLeaderId : chosenLeaderId;
  const humanIdx = cpuPlayer === 0 ? 1 : 0;
  const p0LeaderId = chosenLeaderId;
  const p1LeaderId = cpuPlayer !== null ? cpuLeaderId : allBaseLeaders.find((l) => l.id !== p0LeaderId)?.id ?? p0LeaderId;
  const allFormCards = catalogData.cards.filter((c) => c.leaderFormOf);
  const baseDeck = catalogData.starterDeck.filter((id) => {
    const def = catalog[id];
    return !def?.leaderFormOf;
  });
  function buildDeckForLeader(leaderId) {
    const forms = allFormCards.filter((c) => c.leaderFormOf === leaderId).map((c) => c.id);
    return shuffle([...baseDeck, ...forms]);
  }
  function leaderForPlayer(player) {
    if (cpuPlayer !== null) {
      return player === humanIdx ? p0LeaderId : cpuLeaderId;
    }
    return player === 0 ? p0LeaderId : p1LeaderId;
  }
  function hpForLeader(leaderId) {
    const def = leaderId ? catalog[leaderId] : null;
    return def?.leaderMaxHp ?? LEADER_MAX_HP;
  }
  const players = [
    { ...emptyPlayer(), deck: buildDeckForLeader(leaderForPlayer(0)) },
    { ...emptyPlayer(), deck: buildDeckForLeader(leaderForPlayer(1)) }
  ];
  for (const p of [0, 1]) {
    const lid = leaderForPlayer(p);
    players[p] = { ...players[p], leaderId: lid, leaderHp: hpForLeader(lid) };
  }
  let state = {
    catalog,
    troops: {},
    essencePool: {},
    artifacts: {},
    equipments: {},
    players,
    arenas: [],
    activePlayer: 0,
    matchPhase: "setup_arenas_p0",
    turnPhase: "preparation",
    turnNumber: 1,
    winner: null,
    winReason: null,
    log: ["Escolha 2 arenas do Mundo Normal. Ruas de S\xE3o Paulo (neutra) entra automaticamente."],
    gamePhase: "mundo-normal",
    arenaPool: ARENA_POOL.map((a) => ({ ...a })),
    selectedArenaIds: [[], []],
    conquestWatch: {},
    combat: null,
    nextInstanceId: 1,
    mulliganUsed: [false, false],
    phaseWinner: null,
    arenaSetupPicks: [],
    cpuPlayer,
    testMode: null,
    pendingSpell: null
  };
  let nextId = state.nextInstanceId;
  for (const p of [0, 1]) {
    const drawn = drawCards(
      state.players[p],
      INITIAL_HAND_SIZE,
      state.troops,
      catalog,
      p,
      nextId
    );
    const pl = [...state.players];
    pl[p] = drawn.player;
    nextId = drawn.nextId;
    state = { ...state, players: pl, troops: drawn.troops, nextInstanceId: nextId };
  }
  return state;
}
function reassignPlayerLeader(state, player, leaderId, starterDeck) {
  const leaderDef = state.catalog[leaderId];
  if (!leaderDef || leaderDef.cardType !== "leader" || leaderDef.leaderFormOf) {
    return { error: "L\xEDder inv\xE1lido." };
  }
  const opp = player === 0 ? 1 : 0;
  if (state.players[opp].leaderId === leaderId) {
    return { error: "Esse L\xEDder j\xE1 foi escolhido pelo oponente." };
  }
  let troops = { ...state.troops };
  const pl = state.players[player];
  for (const id of pl.hand) {
    delete troops[id];
  }
  const forms = Object.values(state.catalog).filter((c) => c.leaderFormOf === leaderId).map((c) => c.id);
  const baseDeck = starterDeck.filter((id) => !state.catalog[id]?.leaderFormOf);
  const deck = shuffle([...baseDeck, ...forms]);
  let nextPlayer = {
    ...pl,
    leaderId,
    leaderHp: leaderDef.leaderMaxHp ?? LEADER_MAX_HP,
    deck,
    hand: []
  };
  const drawn = drawCards(
    nextPlayer,
    INITIAL_HAND_SIZE,
    troops,
    state.catalog,
    player,
    state.nextInstanceId
  );
  const players = [...state.players];
  players[player] = drawn.player;
  return {
    ...state,
    players,
    troops: drawn.troops,
    nextInstanceId: drawn.nextId,
    log: [
      ...state.log,
      `Jogador ${player + 1} escolheu ${leaderDef.name} como L\xEDder.`
    ]
  };
}
function finalizeArenas(state) {
  const [p0, p1] = state.selectedArenaIds;
  const neutral = state.arenaPool.find((a) => a.neutral && a.phase === state.gamePhase);
  const defs = [
    ...p0.map((id) => state.arenaPool.find((a) => a.id === id)),
    neutral,
    ...p1.map((id) => state.arenaPool.find((a) => a.id === id))
  ];
  const arenas = defs.map((d) => ({
    id: d.id,
    name: d.name,
    neutral: d.neutral,
    phase: d.phase,
    effect: d.effect,
    conquestPointsToDominate: d.conquestPointsToDominate,
    dominatedBy: null,
    conquestPoints: { 0: 0, 1: 0 }
  }));
  const conquestWatch = {};
  for (const a of arenas) conquestWatch[a.id] = null;
  return {
    ...state,
    arenas,
    conquestWatch,
    matchPhase: "mulligan_p0",
    log: [...state.log, "Arenas definidas. Mulligan do Jogador 1."]
  };
}
function drawFromDeck(state, player, count) {
  if (state.matchPhase === "finished" || count <= 0) return state;
  if (state.players[player].deck.length < count) {
    return applyDeckoutLoss(state, player);
  }
  let next = state;
  let nextId = state.nextInstanceId;
  const pl = [...state.players];
  const drawn = drawCards(pl[player], count, next.troops, next.catalog, player, nextId);
  pl[player] = drawn.player;
  next = { ...next, players: pl, troops: drawn.troops, nextInstanceId: drawn.nextId };
  return next;
}

// src/game/tokens.ts
function spawnTroopInArena(state, owner, arenaId, cardId, attack, health, opts) {
  if (countTroopsInZone(state, owner, "arena", arenaId) >= MAX_TROOPS_PER_ZONE) {
    return state;
  }
  const [idNum, nextId] = nextInstanceId(state);
  const instanceId = `troop-${idNum}`;
  const troop = {
    instanceId,
    cardId,
    owner,
    currentHealth: health,
    attack,
    exhausted: !opts?.entersReady,
    pinned: false,
    zone: "arena",
    arenaId,
    attachedSpell: null,
    healthBonus: 0,
    movementLocked: false,
    equipmentId: null
  };
  return {
    ...state,
    troops: { ...state.troops, [instanceId]: troop },
    nextInstanceId: nextId
  };
}
function shufflePlayerDeck(state, player) {
  const pl = { ...state.players[player] };
  const deck = [...pl.deck];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const players = [...state.players];
  players[player] = { ...pl, deck };
  return { ...state, players };
}
function addCardToDeck(state, player, cardId, shuffleAfter = true) {
  const players = [...state.players];
  players[player] = {
    ...players[player],
    deck: [...players[player].deck, cardId]
  };
  let next = {
    ...state,
    players,
    log: appendLog(state, `Carta adicionada ao baralho do Jogador ${player + 1}.`)
  };
  return shuffleAfter ? shufflePlayerDeck(next, player) : next;
}

// src/game/arena-effects.ts
var GARGOYLE_CARD = "token-gargula";
var SUSEJ_CARD = "susej-arauto";
function livingInArena(state, arenaId) {
  return [...getTroopsInZone(state, 0, "arena", arenaId), ...getTroopsInZone(state, 1, "arena", arenaId)];
}
function applyDamageToTroop(troops, troopId, damage) {
  const t = troops[troopId];
  if (!t) return troops;
  return {
    ...troops,
    [troopId]: { ...t, currentHealth: Math.max(0, t.currentHealth - damage) }
  };
}
function fillGargoyles(state, arenaId) {
  let next = state;
  for (const player of [0, 1]) {
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
    log: appendLog(next, "Esta\xE7\xE3o da Luz \u2014 G\xE1rgulas 1/1 preencheram os espa\xE7os vazios.")
  };
}
function ringueRandomBuff(state, arenaId) {
  const troops = livingInArena(state, arenaId);
  if (troops.length === 0) return state;
  const pick = troops[Math.floor(Math.random() * troops.length)];
  const troopsMap = {
    ...state.troops,
    [pick.instanceId]: {
      ...pick,
      attack: pick.attack + 1,
      currentHealth: pick.currentHealth + 1
    }
  };
  return {
    ...state,
    troops: troopsMap,
    log: appendLog(
      state,
      `Ringue do Colecionador \u2014 ${getTroopName(state, pick)} ganhou +1/+1 permanente.`
    )
  };
}
function sanatorioPingAfterStrike(state, arenaId) {
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
      "Sanat\xF3rio S\xE3o Augustinho \u2014 1 de dano em todas as tropas remanescentes."
    )
  };
}
function applyArenaOnCombatDeclared(state, arenaId) {
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
          `${arena.name} \u2014 magias bloqueadas neste combate (quando existirem).`
        )
      };
    case "spells-cost-less":
      return {
        ...state,
        combat: state.combat ? { ...state.combat, spellsCostLess: true } : state.combat,
        log: appendLog(
          state,
          `${arena.name} \u2014 magias nesta arena custam 1 a menos (quando existirem).`
        )
      };
    default:
      return state;
  }
}
function arenaBlocksNormalExit(state, arenaId) {
  return getArena(state, arenaId).effect === "no-leave-by-move";
}
function arenaUsesRandomCombatTargets(state, arenaId) {
  return getArena(state, arenaId).effect === "random-combat-target";
}
function arenaExilesDeadTroops(state, arenaId) {
  return getArena(state, arenaId).effect === "exile-on-death";
}
function spellCostReductionInCombat(state) {
  return state.combat?.spellsCostLess ? 1 : 0;
}
function applyArenaOnDominate(state, arenaId, player) {
  const arena = getArena(state, arenaId);
  let next = state;
  switch (arena.effect) {
    case "draw-two-on-dominate":
      next = drawFromDeck(next, player, 2);
      next = {
        ...next,
        log: appendLog(next, "Mans\xE3o dos Omegas \u2014 Jogador comprou 2 cartas.")
      };
      break;
    case "susej-on-dominate":
      if (next.catalog[SUSEJ_CARD]) {
        next = addCardToDeck(next, player, SUSEJ_CARD, true);
        next = {
          ...next,
          log: appendLog(
            next,
            "Col\xE9gio Aur\xE9lio \u2014 Susej embaralhado no baralho (carta em desenvolvimento)."
          )
        };
      }
      break;
    case "conquest-3-corruption": {
      const players = [...next.players];
      const cur = players[player].corruption;
      const cap = maxCorruptionForPhase(next.gamePhase);
      players[player] = {
        ...players[player],
        corruption: Math.min(cap, cur + 1)
      };
      next = {
        ...next,
        players,
        log: appendLog(
          next,
          `Templo das Sombras \u2014 Jogador ${player + 1} ganhou +1 Corrup\xE7\xE3o (${Math.min(cap, cur + 1)}/${cap}).`
        )
      };
      break;
    }
    default:
      break;
  }
  return next;
}
function isMagicAllowedInCombat(state) {
  return !state.combat?.noMagic;
}

// src/game/reino-reverso.ts
function getRRUnansweredArenaNames(state, player) {
  if (state.gamePhase !== "reino-reverso" || state.matchPhase !== "playing") {
    return [];
  }
  const other = opponent(player);
  return state.arenas.filter((a) => {
    if (a.dominatedBy !== null) return false;
    const enemyPresent = countTroopsInZone(state, other, "arena", a.id) > 0;
    const selfPresent = countTroopsInZone(state, player, "arena", a.id) > 0;
    return enemyPresent && !selfPresent;
  }).map((a) => a.name);
}
function applyRRNonResponsePenaltyAtEndTurn(state, player) {
  const arenas = getRRUnansweredArenaNames(state, player);
  if (arenas.length === 0) return state;
  const pressurer = opponent(player);
  const label = arenas.join(", ");
  return applyLeaderDamageTo(
    state,
    player,
    1,
    `Reino Reverso (${label}) \u2014 Jogador ${player + 1} n\xE3o respondeu na arena: 1 de dano no L\xEDder.`,
    pressurer
  );
}
function vacuumDamageForArena(effect) {
  return effect === "rr-vacuum-2" ? 2 : 1;
}
function destroyArenaSurvivors(state, arenaId) {
  const arena = getArena(state, arenaId);
  const troops = { ...state.troops };
  const players = [...state.players];
  const names = [];
  for (const t of Object.values(troops)) {
    if (t.zone !== "arena" || t.arenaId !== arenaId || t.currentHealth <= 0) continue;
    const p = t.owner;
    players[p] = {
      ...players[p],
      hand: players[p].hand.filter((id) => id !== t.instanceId),
      discard: [...players[p].discard, t.cardId]
    };
    names.push(getTroopName(state, t));
    delete troops[t.instanceId];
  }
  if (names.length === 0) return { ...state, troops, players };
  return {
    ...state,
    troops,
    players,
    log: appendLog(
      state,
      names.length === 1 ? `Reino Reverso (${arena.name}) \u2014 ${names[0]} foi destru\xEDda ap\xF3s o combate.` : `Reino Reverso (${arena.name}) \u2014 ${names.length} tropas destru\xEDdas ap\xF3s o combate.`
    )
  };
}
function applyVacuoAfterCombat(state, player, arenaId) {
  if (countTroopsInZone(state, player, "base") > 0) return state;
  const arena = getArena(state, arenaId);
  const damage = vacuumDamageForArena(arena.effect);
  const arenaTag = arena.effect === "rr-vacuum-2" ? " \u2014 V\xE1cuo Eterno" : "";
  return applyLeaderDamageTo(
    state,
    player,
    damage,
    `V\xE1cuo (fim do combate)${arenaTag} \u2014 Jogador ${player + 1} sem tropas na base: ${damage} de dano no L\xEDder.`,
    opponent(player)
  );
}
function applyMutualWipeLeaderDamage(state, arenaName) {
  let next = state;
  for (const p of [0, 1]) {
    next = applyLeaderDamageTo(
      next,
      p,
      1,
      `${arenaName} \u2014 ambos os lados ca\xEDram: Jogador ${p + 1} leva 1 de dano no L\xEDder.`,
      opponent(p)
    );
    if (next.matchPhase === "finished") return next;
  }
  return next;
}
function applyVacuoChecks(state, arenaId, winner) {
  const arena = getArena(state, arenaId);
  let next = state;
  if (arena.effect === "rr-loser-only-vacuum") {
    const toCheck = winner !== null ? [opponent(winner)] : [0, 1];
    for (const p of toCheck) {
      next = applyVacuoAfterCombat(next, p, arenaId);
      if (next.matchPhase === "finished") return next;
    }
    return next;
  }
  for (const p of [0, 1]) {
    next = applyVacuoAfterCombat(next, p, arenaId);
    if (next.matchPhase === "finished") return next;
  }
  return next;
}
function finalizeReinoReversoCombat(state, arenaId, winner, message) {
  const arena = getArena(state, arenaId);
  let next = {
    ...state,
    combat: null,
    turnPhase: "main",
    log: appendLog(state, message)
  };
  if (winner === null && arena.effect === "rr-mutual-wipe-leader-damage") {
    next = applyMutualWipeLeaderDamage(next, arena.name);
    if (next.matchPhase === "finished") {
      return destroyArenaSurvivors(next, arenaId);
    }
  } else if (winner !== null) {
    next = applyLeaderDamage(
      next,
      winner,
      1,
      `Reino Reverso \u2014 Jogador ${winner + 1} venceu o combate e causa 1 de dano ao L\xEDder inimigo.`
    );
    if (next.matchPhase === "finished") {
      return destroyArenaSurvivors(next, arenaId);
    }
  }
  next = destroyArenaSurvivors(next, arenaId);
  return applyVacuoChecks(next, arenaId, winner);
}

// src/game/combat-damage.ts
function applyDamage(troops, troopId, damage) {
  const t = troops[troopId];
  if (!t) return { troops, shieldBlocked: false };
  if (t.shielded && damage > 0) {
    return {
      troops: { ...troops, [troopId]: { ...t, shielded: false } },
      shieldBlocked: true
    };
  }
  const currentHealth = Math.max(0, t.currentHealth - damage);
  return { troops: { ...troops, [troopId]: { ...t, currentHealth } }, shieldBlocked: false };
}
function applyStrikeDamage(state, attacker, arenaId, strikingPlayer, initialTargetId, arenaName, randomLabel) {
  const hasFatiar = troopHasKeyword(state, attacker, "fatiar");
  let troops = { ...state.troops };
  let working = state;
  let remaining = attacker.attack;
  let currentId = initialTargetId;
  const hitParts = [];
  const alreadyHit = /* @__PURE__ */ new Set();
  const firstTargetId = initialTargetId;
  const firstTargetBefore = troops[firstTargetId];
  const firstTargetTrades = Boolean(
    firstTargetBefore && firstTargetBefore.currentHealth > 0 && firstTargetBefore.owner !== strikingPlayer && isLegalCombatTarget(working, strikingPlayer, arenaId, firstTargetBefore)
  );
  const firstTargetCounter = firstTargetTrades && firstTargetBefore ? firstTargetBefore.attack : 0;
  while (remaining > 0) {
    let target = troops[currentId];
    if (!target || target.currentHealth <= 0 || target.owner === strikingPlayer) {
      if (!hasFatiar) break;
      const next2 = pickNextCleaveTarget(working, strikingPlayer, arenaId, troops, alreadyHit);
      if (!next2) break;
      currentId = next2.instanceId;
      target = troops[currentId];
      if (!target) break;
    }
    if (hitParts.length === 0 && !isLegalCombatTarget(working, strikingPlayer, arenaId, target)) {
      break;
    }
    if (hitParts.length > 0 && !getLegalCombatTargets(working, strikingPlayer, arenaId).some(
      (t) => t.instanceId === currentId
    )) {
      break;
    }
    const hpBefore = target.currentHealth;
    const dmgResult = applyDamage(troops, currentId, remaining);
    troops = dmgResult.troops;
    if (dmgResult.shieldBlocked) {
      hitParts.push(`${getTroopName(working, target)} (escudo absorveu)`);
      alreadyHit.add(currentId);
      break;
    }
    const tAfter = troops[currentId];
    const dealt = hpBefore - (tAfter?.currentHealth ?? 0);
    remaining -= dealt;
    alreadyHit.add(currentId);
    if (dealt > 0) {
      hitParts.push(`${getTroopName(working, target)} (${dealt})`);
    }
    if (tAfter && tAfter.currentHealth > 0) {
      working = { ...working, troops };
      working = applyVincularAfterCombatHit(working, attacker, tAfter);
      troops = working.troops;
    }
    if (!hasFatiar || remaining <= 0) break;
    const next = pickNextCleaveTarget(working, strikingPlayer, arenaId, troops, alreadyHit);
    if (!next) break;
    currentId = next.instanceId;
    working = { ...working, troops };
  }
  let counterShielded = false;
  if (firstTargetTrades && firstTargetCounter > 0) {
    const counterResult = applyDamage(troops, attacker.instanceId, firstTargetCounter);
    troops = counterResult.troops;
    counterShielded = counterResult.shieldBlocked;
  }
  const attackerName = getTroopName(state, attacker);
  const attackerAfter = troops[attacker.instanceId];
  const counterDealt = counterShielded ? 0 : firstTargetCounter > 0 && attackerAfter ? Math.max(0, attacker.currentHealth - attackerAfter.currentHealth) : 0;
  let logLine;
  if (hitParts.length === 0) {
    logLine = `${attackerName} n\xE3o conseguiu ferir o alvo em ${arenaName}.`;
  } else if (hitParts.length === 1) {
    const tradeNote = counterShielded ? ` Revida: escudo de ${attackerName} absorveu.` : counterDealt > 0 ? ` Revida: ${counterDealt} em ${attackerName}.` : "";
    logLine = randomLabel ? `${attackerName} atacou ${hitParts[0]} em ${arenaName} (alvo aleat\xF3rio \u2014 Cidade das Curvas).${tradeNote}` : `${attackerName} atacou ${hitParts[0]} em ${arenaName} (troca de dano).${tradeNote}`;
  } else {
    logLine = `${attackerName} atacou ${hitParts.join(", ")} em ${arenaName}${hasFatiar ? " (Fatiar)" : ""}.`;
  }
  let finalState = { ...state, troops };
  const attackerFinal = troops[attacker.instanceId];
  if (attacker.isFrostborn && hitParts.length > 0) {
    const roll = Math.floor(Math.random() * 6) + 1;
    const frozen = roll % 2 === 0;
    const firstTarget = troops[firstTargetId];
    if (frozen && firstTarget && firstTarget.currentHealth > 0) {
      troops[firstTargetId] = { ...firstTarget, attackSuppressed: true };
      finalState = {
        ...finalState,
        troops: { ...troops },
        log: appendLog(finalState, `Congelar \u2014 ${getTroopName(finalState, firstTarget)} congelado(a)! (1d6 = ${roll}, par \u2192 attackSuppressed)`)
      };
    } else {
      finalState = {
        ...finalState,
        log: appendLog(finalState, `Congelar \u2014 1d6 = ${roll} (${frozen ? "par, mas alvo caiu" : "\xEDmpar, sem efeito"}).`)
      };
    }
  }
  if (attacker.isFrostborn && attackerFinal && attackerFinal.currentHealth > 0 && hitParts.length > 0 && finalState.players[attacker.owner].leaderId === "noah-vampiro-inverno") {
    const firstTarget = troops[firstTargetId];
    const hpBefore = firstTarget ? Math.min(attacker.attack, state.troops[firstTargetId]?.currentHealth ?? 0) : 0;
    const damageDealt = hpBefore > 0 ? hpBefore : 0;
    if (damageDealt > 0) {
      const catalogDef = finalState.catalog[attacker.cardId];
      const maxHp = catalogDef ? catalogDef.health + (attacker.healthBonus ?? 0) : attacker.currentHealth;
      const healed = Math.min(damageDealt, maxHp - attackerFinal.currentHealth);
      if (healed > 0) {
        troops[attacker.instanceId] = {
          ...attackerFinal,
          currentHealth: attackerFinal.currentHealth + healed
        };
        finalState = {
          ...finalState,
          troops: { ...troops },
          log: appendLog(finalState, `Vampirismo \u2014 ${getTroopName(finalState, attacker)} curou ${healed} HP (dano causado ao alvo).`)
        };
      }
    }
  }
  return {
    state: finalState,
    troops: finalState.troops,
    logLine
  };
}

// src/game/combat.ts
function livingTroops(troops) {
  return troops.filter((t) => t.currentHealth > 0);
}
function getCombatAssigningPlayer(combat) {
  return combat.strikingPlayer;
}
function getContestedArenaNames(state, player) {
  return state.arenas.filter((a) => {
    if (a.dominatedBy !== null) return false;
    const mine = getTroopsInZone(state, player, "arena", a.id).length > 0;
    const theirs = getTroopsInZone(state, opponent(player), "arena", a.id).length > 0;
    return mine && theirs;
  }).map((a) => a.name);
}
function alliesInCombatArena(state, player) {
  if (!state.combat) return [];
  return livingTroops(getTroopsInZone(state, player, "arena", state.combat.arenaId));
}
function canTroopAttackInStrike(combat, troop) {
  return !combat.attackedThisStrike.includes(troop.instanceId) && !troop.exhausted && !troop.attackSuppressed;
}
function hasAttackableAlliesInStrike(state, player) {
  if (!state.combat || state.combat.subPhase !== "strike") return false;
  const allies = alliesInCombatArena(state, player);
  return allies.some((t) => canTroopAttackInStrike(state.combat, t));
}
function tryAutoEndStrike(state) {
  if (!state.combat || state.combat.subPhase !== "strike") return state;
  const striker = state.combat.strikingPlayer;
  if (hasAttackableAlliesInStrike(state, striker)) return state;
  return endCombatStrike({
    ...state,
    log: appendLog(
      state,
      `Jogador ${striker + 1} concluiu os ataques \u2014 passando a vez.`
    )
  });
}
function endCombat(state, message) {
  return {
    ...state,
    combat: null,
    turnPhase: "main",
    log: appendLog(state, message)
  };
}
function finishCombatWithWinner(state, arenaId, winner, message) {
  if (state.gamePhase === "reino-reverso") {
    return finalizeReinoReversoCombat(state, arenaId, winner, message);
  }
  return endCombat(state, message);
}
function isSanatorioArena(state, arenaId) {
  return getArena(state, arenaId).effect === "ping-after-strike";
}
function combatWouldEnd(state, arenaId) {
  const p0 = livingTroops(getTroopsInZone(state, 0, "arena", arenaId));
  const p1 = livingTroops(getTroopsInZone(state, 1, "arena", arenaId));
  return p0.length === 0 || p1.length === 0;
}
function applySanatorioIfStrikeEndsCombat(state, arenaId) {
  if (!state.combat || !isSanatorioArena(state, arenaId)) return state;
  if (!combatWouldEnd(state, arenaId)) return state;
  return sanatorioPingAfterStrike(state, arenaId);
}
function checkCombatEndAfterDamage(state, arenaId, messagePrefix) {
  const p0 = livingTroops(getTroopsInZone(state, 0, "arena", arenaId));
  const p1 = livingTroops(getTroopsInZone(state, 1, "arena", arenaId));
  if (p0.length === 0 && p1.length === 0) {
    const msg = `${messagePrefix} \u2014 ambos os lados ca\xEDram.`;
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
      `${messagePrefix} \u2014 Jogador ${winner + 1} venceu na arena.`
    );
  }
  return state;
}
function beginCombatStrikePhase(state) {
  if (!state.combat) return state;
  const combat = state.combat;
  const arena = getArena(state, combat.arenaId);
  const role = combat.strikingPlayer === combat.declaredBy ? "atacante" : "defensor";
  return {
    ...state,
    combat: {
      ...combat,
      subPhase: "strike",
      magicPassed: [false, false],
      attackedThisStrike: []
    },
    log: appendLog(
      state,
      `Golpe ${combat.strike} em ${arena.name} \u2014 Jogador ${combat.strikingPlayer + 1} (${role}): um ataque por vez.`
    )
  };
}
function beginCombatMagicPhase(state, opts) {
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
      attackedThisStrike: []
    },
    log: appendLog(
      state,
      `Fase de magias ${opts.magicWindow} (${arena.name}) \u2014 ambos podem lan\xE7ar magias de combate/r\xE1pidas ou passar.`
    )
  };
}
function passCombatMagic(state, player) {
  if (!state.combat || state.combat.subPhase !== "magic") {
    return { ...state, log: appendLog(state, "N\xE3o h\xE1 fase de magias agora.") };
  }
  if (state.combat.magicPassed[player]) {
    return {
      ...state,
      log: appendLog(state, `Jogador ${player + 1} j\xE1 passou nesta fase de magias.`)
    };
  }
  const magicPassed = [...state.combat.magicPassed];
  magicPassed[player] = true;
  let next = {
    ...state,
    combat: { ...state.combat, magicPassed },
    log: appendLog(
      state,
      `Jogador ${player + 1} passou na fase de magias ${state.combat.magicWindow}.`
    )
  };
  if (magicPassed[0] && magicPassed[1]) {
    next = beginCombatStrikePhase(next);
  }
  return next;
}
function advanceToNextStrike(state) {
  if (!state.combat) return state;
  const { arenaId, strikingPlayer, strike } = state.combat;
  let stateAfterPing = state;
  if (isSanatorioArena(state, arenaId) && !combatWouldEnd(state, arenaId)) {
    stateAfterPing = sanatorioPingAfterStrike(state, arenaId);
  }
  stateAfterPing = checkCombatEndAfterDamage(
    stateAfterPing,
    arenaId,
    "Combate encerrado ap\xF3s efeito da arena"
  );
  if (!stateAfterPing.combat) return stateAfterPing;
  const nextStriker = opponent(strikingPlayer);
  const nextAllies = alliesInCombatArena(stateAfterPing, nextStriker);
  if (nextAllies.length === 0) {
    return finishCombatWithWinner(
      stateAfterPing,
      arenaId,
      strikingPlayer,
      `Combate encerrado \u2014 Jogador ${strikingPlayer + 1} venceu na arena.`
    );
  }
  const nextStrike = strike + 1;
  return beginCombatMagicPhase(stateAfterPing, {
    strike: nextStrike,
    strikingPlayer: nextStriker,
    magicWindow: nextStrike
  });
}
function executeCombatAttack(state, attackerId, targetId) {
  if (!state.combat || state.turnPhase !== "combat") return state;
  if (state.combat.subPhase !== "strike") {
    return {
      ...state,
      log: appendLog(state, "Aguarde o fim da fase de magias para atacar.")
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
      log: appendLog(state, "Esta tropa j\xE1 atacou neste golpe.")
    };
  }
  if (attacker.exhausted) {
    return {
      ...state,
      log: appendLog(state, `${getTroopName(state, attacker)} est\xE1 exausta e n\xE3o pode atacar.`)
    };
  }
  if (attacker.attackSuppressed) {
    return {
      ...state,
      log: appendLog(state, `${getTroopName(state, attacker)} n\xE3o pode atacar (Constri\xE7\xE3o).`)
    };
  }
  if (attacker.zone !== "arena" || attacker.arenaId !== arenaId || attacker.currentHealth <= 0) {
    return state;
  }
  let resolvedTargetId = targetId;
  if (arenaUsesRandomCombatTargets(state, arenaId)) {
    const enemies = livingTroops(
      getTroopsInZone(state, opponent(strikingPlayer), "arena", arenaId)
    );
    if (enemies.length === 0) {
      return {
        ...state,
        log: appendLog(state, "Cidade das Curvas \u2014 n\xE3o h\xE1 alvos inimigos vivos.")
      };
    }
    const pick = enemies[Math.floor(Math.random() * enemies.length)];
    resolvedTargetId = pick.instanceId;
    target = pick;
  } else {
    if (!target || target.owner === strikingPlayer) {
      return { ...state, log: appendLog(state, "Escolha uma tropa inimiga como alvo.") };
    }
    if (target.zone !== "arena" || target.arenaId !== arenaId || target.currentHealth <= 0) {
      return { ...state, log: appendLog(state, "Alvo inv\xE1lido ou j\xE1 destru\xEDdo.") };
    }
    if (!isLegalCombatTarget(state, strikingPlayer, arenaId, target)) {
      return {
        ...state,
        log: appendLog(
          state,
          "H\xE1 Protetores inimigos \u2014 ataque um Protetor antes das outras tropas."
        )
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
      log: appendLog(nextAfterEncore, "Alvo inv\xE1lido ou j\xE1 destru\xEDdo.")
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
    arenaUsesRandomCombatTargets(state, arenaId)
  );
  let next = {
    ...strike.state,
    troops: strike.troops,
    combat: {
      ...nextAfterEncore.combat,
      attackedThisStrike: [...attackedThisStrike, attackerId]
    },
    log: appendLog(nextAfterEncore, strike.logLine)
  };
  next = applySanatorioIfStrikeEndsCombat(next, arenaId);
  next = checkCombatEndAfterDamage(next, arenaId, "Combate encerrado");
  if (!next.combat) return next;
  return tryAutoEndStrike(next);
}
function endCombatStrike(state) {
  if (!state.combat || state.turnPhase !== "combat") return state;
  if (state.combat.subPhase !== "strike") {
    return {
      ...state,
      log: appendLog(state, "S\xF3 \xE9 poss\xEDvel encerrar o golpe durante a fase de ataques.")
    };
  }
  const { strikingPlayer, strike } = state.combat;
  return advanceToNextStrike({
    ...state,
    log: appendLog(state, `Jogador ${strikingPlayer + 1} encerrou o golpe ${strike}.`)
  });
}
function startCombat(state, arenaId) {
  const arena = getArena(state, arenaId);
  if (arena.dominatedBy !== null) {
    return {
      ...state,
      log: appendLog(state, `${arena.name} est\xE1 dominada \u2014 combate n\xE3o \xE9 permitido.`)
    };
  }
  const p0 = livingTroops(getTroopsInZone(state, 0, "arena", arenaId));
  const p1 = livingTroops(getTroopsInZone(state, 1, "arena", arenaId));
  if (p0.length === 0 || p1.length === 0) {
    return {
      ...state,
      log: appendLog(state, "Combate requer tropas dos dois jogadores na arena.")
    };
  }
  const declaredBy = state.activePlayer;
  const combat = {
    arenaId,
    strike: 1,
    declaredBy,
    strikingPlayer: declaredBy,
    attackedThisStrike: [],
    subPhase: "magic",
    magicWindow: 1,
    magicPassed: [false, false]
  };
  let next = {
    ...state,
    combat,
    turnPhase: "combat",
    log: appendLog(state, `Combate declarado em ${arena.name}!`)
  };
  next = applyArenaOnCombatDeclared(next, arenaId);
  return {
    ...next,
    log: appendLog(
      next,
      `Fase de magias 1 (${arena.name}) \u2014 ambos podem lan\xE7ar magias de combate/r\xE1pidas ou passar.`
    )
  };
}

// src/game/conquest.ts
function pinTroopsInArena(state, arenaId, player) {
  const troops = { ...state.troops };
  for (const t of getTroopsInZone(state, player, "arena", arenaId)) {
    troops[t.instanceId] = { ...t, pinned: true };
  }
  return { ...state, troops };
}
function applyDomination(state, arena, player) {
  if (state.gamePhase === "reino-reverso") return state;
  const arenas = state.arenas.map(
    (a) => a.id === arena.id ? { ...a, dominatedBy: player } : a
  );
  const players = [...state.players];
  players[player] = {
    ...players[player],
    dominatedArenas: players[player].dominatedArenas + 1
  };
  let next = {
    ...state,
    arenas,
    players,
    conquestWatch: { ...state.conquestWatch, [arena.id]: null }
  };
  next = pinTroopsInArena(next, arena.id, player);
  next = applyArenaOnDominate(next, arena.id, player);
  const domCount = players[player].dominatedArenas;
  next = applyLeaderDamage(
    next,
    player,
    1,
    `Jogador ${player + 1} conquistou ${arena.name}! (\u22121 vida do l\xEDder inimigo)`
  );
  if (next.matchPhase === "finished") return next;
  const threshold = dominationsToWinPhase(state.gamePhase);
  if (threshold !== null && domCount >= threshold) {
    return beginPhaseEndChoice(next, player, state.gamePhase);
  }
  return next;
}
function awardConquestPoint(state, arenaId, player) {
  if (state.gamePhase === "reino-reverso") return state;
  const arena = getArena(state, arenaId);
  if (arena.dominatedBy !== null) return state;
  const cap = arena.conquestPointsToDominate;
  const points = { ...arena.conquestPoints };
  points[player] = Math.min(cap, points[player] + 1);
  let next = {
    ...state,
    arenas: state.arenas.map(
      (a) => a.id === arenaId ? { ...a, conquestPoints: points } : a
    ),
    log: appendLog(
      state,
      `Jogador ${player + 1} +1 ponto de conquista em ${arena.name} (${points[player]}/${cap})`
    )
  };
  if (points[player] >= cap) {
    next = applyDomination(next, getArena(next, arenaId), player);
  }
  return next;
}
function processStartPhase(state) {
  if (state.gamePhase === "reino-reverso") return state;
  const player = state.activePlayer;
  let next = { ...state };
  for (const arena of state.arenas) {
    if (arena.dominatedBy !== null) continue;
    const watch = state.conquestWatch[arena.id];
    if (!watch || watch.player !== player) continue;
    const stillThere = getTroopsInZone(next, player, "arena", arena.id).length > 0;
    const contested = getTroopsInZone(next, opponent(player), "arena", arena.id).length > 0;
    if (!stillThere || contested) {
      next = {
        ...next,
        conquestWatch: { ...next.conquestWatch, [arena.id]: null }
      };
      continue;
    }
    next = awardConquestPoint(next, arena.id, player);
    next = { ...next, conquestWatch: { ...next.conquestWatch, [arena.id]: null } };
  }
  return next;
}
function setConquestWatchOnEndTurn(state, player) {
  if (state.gamePhase === "reino-reverso") {
    return { ...state, conquestWatch: { ...state.conquestWatch } };
  }
  const watch = { ...state.conquestWatch };
  for (const arena of state.arenas) {
    if (arena.dominatedBy !== null) {
      watch[arena.id] = null;
      continue;
    }
    const hasTroop = getTroopsInZone(state, player, "arena", arena.id).length > 0;
    const contested = getTroopsInZone(state, opponent(player), "arena", arena.id).length > 0;
    const existing = watch[arena.id];
    if (hasTroop && !contested) {
      watch[arena.id] = { player };
    } else if (existing?.player === player) {
      watch[arena.id] = null;
    }
  }
  return { ...state, conquestWatch: watch };
}

// src/game/turn.ts
function untapPlayer(state, player) {
  const troops = { ...state.troops };
  for (const t of Object.values(troops)) {
    if (t.owner === player && (t.zone === "base" || t.zone === "arena")) {
      troops[t.instanceId] = {
        ...t,
        exhausted: false,
        etherealThisTurn: false
      };
    }
  }
  return { ...state, troops };
}
function clearAttackSuppressionForPlayer(state, player) {
  const troops = { ...state.troops };
  for (const t of Object.values(troops)) {
    if (t.owner === player && t.attackSuppressed) {
      troops[t.instanceId] = { ...t, attackSuppressed: false };
    }
  }
  return { ...state, troops };
}
function untapArtifacts(state, player) {
  const artifacts = { ...state.artifacts };
  let changed = false;
  for (const a of Object.values(artifacts)) {
    if (a.owner === player && a.exhausted) {
      artifacts[a.instanceId] = { ...a, exhausted: false };
      changed = true;
    }
  }
  return changed ? { ...state, artifacts } : state;
}
function resetTurnFlags(state, player) {
  const players = [...state.players];
  players[player] = {
    ...players[player],
    sacrificedThisTurn: false,
    leaderAbilityUsedThisTurn: false,
    leaderExhausted: false
  };
  return { ...state, players };
}
function clearTemporaryEssence(state, player) {
  const pl = state.players[player];
  const tempIds = pl.essenceIds.filter((id) => {
    const e = state.essencePool[id];
    return e?.spellOnly;
  });
  if (tempIds.length === 0) return state;
  const essencePool = { ...state.essencePool };
  for (const id of tempIds) delete essencePool[id];
  const tempSet = new Set(tempIds);
  const players = [...state.players];
  players[player] = {
    ...players[player],
    essenceIds: pl.essenceIds.filter((id) => !tempSet.has(id))
  };
  return { ...state, players, essencePool };
}
function runTurnBegin(state, player) {
  let next = {
    ...state,
    activePlayer: player,
    turnPhase: "preparation"
  };
  next = untapPlayer(next, player);
  next = untapEssence(next, player);
  next = untapArtifacts(next, player);
  next = clearMovementLocksForPlayer(next, player);
  next = clearAttackSuppressionForPlayer(next, player);
  next = resetTurnFlags(next, player);
  next = clearTemporaryEssence(next, opponent(player));
  next = {
    ...next,
    log: appendLog(next, `Jogador ${player + 1} \u2014 fase de prepara\xE7\xE3o (desvirar).`)
  };
  next = { ...next, turnPhase: "draw" };
  if (next.players[player].deck.length >= CARDS_DRAW_PER_TURN) {
    next = drawFromDeck(next, player, CARDS_DRAW_PER_TURN);
    if (next.matchPhase === "finished") return next;
    next = {
      ...next,
      log: appendLog(
        next,
        `Jogador ${player + 1} \u2014 fase de compra (+${CARDS_DRAW_PER_TURN} carta).`
      )
    };
  } else {
    next = drawFromDeck(next, player, CARDS_DRAW_PER_TURN);
    if (next.matchPhase === "finished") return next;
  }
  next = { ...next, turnPhase: "start" };
  next = processStartPhase(next);
  if (next.matchPhase === "finished") return next;
  next = sanitizePlayerHands(next);
  return { ...next, turnPhase: "main" };
}
function repairStaleTurnPhase(state) {
  if (state.matchPhase === "playing" && !state.combat && state.turnPhase === "combat") {
    return { ...state, turnPhase: "main" };
  }
  return state;
}

// src/game/troop-cleanup.ts
function buryDeadTroops(state) {
  const dead = Object.values(state.troops).filter((t) => {
    if (t.zone !== "base" && t.zone !== "arena") return false;
    if (t.currentHealth > 0) return false;
    const def = state.catalog[t.cardId];
    if (isSpellCard(def)) return false;
    return true;
  });
  if (dead.length === 0) return state;
  let next = state;
  for (const t of dead) {
    next = applyTroopDeathTriggers(next, t);
    if (next.matchPhase === "finished") return next;
  }
  const troops = { ...next.troops };
  const players = [...next.players];
  let equipments = { ...next.equipments };
  const buriedNames = [];
  const exiledNames = [];
  for (const t of dead) {
    const p = t.owner;
    const pl = { ...players[p] };
    pl.hand = pl.hand.filter((id) => id !== t.instanceId);
    const name = getTroopName(next, t);
    if (t.equipmentId) {
      const eq = equipments[t.equipmentId];
      if (eq) {
        pl.discard = [...pl.discard, eq.cardId];
        delete equipments[t.equipmentId];
      }
    }
    const exiled = t.arenaId !== null && arenaExilesDeadTroops(state, t.arenaId);
    if (exiled) {
      pl.exile = [...pl.exile, t.cardId];
      exiledNames.push(name);
    } else {
      pl.discard = [...pl.discard, t.cardId];
      buriedNames.push(name);
    }
    players[p] = pl;
    delete troops[t.instanceId];
  }
  next = { ...next, troops, players, equipments };
  if (buriedNames.length === 1) {
    next = {
      ...next,
      log: appendLog(next, `${buriedNames[0]} foi para o descarte.`)
    };
  } else if (buriedNames.length > 1) {
    next = {
      ...next,
      log: appendLog(next, `${buriedNames.length} tropas foram para o descarte.`)
    };
  }
  if (exiledNames.length === 1) {
    next = {
      ...next,
      log: appendLog(next, `${exiledNames[0]} foi exilada (Pris\xE3o do Conglomerado).`)
    };
  } else if (exiledNames.length > 1) {
    next = {
      ...next,
      log: appendLog(
        next,
        `${exiledNames.length} tropas foram exiladas (Pris\xE3o do Conglomerado).`
      )
    };
  }
  return next;
}

// src/game/actions.ts
function endPlayerTurn(state) {
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
        `H\xE1 tropas inimigas em: ${contested.join(", ")}. Declare combate antes de encerrar o turno.`
      )
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
    log: appendLog(next, `Fim do turno \u2014 vez do Jogador ${nextPlayer + 1}`)
  };
  return runTurnBegin(next, nextPlayer);
}
function handleMulligan(state, player, handIndices) {
  if (state.mulliganUsed[player]) {
    return { ...state, log: appendLog(state, "Mulligan j\xE1 usado nesta partida.") };
  }
  const indices = [...new Set(handIndices)].sort((a, b) => b - a);
  if (indices.some((i) => i < 0 || i >= state.players[player].hand.length)) {
    return state;
  }
  const pl = { ...state.players[player] };
  const troops = { ...state.troops };
  const cardIdsToReturn = [];
  for (const i of indices) {
    const troopId = pl.hand[i];
    if (!troopId) continue;
    const t = troops[troopId];
    if (t) cardIdsToReturn.push(t.cardId);
    delete troops[troopId];
    pl.hand.splice(i, 1);
  }
  pl.deck = shuffleDeck([...pl.deck, ...cardIdsToReturn]);
  let next = {
    ...state,
    troops,
    players: [...state.players],
    mulliganUsed: [...state.mulliganUsed]
  };
  next.players[player] = pl;
  next.mulliganUsed[player] = true;
  next = drawFromDeck(next, player, cardIdsToReturn.length);
  next = {
    ...next,
    log: appendLog(
      next,
      `Jogador ${player + 1} fez mulligan de ${cardIdsToReturn.length} carta(s).`
    )
  };
  return advanceMulliganPhase(next);
}
function shuffleDeck(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function advanceMulliganPhase(state) {
  if (state.matchPhase === "mulligan_p0") {
    return { ...state, matchPhase: "mulligan_p1", log: appendLog(state, "Mulligan do Jogador 2.") };
  }
  if (state.matchPhase === "mulligan_p1") {
    const started = {
      ...state,
      matchPhase: "playing",
      log: appendLog(state, "Partida iniciada! Jogador 1 come\xE7a.")
    };
    return runTurnBegin(started, 0);
  }
  return state;
}
function playTroop(state, troopId) {
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
      log: appendLog(state, "Esta carta n\xE3o pertence ao jogador da vez.")
    };
  }
  const def = state.catalog[troop.cardId];
  if (!def) return state;
  if (isLeaderFormCard(def)) {
    return {
      ...state,
      log: appendLog(state, `${def.name} \xE9 uma forma do L\xEDder \u2014 sacrifique (\u2726) para recursos ou use para evoluir (5 Corrup\xE7\xE3o).`)
    };
  }
  if (getCardType(def) === "artifact") {
    return playArtifact(state, troopId, player, def);
  }
  if (isEquipmentCard(def)) {
    return {
      ...state,
      log: appendLog(state, `${def.name} \u2014 selecione a carta e clique em uma tropa aliada para equipar.`)
    };
  }
  if (!isTroopCard(def)) {
    return {
      ...state,
      log: appendLog(state, "Magias devem ser lan\xE7adas em uma tropa \u2014 selecione a magia e clique no alvo.")
    };
  }
  const payment = getEssenceCost(def);
  const corruptionCost = getCorruptionCost(def);
  if (!canAffordCardCost(state, player, def, payment)) {
    const pl2 = state.players[player];
    const corMsg = corruptionCost > 0 && pl2.corruption < corruptionCost ? ` Corrup\xE7\xE3o: precisa ${corruptionCost}, tem ${pl2.corruption}.` : "";
    return {
      ...state,
      log: appendLog(
        state,
        `Recursos insuficientes (${formatCardCost(def)}; ess\xEAncia pronta: ${getAvailableEssence(state, player).length}).${corMsg}`
      )
    };
  }
  const nonTempAvail = getAvailableNonTempEssence(state, player);
  if (nonTempAvail.length < payment.exhaust) {
    return {
      ...state,
      log: appendLog(state, "Ess\xEAncia tempor\xE1ria s\xF3 pode pagar feiti\xE7os \u2014 insuficiente para tropas.")
    };
  }
  if (countTroopsInZone(state, player, "base") >= MAX_TROOPS_PER_ZONE) {
    return { ...state, log: appendLog(state, "Base cheia (m\xE1x. 3 tropas).") };
  }
  const paid = payEssenceCost(state, player, payment);
  if (!paid.ok) {
    return { ...state, log: appendLog(state, "N\xE3o foi poss\xEDvel pagar o custo em Ess\xEAncia.") };
  }
  let next = paid.state;
  const paidCorruption = payCorruptionCost(next, player, corruptionCost);
  if (!paidCorruption.ok) {
    return { ...state, log: appendLog(next, "N\xE3o foi poss\xEDvel pagar o custo em Corrup\xE7\xE3o.") };
  }
  next = paidCorruption.state;
  const hand = next.players[player].hand.filter((id) => id !== troopId);
  const players = [...next.players];
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
    healthBonus: troop.healthBonus
  };
  next = {
    ...next,
    players,
    troops,
    log: appendLog(
      next,
      `Jogador ${player + 1} convocou ${def.name} na base (${entersReady ? "Investida \u2014 pronta" : "exausta"}). Custo: ${formatCardCost(def)}.`
    )
  };
  if (cardHasKeyword(def, "aterrisagem") && def.landingEffect) {
    next = applyLandingEffect(next, next.troops[troopId]);
  }
  return sanitizePlayerHands(next);
}
function sacrificeEssence(state, troopId) {
  if (state.turnPhase !== "main" || state.combat) return state;
  const player = state.activePlayer;
  const pl = state.players[player];
  if (pl.sacrificedThisTurn) {
    return { ...state, log: appendLog(state, "J\xE1 sacrificou ess\xEAncia neste turno.") };
  }
  if (!pl.hand.includes(troopId)) return state;
  const troop = state.troops[troopId];
  if (!troop) return state;
  if (troop.owner !== player) {
    return {
      ...state,
      log: appendLog(state, "Esta carta n\xE3o pertence ao jogador da vez.")
    };
  }
  const def = state.catalog[troop.cardId];
  if (isSpellCard(def)) {
    return { ...state, log: appendLog(state, "Magias n\xE3o podem virar Ess\xEAncia.") };
  }
  if (!def?.hasEssenceSymbol) {
    return { ...state, log: appendLog(state, "Esta carta n\xE3o tem s\xEDmbolo de Ess\xEAncia.") };
  }
  const reward = def.sacrificeReward ?? { essence: 1, corruption: 0 };
  let idCounter = state.nextInstanceId;
  const newEssenceIds = [];
  let essencePool = { ...state.essencePool };
  for (let i = 0; i < reward.essence; i++) {
    const essenceId = `essence-${idCounter++}`;
    essencePool[essenceId] = {
      instanceId: essenceId,
      cardId: troop.cardId,
      owner: player,
      exhausted: false
    };
    newEssenceIds.push(essenceId);
  }
  const cap = maxCorruptionForPhase(state.gamePhase);
  const corruptionGain = Math.min(reward.corruption, cap - pl.corruption);
  const hand = pl.hand.filter((hid) => hid !== troopId);
  const players = [...state.players];
  players[player] = {
    ...pl,
    hand,
    essenceIds: [...pl.essenceIds, ...newEssenceIds],
    sacrificedThisTurn: true,
    corruption: pl.corruption + corruptionGain
  };
  const troops = { ...state.troops };
  delete troops[troopId];
  const parts = [];
  if (reward.essence > 0) parts.push(`${reward.essence} Ess\xEAncia`);
  if (corruptionGain > 0) parts.push(`${corruptionGain} Corrup\xE7\xE3o`);
  const rewardLabel = parts.join(" + ") || "Ess\xEAncia";
  return sanitizePlayerHands({
    ...state,
    players,
    troops,
    essencePool,
    nextInstanceId: idCounter,
    log: appendLog(
      state,
      `Jogador ${player + 1} sacrificou ${def.name} \u2192 ${rewardLabel}.`
    )
  });
}
function moveTroop(state, troopId, to, arenaId) {
  if (state.turnPhase !== "main" || state.combat) return state;
  const troop = state.troops[troopId];
  if (!troop || troop.owner !== state.activePlayer) return state;
  if (troop.pinned) {
    return { ...state, log: appendLog(state, "Tropa presa \u2014 n\xE3o pode mover.") };
  }
  if (troop.movementLocked) {
    return {
      ...state,
      log: appendLog(
        state,
        `${getTroopName(state, troop)} est\xE1 vinculada \u2014 n\xE3o pode se mover neste turno.`
      )
    };
  }
  if (troop.exhausted) {
    return {
      ...state,
      log: appendLog(
        state,
        `${getTroopName(state, troop)} est\xE1 exausta \u2014 passe o turno para desvirar (prepara\xE7\xE3o).`
      )
    };
  }
  const player = state.activePlayer;
  if (to === "base") {
    if (troop.zone !== "arena") return state;
    if (troop.arenaId && arenaBlocksNormalExit(state, troop.arenaId)) {
      const arena2 = state.arenas.find((a) => a.id === troop.arenaId);
      return {
        ...state,
        log: appendLog(
          state,
          `${arena2?.name ?? "Arena"} \u2014 tropas n\xE3o podem sair pelo movimento normal.`
        )
      };
    }
    if (countTroopsInZone(state, player, "base") >= MAX_TROOPS_PER_ZONE) {
      return { ...state, log: appendLog(state, "Base cheia.") };
    }
    const troops2 = { ...state.troops };
    troops2[troopId] = { ...troop, zone: "base", arenaId: null, exhausted: true };
    return {
      ...state,
      troops: troops2,
      log: appendLog(state, `${getTroopName(state, troop)} retornou \xE0 base.`)
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
        `${arena.name} est\xE1 dominada \u2014 n\xE3o \xE9 poss\xEDvel enviar tropas para l\xE1.`
      )
    };
  }
  if (troop.zone === "arena" && troop.arenaId === arenaId) {
    return { ...state, log: appendLog(state, "A tropa j\xE1 est\xE1 nesta arena.") };
  }
  if (troop.zone === "arena" && troop.arenaId !== arenaId) {
    if (!troopCanFlyBetweenArenas(state, troop)) {
      return {
        ...state,
        log: appendLog(state, "S\xF3 tropas com Voar podem mudar de arena diretamente.")
      };
    }
    if (troop.arenaId && arenaBlocksNormalExit(state, troop.arenaId)) {
      const from = state.arenas.find((a) => a.id === troop.arenaId);
      return {
        ...state,
        log: appendLog(
          state,
          `${from?.name ?? "Arena"} \u2014 tropas n\xE3o podem sair pelo movimento normal.`
        )
      };
    }
    if (countTroopsInZone(state, player, "arena", arenaId) >= MAX_TROOPS_PER_ZONE) {
      return { ...state, log: appendLog(state, "Arena de destino cheia.") };
    }
    const troops2 = { ...state.troops };
    troops2[troopId] = { ...troop, zone: "arena", arenaId, exhausted: true };
    return {
      ...state,
      troops: troops2,
      log: appendLog(
        state,
        `${getTroopName(state, troop)} voou para ${arena.name} (exausta).`
      )
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
    log: appendLog(state, `${getTroopName(state, troop)} foi para ${arena.name}.`)
  };
}
function findArenaDef(state, arenaId) {
  return state.arenaPool.find((a) => {
    if (a.id !== arenaId || a.phase !== state.gamePhase) return false;
    if (a.neutral && state.gamePhase !== "reino-reverso") return false;
    return true;
  });
}
function selectMundoNormalArena(state, player, arenaId) {
  const expected = player === 0 ? "setup_arenas_p0" : "setup_arenas_p1";
  if (state.matchPhase !== expected) return state;
  if (!findArenaDef(state, arenaId)) return state;
  const selected = [...state.selectedArenaIds];
  const list = selected[player];
  if (list.includes(arenaId)) {
    selected[player] = list.filter((id) => id !== arenaId);
  } else if (list.length < 2) {
    const taken = selected[opponent(player)];
    if (taken.includes(arenaId)) {
      return { ...state, log: appendLog(state, "Arena j\xE1 escolhida pelo outro jogador.") };
    }
    selected[player] = [...list, arenaId];
  }
  let next = { ...state, selectedArenaIds: selected };
  if (selected[player].length === 2) {
    if (player === 0) {
      next = {
        ...next,
        matchPhase: "setup_arenas_p1",
        log: appendLog(next, "Jogador 2: escolha 2 arenas.")
      };
    } else {
      next = finalizeArenas(next);
    }
  }
  return next;
}
function selectAbismoWinnerArena(state, player, arenaId) {
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
        `Jogador ${loser + 1} escolhe 1 arena do Abismo (restante).`
      )
    };
  }
  return { ...state, arenaSetupPicks: picks };
}
function selectAbismoLoserArena(state, player, arenaId) {
  const winner = state.phaseWinner;
  if (state.matchPhase !== "setup_abismo_loser" || winner === null) return state;
  if (player !== opponent(winner)) return state;
  if (!findArenaDef(state, arenaId)) return state;
  if (state.arenaSetupPicks.includes(arenaId)) {
    return { ...state, log: appendLog(state, "Arena j\xE1 escolhida pelo vencedor.") };
  }
  const allPicks = [...state.arenaSetupPicks, arenaId];
  const ready = finishArenaSetupAndResume(state, allPicks, winner);
  return runTurnBegin(ready, winner);
}
function selectReinoReversoArena(state, player, arenaId) {
  if (state.matchPhase !== "setup_rr_winner" || state.phaseWinner !== player) {
    return state;
  }
  if (!findArenaDef(state, arenaId)) return state;
  const ready = finishArenaSetupAndResume(state, [arenaId], player);
  return runTurnBegin(ready, player);
}
function selectArena(state, player, arenaId) {
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
function handlePostPhaseChoice(state, player, choice) {
  const expected = player === 0 ? "phase_end_choice_p0" : "phase_end_choice_p1";
  if (state.matchPhase !== expected) {
    return {
      ...state,
      log: appendLog(
        state,
        player === 0 ? "Aguardando a escolha p\xF3s-fase do Jogador 1." : "Aguardando a escolha p\xF3s-fase do Jogador 2."
      )
    };
  }
  let next = applyPostPhaseChoiceForPlayer(state, player, choice);
  if (player === 0) {
    return {
      ...next,
      matchPhase: "phase_end_choice_p1",
      log: appendLog(next, "Jogador 2 \u2014 escolha p\xF3s-fase (suas tropas nas arenas).")
    };
  }
  return finalizePhaseTransition(next);
}
function useLeaderAbility(state, player, targetTroopId) {
  if (state.matchPhase !== "playing") return state;
  if (!state.combat && state.activePlayer !== player) {
    return state;
  }
  const pl = state.players[player];
  if (pl.leaderExhausted) {
    return { ...state, log: appendLog(state, "L\xEDder exausto \u2014 desvira na prepara\xE7\xE3o.") };
  }
  if (pl.leaderAbilityUsedThisTurn) {
    return { ...state, log: appendLog(state, "Habilidade do L\xEDder j\xE1 usada neste turno.") };
  }
  if (!pl.leaderId) {
    return { ...state, log: appendLog(state, "Nenhum L\xEDder selecionado.") };
  }
  const leaderDef = state.catalog[pl.leaderId];
  if (!leaderDef?.leaderAbilityId) {
    return { ...state, log: appendLog(state, "Este L\xEDder n\xE3o tem habilidade ativa.") };
  }
  if (leaderDef.leaderAbilityId === "shield") {
    if (!state.combat) {
      return { ...state, log: appendLog(state, "Escudo s\xF3 pode ser usado durante o combate.") };
    }
    const shieldCost = { exhaust: 2 };
    const canPay = getAvailableEssence(state, player).length >= shieldCost.exhaust;
    if (!canPay) {
      return {
        ...state,
        log: appendLog(state, `Escudo exige ${shieldCost.exhaust} Ess\xEAncia pronta (tem ${getAvailableEssence(state, player).length}).`)
      };
    }
    const target = state.troops[targetTroopId];
    if (!target || target.owner !== player) {
      return { ...state, log: appendLog(state, "Alvo inv\xE1lido \u2014 escolha uma tropa aliada.") };
    }
    if (target.zone !== "arena") {
      return { ...state, log: appendLog(state, "Alvo deve estar em uma arena.") };
    }
    if (target.shielded) {
      return { ...state, log: appendLog(state, "Esta tropa j\xE1 tem escudo.") };
    }
    const paid = payEssenceCost(state, player, shieldCost);
    if (!paid.ok) {
      return { ...state, log: appendLog(state, "N\xE3o foi poss\xEDvel pagar o custo do Escudo.") };
    }
    let next = paid.state;
    const troops = { ...next.troops };
    troops[targetTroopId] = { ...target, shielded: true };
    const players = [...next.players];
    players[player] = { ...players[player], leaderAbilityUsedThisTurn: true, leaderExhausted: true };
    const troopName = next.catalog[target.cardId]?.name ?? targetTroopId;
    return {
      ...next,
      troops,
      players,
      log: appendLog(
        next,
        `Jogador ${player + 1} usou Escudo do L\xEDder em ${troopName} (\u22122 Ess\xEAncia) \u2014 pr\xF3ximo dano ser\xE1 absorvido.`
      )
    };
  }
  if (leaderDef.leaderAbilityId === "frost-convert") {
    if (!state.combat) {
      return { ...state, log: appendLog(state, "Cria do Inverno s\xF3 pode ser usada durante o combate.") };
    }
    const frostCost = { exhaust: 2 };
    const canPay = getAvailableEssence(state, player).length >= frostCost.exhaust;
    if (!canPay) {
      return {
        ...state,
        log: appendLog(state, `Cria do Inverno exige ${frostCost.exhaust} Ess\xEAncia pronta (tem ${getAvailableEssence(state, player).length}).`)
      };
    }
    const target = state.troops[targetTroopId];
    if (!target || target.owner !== player) {
      return { ...state, log: appendLog(state, "Alvo inv\xE1lido \u2014 escolha uma tropa aliada.") };
    }
    if (target.zone !== "arena") {
      return { ...state, log: appendLog(state, "Alvo deve estar em uma arena.") };
    }
    if (target.isFrostborn) {
      return { ...state, log: appendLog(state, "Esta tropa j\xE1 \xE9 uma Cria do Inverno.") };
    }
    const paid = payEssenceCost(state, player, frostCost);
    if (!paid.ok) {
      return { ...state, log: appendLog(state, "N\xE3o foi poss\xEDvel pagar o custo de Cria do Inverno.") };
    }
    let next = paid.state;
    const troops = { ...next.troops };
    troops[targetTroopId] = { ...target, isFrostborn: true };
    const players = [...next.players];
    players[player] = { ...players[player], leaderAbilityUsedThisTurn: true, leaderExhausted: true };
    const troopName = next.catalog[target.cardId]?.name ?? targetTroopId;
    return {
      ...next,
      troops,
      players,
      log: appendLog(
        next,
        `Jogador ${player + 1} transformou ${troopName} em Cria do Inverno (\u22122 Ess\xEAncia) \u2014 ganha comportamento de gelo.`
      )
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
        log: appendLog(state, `Empatia exige ${empathyCost.exhaust} Ess\xEAncia pronta (tem ${getAvailableEssence(state, player).length}).`)
      };
    }
    const target = state.troops[targetTroopId];
    if (!target || target.owner !== player) {
      return { ...state, log: appendLog(state, "Alvo inv\xE1lido \u2014 escolha uma tropa aliada.") };
    }
    if (target.zone !== "arena") {
      return { ...state, log: appendLog(state, "Alvo deve estar em uma arena.") };
    }
    if (target.hasEmpathy) {
      return { ...state, log: appendLog(state, "Esta tropa j\xE1 tem Empatia.") };
    }
    const paid = payEssenceCost(state, player, empathyCost);
    if (!paid.ok) {
      return { ...state, log: appendLog(state, "N\xE3o foi poss\xEDvel pagar o custo de Empatia.") };
    }
    let next = paid.state;
    const troops = { ...next.troops };
    troops[targetTroopId] = { ...target, hasEmpathy: true, shielded: true };
    const players = [...next.players];
    players[player] = { ...players[player], leaderAbilityUsedThisTurn: true, leaderExhausted: true };
    const troopName = next.catalog[target.cardId]?.name ?? targetTroopId;
    return {
      ...next,
      troops,
      players,
      log: appendLog(
        next,
        `Jogador ${player + 1} marcou ${troopName} com Empatia (\u22121 Ess\xEAncia) \u2014 ganha Protetor + Escudo.`
      )
    };
  }
  if (leaderDef.leaderAbilityId === "arcane-melody") {
    if (state.turnPhase !== "main" || state.combat) {
      return { ...state, log: appendLog(state, "Melodia Arcana s\xF3 pode ser usada na fase principal (sem combate).") };
    }
    const isUpgraded = pl.leaderId === "klaus-delta";
    const count = isUpgraded ? 2 : 1;
    let idCounter = state.nextInstanceId;
    const essencePool = { ...state.essencePool };
    const newEssenceIds = [];
    for (let i = 0; i < count; i++) {
      const essenceId = `essence-temp-${idCounter++}`;
      essencePool[essenceId] = {
        instanceId: essenceId,
        cardId: pl.leaderId,
        owner: player,
        exhausted: false,
        spellOnly: true
      };
      newEssenceIds.push(essenceId);
    }
    const players = [...state.players];
    players[player] = {
      ...pl,
      essenceIds: [...pl.essenceIds, ...newEssenceIds],
      leaderAbilityUsedThisTurn: true,
      leaderExhausted: true
    };
    return {
      ...state,
      players,
      essencePool,
      nextInstanceId: idCounter,
      log: appendLog(
        state,
        `Jogador ${player + 1} usou Melodia Arcana \u2014 +${count} Ess\xEAncia tempor\xE1ria (s\xF3 feiti\xE7os). L\xEDder exausto.`
      )
    };
  }
  return state;
}
function evolveLeader(state, player, formId, formInstanceId) {
  if (state.matchPhase !== "playing" || state.turnPhase !== "main" || state.combat) {
    return state;
  }
  if (state.activePlayer !== player) {
    return { ...state, log: appendLog(state, "N\xE3o \xE9 seu turno.") };
  }
  const pl = state.players[player];
  if (!pl.leaderId) {
    return { ...state, log: appendLog(state, "Nenhum L\xEDder selecionado.") };
  }
  const currentLeader = state.catalog[pl.leaderId];
  if (!currentLeader?.leaderFormIds?.includes(formId)) {
    return { ...state, log: appendLog(state, "Forma de evolu\xE7\xE3o inv\xE1lida.") };
  }
  if (!pl.hand.includes(formInstanceId)) {
    return { ...state, log: appendLog(state, "Voc\xEA precisa ter a carta da forma na m\xE3o.") };
  }
  const formInstance = state.troops[formInstanceId];
  if (!formInstance || formInstance.cardId !== formId) {
    return { ...state, log: appendLog(state, "Carta inv\xE1lida para evolu\xE7\xE3o.") };
  }
  const newForm = state.catalog[formId];
  if (!newForm) {
    return { ...state, log: appendLog(state, "Forma de L\xEDder n\xE3o encontrada no cat\xE1logo.") };
  }
  if (pl.corruption < LEADER_EVOLUTION_CORRUPTION_COST) {
    return {
      ...state,
      log: appendLog(
        state,
        `Corrup\xE7\xE3o insuficiente para evoluir (precisa ${LEADER_EVOLUTION_CORRUPTION_COST}, tem ${pl.corruption}).`
      )
    };
  }
  const hand = pl.hand.filter((id) => id !== formInstanceId);
  const troops = { ...state.troops };
  delete troops[formInstanceId];
  const players = [...state.players];
  players[player] = {
    ...pl,
    hand,
    leaderId: formId,
    corruption: pl.corruption - LEADER_EVOLUTION_CORRUPTION_COST
  };
  return sanitizePlayerHands({
    ...state,
    players,
    troops,
    log: appendLog(
      state,
      `Jogador ${player + 1} evoluiu o L\xEDder para ${newForm.name}! (carta consumida, \u2212${LEADER_EVOLUTION_CORRUPTION_COST} Corrup\xE7\xE3o)`
    )
  });
}
function playArtifact(state, troopId, player, def) {
  const corruptionCost = getCorruptionCost(def);
  const payment = getEssenceCost(def);
  if (!canAffordCardCost(state, player, def, payment)) {
    return {
      ...state,
      log: appendLog(state, `Recursos insuficientes para ${def.name} (${formatCardCost(def)}).`)
    };
  }
  let next = state;
  if (payment.exhaust > 0) {
    const paid = payEssenceCost(next, player, payment);
    if (!paid.ok) return { ...state, log: appendLog(state, "Ess\xEAncia insuficiente.") };
    next = paid.state;
  }
  if (corruptionCost > 0) {
    const paid = payCorruptionCost(next, player, corruptionCost);
    if (!paid.ok) return { ...state, log: appendLog(state, "Corrup\xE7\xE3o insuficiente.") };
    next = paid.state;
  }
  const hand = next.players[player].hand.filter((id) => id !== troopId);
  const players = [...next.players];
  players[player] = { ...next.players[player], hand };
  const troops = { ...next.troops };
  const troopInst = state.troops[troopId];
  const cardId = troopInst ? troopInst.cardId : def.id;
  delete troops[troopId];
  const artifactId = `artifact-${next.nextInstanceId}`;
  const artifacts = {
    ...next.artifacts,
    [artifactId]: { instanceId: artifactId, cardId, owner: player, exhausted: false }
  };
  return sanitizePlayerHands({
    ...next,
    players,
    troops,
    artifacts,
    nextInstanceId: next.nextInstanceId + 1,
    log: appendLog(next, `Jogador ${player + 1} colocou ${def.name} em jogo (artefato). Custo: ${formatCardCost(def)}.`)
  });
}
function equipTroop(state, equipmentInstanceId, targetTroopId) {
  if (state.matchPhase !== "playing" || state.turnPhase !== "main" || state.combat) {
    return state;
  }
  const player = state.activePlayer;
  const pl = state.players[player];
  if (!pl.hand.includes(equipmentInstanceId)) {
    return { ...state, log: appendLog(state, "Equipamento n\xE3o est\xE1 na sua m\xE3o.") };
  }
  const eqInst = state.troops[equipmentInstanceId];
  if (!eqInst || eqInst.owner !== player) return state;
  const eqDef = state.catalog[eqInst.cardId];
  if (!isEquipmentCard(eqDef)) {
    return { ...state, log: appendLog(state, "Esta carta n\xE3o \xE9 um equipamento.") };
  }
  const target = state.troops[targetTroopId];
  if (!target || target.owner !== player) {
    return { ...state, log: appendLog(state, "Escolha uma tropa aliada como alvo.") };
  }
  if (target.zone !== "base" && target.zone !== "arena") {
    return { ...state, log: appendLog(state, "S\xF3 \xE9 poss\xEDvel equipar tropas na base ou arena.") };
  }
  if (target.currentHealth <= 0) {
    return { ...state, log: appendLog(state, "Alvo inv\xE1lido.") };
  }
  if (target.equipmentId) {
    return { ...state, log: appendLog(state, "Esta tropa j\xE1 tem um equipamento.") };
  }
  const payment = getEssenceCost(eqDef);
  const corruptionCost = getCorruptionCost(eqDef);
  if (!canAffordCardCost(state, player, eqDef, payment)) {
    return {
      ...state,
      log: appendLog(state, `Recursos insuficientes para ${eqDef.name} (${formatCardCost(eqDef)}).`)
    };
  }
  let next = state;
  if (payment.exhaust > 0) {
    const paid = payEssenceCost(next, player, payment);
    if (!paid.ok) return { ...state, log: appendLog(state, "Ess\xEAncia insuficiente.") };
    next = paid.state;
  }
  if (corruptionCost > 0) {
    const paid = payCorruptionCost(next, player, corruptionCost);
    if (!paid.ok) return { ...state, log: appendLog(state, "Corrup\xE7\xE3o insuficiente.") };
    next = paid.state;
  }
  const hand = next.players[player].hand.filter((id) => id !== equipmentInstanceId);
  const players = [...next.players];
  players[player] = { ...next.players[player], hand };
  const troops = { ...next.troops };
  delete troops[equipmentInstanceId];
  const bonusAtk = eqDef.attack;
  const bonusHp = eqDef.health;
  const eqId = `equip-${next.nextInstanceId}`;
  const equipments = {
    ...next.equipments,
    [eqId]: {
      instanceId: eqId,
      cardId: eqInst.cardId,
      owner: player,
      troopId: targetTroopId
    }
  };
  troops[targetTroopId] = {
    ...target,
    equipmentId: eqId,
    attack: target.attack + bonusAtk,
    healthBonus: target.healthBonus + bonusHp,
    currentHealth: target.currentHealth + bonusHp
  };
  const troopName = next.catalog[target.cardId]?.name ?? targetTroopId;
  const bonusLabel = bonusAtk > 0 || bonusHp > 0 ? ` (+${bonusAtk}/+${bonusHp})` : "";
  return sanitizePlayerHands({
    ...next,
    players,
    troops,
    equipments,
    nextInstanceId: next.nextInstanceId + 1,
    log: appendLog(
      next,
      `Jogador ${player + 1} equipou ${eqDef.name} em ${troopName}${bonusLabel}. Custo: ${formatCardCost(eqDef)}.`
    )
  });
}
function activateArtifact(state, artifactId, sacrificeTroopId) {
  if (state.turnPhase !== "main" || state.combat) return state;
  const player = state.activePlayer;
  const artifact = state.artifacts[artifactId];
  if (!artifact || artifact.owner !== player) return state;
  const def = state.catalog[artifact.cardId];
  if (!def?.artifactEffect) return state;
  if (artifact.exhausted) {
    return { ...state, log: appendLog(state, `${def.name} est\xE1 exausto \u2014 desvira na prepara\xE7\xE3o.`) };
  }
  if (def.artifactEffect === "sacrifice-for-corruption") {
    if (!sacrificeTroopId) {
      return { ...state, log: appendLog(state, "Selecione uma tropa aliada para sacrificar.") };
    }
    const troop = state.troops[sacrificeTroopId];
    if (!troop || troop.owner !== player || troop.zone !== "base" && troop.zone !== "arena") {
      return { ...state, log: appendLog(state, "Tropa inv\xE1lida para sacrif\xEDcio.") };
    }
    const cap = maxCorruptionForPhase(state.gamePhase);
    const cur = state.players[player].corruption;
    if (cur >= cap) {
      return { ...state, log: appendLog(state, `Corrup\xE7\xE3o no m\xE1ximo (${cap}).`) };
    }
    const troopName = state.catalog[troop.cardId]?.name ?? "Tropa";
    const troops = { ...state.troops };
    delete troops[sacrificeTroopId];
    const players = [...state.players];
    const pl = players[player];
    players[player] = {
      ...pl,
      hand: pl.hand.filter((id) => id !== sacrificeTroopId),
      discard: [...pl.discard, troop.cardId],
      corruption: Math.min(cap, cur + 1)
    };
    const artifacts = { ...state.artifacts };
    artifacts[artifactId] = { ...artifact, exhausted: true };
    return sanitizePlayerHands({
      ...state,
      troops,
      players,
      artifacts,
      log: appendLog(state, `Jogador ${player + 1} sacrificou ${troopName} no artefato \u2192 +1 Corrup\xE7\xE3o (${Math.min(cap, cur + 1)}/${cap}). Artefato exausto.`)
    });
  }
  return state;
}
function applyAction(state, action) {
  switch (action.type) {
    case "SELECT_ARENA":
      return selectArena(state, action.player, action.arenaId);
    case "MULLIGAN":
      return handleMulligan(state, action.player, action.handIndices);
    case "SKIP_MULLIGAN":
      if (state.mulliganUsed[action.player]) return advanceMulliganPhase(state);
      return advanceMulliganPhase({
        ...state,
        mulliganUsed: state.mulliganUsed.map(
          (u, i) => i === action.player ? true : u
        ),
        log: appendLog(state, `Jogador ${action.player + 1} manteve a m\xE3o.`)
      });
    case "PLAY_TROOP":
      return playTroop(state, action.troopId);
    case "PLAY_SPELL":
      return playSpell(state, action.player, action.spellInstanceId, action.targetTroopId, action.targetArtifactId);
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
    case "ACTIVATE_ARTIFACT":
      return activateArtifact(state, action.artifactId, action.sacrificeTroopId);
    case "EQUIP_TROOP":
      return equipTroop(state, action.equipmentInstanceId, action.targetTroopId);
    default:
      return state;
  }
}
function dispatch(state, action) {
  if (state.matchPhase === "finished") return state;
  return buryDeadTroops(repairStaleTurnPhase(applyAction(state, action)));
}

// src/game/permissions.ts
function canUseLeaderAbilityReact(state, player) {
  if (!state.combat) return false;
  const pl = state.players[player];
  if (!pl.leaderId || pl.leaderAbilityUsedThisTurn || pl.leaderExhausted) return false;
  const ld = state.catalog[pl.leaderId];
  if (!ld?.leaderAbilityId || ld.leaderAbilityId === "arcane-melody") return false;
  const abilityId = ld.leaderAbilityId;
  if (abilityId === "shield" || abilityId === "frost-convert") {
    if (getAvailableEssence(state, player).length < 2) return false;
  } else if (abilityId === "empathy-mark") {
    if (getAvailableEssence(state, player).length < 1) return false;
  }
  const arenaId = state.combat.arenaId;
  return Object.values(state.troops).some(
    (t) => t.owner === player && t.zone === "arena" && t.arenaId === arenaId && t.currentHealth > 0
  );
}
function canPlayReactiveFastSpell(state, player, spellInstanceId) {
  const inst = state.troops[spellInstanceId];
  if (!inst || inst.owner !== player) return false;
  const def = state.catalog[inst.cardId];
  if (!def || !isSpellCard(def) || getCardSpeed(def) !== "fast") return false;
  return canPlaySpellNow(state, player, def);
}
function isStrikeReactionAction(state, player, action) {
  switch (action.type) {
    case "USE_LEADER_ABILITY":
      return canUseLeaderAbilityReact(state, player);
    case "PLAY_SPELL":
      return canPlayReactiveFastSpell(state, player, action.spellInstanceId);
    default:
      return false;
  }
}
function canControlPlayer(s, player) {
  if (s.pendingSpell) {
    if (s.pendingSpell.counterWindowOpen && player === opponent(s.pendingSpell.caster)) {
      return true;
    }
    if (s.pendingSpell.awaitingCounterPayment && player === s.pendingSpell.caster) {
      return true;
    }
  }
  if (s.matchPhase === "setup_arenas_p0") return player === 0;
  if (s.matchPhase === "setup_arenas_p1") return player === 1;
  if (s.matchPhase === "mulligan_p0") return player === 0;
  if (s.matchPhase === "mulligan_p1") return player === 1;
  if (s.matchPhase === "phase_end_choice_p0") return player === 0;
  if (s.matchPhase === "phase_end_choice_p1") return player === 1;
  const winner = s.phaseWinner;
  if (winner !== null) {
    if (s.matchPhase === "setup_abismo_winner") return player === winner;
    if (s.matchPhase === "setup_abismo_loser") return player === opponent(winner);
    if (s.matchPhase === "setup_rr_winner") return player === winner;
  }
  if (s.matchPhase === "playing") {
    if (s.combat) {
      if (s.combat.subPhase === "magic" && !s.combat.magicPassed[player]) {
        return true;
      }
      if (s.combat.subPhase === "strike") {
        return player === getCombatAssigningPlayer(s.combat);
      }
      return false;
    }
    return player === s.activePlayer;
  }
  return false;
}
function inferActionPlayer(state, action) {
  switch (action.type) {
    case "SELECT_ARENA":
    case "MULLIGAN":
    case "SKIP_MULLIGAN":
    case "PLAY_SPELL":
    case "PASS_SPELL_COUNTER":
    case "RESOLVE_COUNTER_PAYMENT":
    case "PASS_COMBAT_MAGIC":
    case "POST_PHASE_CHOICE":
    case "USE_LEADER_ABILITY":
    case "EVOLVE_LEADER":
      return action.player;
    case "PLAY_TROOP":
    case "SACRIFICE_ESSENCE":
    case "MOVE_TROOP": {
      const troop = state.troops[action.troopId];
      return troop?.owner ?? null;
    }
    case "DECLARE_COMBAT":
      return state.activePlayer;
    case "EXECUTE_COMBAT_ATTACK": {
      const attacker = state.troops[action.attackerId];
      return attacker?.owner ?? null;
    }
    case "END_COMBAT_STRIKE":
      return state.combat ? getCombatAssigningPlayer(state.combat) : state.activePlayer;
    case "END_TURN":
      return state.activePlayer;
    case "ACTIVATE_ARTIFACT": {
      const artifact = state.artifacts[action.artifactId];
      return artifact?.owner ?? null;
    }
    case "EQUIP_TROOP": {
      const inst = state.troops[action.equipmentInstanceId];
      return inst?.owner ?? null;
    }
    default:
      return null;
  }
}
function canSubmitAction(state, seat, action) {
  const actor = inferActionPlayer(state, action);
  if (actor === null || actor !== seat) return false;
  if (state.pendingSpell) {
    if (state.pendingSpell.counterWindowOpen && seat === opponent(state.pendingSpell.caster)) {
      return true;
    }
    if (state.pendingSpell.awaitingCounterPayment && seat === state.pendingSpell.caster) {
      return true;
    }
  }
  if (canControlPlayer(state, seat)) return true;
  if (state.combat?.subPhase === "strike" && seat !== getCombatAssigningPlayer(state.combat)) {
    return isStrikeReactionAction(state, seat, action);
  }
  return false;
}

// src/net/player-view.ts
function toPlayerView(state, seat, meta) {
  const opp = opponent(seat);
  const handCounts = [
    state.players[0].hand.length,
    state.players[1].hand.length
  ];
  const deckCounts = [
    state.players[0].deck.length,
    state.players[1].deck.length
  ];
  const oppHandIds = state.players[opp].hand;
  const players = structuredClone(state.players);
  players[opp] = {
    ...players[opp],
    hand: [],
    deck: []
  };
  const troops = { ...state.troops };
  for (const id of oppHandIds) {
    delete troops[id];
  }
  for (const [id, troop] of Object.entries(troops)) {
    if (troop.owner === opp && troop.zone === "hand") {
      delete troops[id];
    }
  }
  return {
    ...meta,
    handCounts,
    deckCounts,
    state: {
      ...state,
      players,
      troops,
      cpuPlayer: null
    }
  };
}

// public/data/cards.json
var cards_default = {
  cards: [
    {
      id: "cinza-rastejante",
      name: "Cinza Rastejante",
      cost: 1,
      attack: 1,
      health: 1,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "fragmento-poco",
      name: "Fragmento do Po\xE7o",
      cost: 1,
      attack: 1,
      health: 2,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "vigia-reverso",
      name: "Vigia do Reino Reverso",
      cost: 2,
      attack: 1,
      health: 3,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "eco-banshee",
      name: "Eco da Banshee",
      cost: 2,
      attack: 2,
      health: 2,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "lamina-pacto",
      name: "L\xE2mina do Pacto",
      cost: 3,
      attack: 3,
      health: 2,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "guardiao-estandarte",
      name: "Guardi\xE3o do Estandarte",
      cost: 3,
      attack: 2,
      health: 4,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "flagelo-cobre",
      name: "Flagelo de Cobre",
      cost: 4,
      attack: 4,
      health: 3,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "sombra-erudito",
      name: "Sombra do Erudito",
      cost: 4,
      attack: 3,
      health: 4,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "colosso-abismo",
      name: "Colosso do Abismo",
      cost: 5,
      attack: 5,
      health: 5,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "carnical-incandescente",
      name: "Carni\xE7al Incandescente",
      cost: 2,
      attack: 2,
      health: 1,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "encore",
      name: "Encore",
      cardKind: "spell",
      cardSpeed: "standard",
      spellEffect: "encore",
      cost: 2,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      cardType: "spell",
      faction: "neutra"
    },
    {
      id: "pele-ferro",
      name: "Pele de Ferro",
      cardKind: "spell",
      cardSpeed: "standard",
      spellEffect: "iron-skin",
      cost: 2,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      cardType: "spell",
      faction: "neutra"
    },
    {
      id: "caldeirao-sangue",
      name: "Caldeir\xE3o de Sangue",
      cardKind: "spell",
      cardSpeed: "combat",
      spellEffect: "blood-cauldron",
      cost: 3,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      cardType: "spell",
      faction: "neutra"
    },
    {
      id: "lufada-vento",
      name: "Lufada de Vento",
      cardKind: "spell",
      cardSpeed: "fast",
      spellEffect: "gust-wind",
      cost: 2,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      cardType: "spell",
      faction: "neutra"
    },
    {
      id: "token-gargula",
      name: "G\xE1rgula",
      cost: 0,
      attack: 1,
      health: 1,
      hasEssenceSymbol: false,
      isToken: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "susej-arauto",
      name: "Susej \u2014 o arauto da ignor\xE2ncia",
      cost: 3,
      attack: 2,
      health: 3,
      hasEssenceSymbol: false,
      isToken: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "escudeiro-pacto",
      name: "Escudeiro do Pacto",
      cost: 2,
      attack: 1,
      health: 3,
      hasEssenceSymbol: false,
      keywords: [
        "protetor"
      ],
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "mensageiro-alado",
      name: "Mensageiro Alado",
      cost: 2,
      attack: 2,
      health: 2,
      hasEssenceSymbol: true,
      keywords: [
        "investida"
      ],
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "ultimo-suspiro",
      name: "\xDAltimo Suspiro",
      cost: 2,
      attack: 2,
      health: 1,
      hasEssenceSymbol: false,
      keywords: [
        "testamento"
      ],
      deathEffect: "draw-one",
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "eco-persistente",
      name: "Eco Persistente",
      cost: 3,
      attack: 2,
      health: 2,
      hasEssenceSymbol: false,
      keywords: [
        "eco"
      ],
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "corrente-eterea",
      name: "Corrente Et\xE9rea",
      cost: 3,
      attack: 3,
      health: 2,
      hasEssenceSymbol: false,
      keywords: [
        "vincular"
      ],
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "vazio-antimagia",
      name: "Vazio Antim\xE1gia",
      cost: 2,
      attack: 1,
      health: 4,
      hasEssenceSymbol: false,
      keywords: [
        "silencio"
      ],
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "muralha-ossos",
      name: "Muralha de Ossos",
      cost: 3,
      attack: 1,
      health: 5,
      hasEssenceSymbol: false,
      keywords: [
        "protetor",
        "testamento"
      ],
      deathEffect: "ping-leader-1",
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "ceifador-laminar",
      name: "Ceifador Laminar",
      cost: 3,
      attack: 3,
      health: 2,
      hasEssenceSymbol: false,
      keywords: [
        "fatiar"
      ],
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "falcao-abismo",
      name: "Falc\xE3o do Abismo",
      cost: 2,
      attack: 2,
      health: 2,
      hasEssenceSymbol: true,
      keywords: [
        "voar"
      ],
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "noah-lider-base",
      name: "Noah \u2014 o pugilista",
      cardType: "leader",
      faction: "delta",
      cost: 0,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      leaderMaxHp: 10,
      leaderAbility: "Escudo (1\xD7/turno no combate, 2 Ess\xEAncia): proteja uma tropa aliada na arena \u2014 bloqueia o pr\xF3ximo dano recebido.",
      leaderAbilityId: "shield",
      leaderFormIds: [
        "noah-vampiro-inverno",
        "noah-delta-empatia"
      ]
    },
    {
      id: "noah-vampiro-inverno",
      name: "Noah \u2014 o vampiro inverno",
      cardType: "leader",
      faction: "delta",
      cost: 0,
      attack: 0,
      health: 0,
      hasEssenceSymbol: true,
      leaderMaxHp: 10,
      leaderAbility: "Cria do Inverno (1\xD7/turno no combate, 2 Ess\xEAncia): transforma tropa aliada em Cria do Inverno. Ao atacar: 1d6 par \u2192 congela alvo. Passiva: Crias que causam dano e sobrevivem curam o dano causado (vampirismo).",
      leaderAbilityId: "frost-convert",
      leaderFormOf: "noah-lider-base",
      sacrificeReward: { essence: 1, corruption: 1 },
      leaderFormIds: []
    },
    {
      id: "noah-delta-empatia",
      name: "Noah \u2014 o Delta da Empatia",
      cardType: "leader",
      faction: "delta",
      cost: 0,
      attack: 0,
      health: 0,
      hasEssenceSymbol: true,
      leaderMaxHp: 10,
      leaderAbility: "Empatia (1\xD7/turno, combate ou principal, 1 Ess\xEAncia): marca tropa aliada com Empatia (ganha Protetor + Escudo). Passiva: ao morrer, aliados na mesma arena ganham +1/+1.",
      leaderAbilityId: "empathy-mark",
      leaderFormOf: "noah-lider-base",
      sacrificeReward: { essence: 2, corruption: 0 },
      leaderFormIds: []
    },
    {
      id: "klaus-violinista",
      name: "Klaus \u2014 o violinista",
      cardType: "leader",
      faction: "delta",
      cost: 0,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      leaderMaxHp: 8,
      leaderAbility: "Melodia Arcana (1\xD7/turno, fase principal): Klaus se exausta e cria 1 Ess\xEAncia tempor\xE1ria (s\xF3 para feiti\xE7os, some no fim do turno).",
      leaderAbilityId: "arcane-melody",
      leaderFormIds: [
        "klaus-delta",
        "klaus-portador-abismo"
      ]
    },
    {
      id: "klaus-delta",
      name: "Klaus \u2014 o delta do sacrif\xEDcio",
      cardType: "leader",
      faction: "delta",
      cost: 0,
      attack: 0,
      health: 0,
      hasEssenceSymbol: true,
      leaderMaxHp: 8,
      leaderAbility: "Melodia Arcana Aprimorada (1\xD7/turno, fase principal): Klaus se exausta e cria 2 Ess\xEAncias tempor\xE1rias (s\xF3 para feiti\xE7os).",
      leaderAbilityId: "arcane-melody",
      leaderFormOf: "klaus-violinista",
      sacrificeReward: { essence: 2, corruption: 0 },
      leaderFormIds: []
    },
    {
      id: "klaus-portador-abismo",
      name: "Klaus \u2014 o portador do abismo",
      cardType: "leader",
      faction: "delta",
      cost: 0,
      attack: 0,
      health: 0,
      hasEssenceSymbol: true,
      leaderMaxHp: 8,
      leaderAbility: "Summoner (habilidade em desenvolvimento).",
      leaderFormOf: "klaus-violinista",
      sacrificeReward: { essence: 1, corruption: 1 },
      leaderFormIds: []
    },
    {
      id: "servo-cinzas",
      name: "Servo das Cinzas",
      cost: 1,
      attack: 1,
      health: 2,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "militante-bosque",
      name: "Militante do Bosque",
      cost: 1,
      attack: 2,
      health: 1,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal",
      keywords: ["investida"]
    },
    {
      id: "sentinela-calha",
      name: "Sentinela da Calha",
      cost: 2,
      attack: 1,
      health: 3,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal",
      keywords: ["protetor"]
    },
    {
      id: "arruaceiro-noturno",
      name: "Arruaceiro Noturno",
      cost: 2,
      attack: 3,
      health: 1,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "curandeiro-errante",
      name: "Curandeiro Errante",
      cost: 2,
      attack: 1,
      health: 4,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal",
      keywords: ["testamento"],
      deathEffect: "draw-one"
    },
    {
      id: "bruto-patio",
      name: "Bruto do P\xE1tio",
      cost: 2,
      attack: 2,
      health: 3,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "arqueiro-torre",
      name: "Arqueiro da Torre",
      cost: 3,
      attack: 3,
      health: 2,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "devorador-ecos",
      name: "Devorador de Ecos",
      cost: 3,
      attack: 4,
      health: 2,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal",
      keywords: ["fatiar"]
    },
    {
      id: "guarda-penhasco",
      name: "Guarda do Penhasco",
      cost: 3,
      attack: 2,
      health: 5,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "sacerdotisa-neutra",
      name: "Sacerdotisa Neutra",
      cost: 3,
      attack: 2,
      health: 4,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "demolidor-ruinas",
      name: "Demolidor das Ru\xEDnas",
      cost: 4,
      attack: 4,
      health: 3,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal",
      keywords: ["vincular"]
    },
    {
      id: "espectro-menor",
      name: "Espectro Menor",
      cost: 4,
      attack: 3,
      health: 4,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal",
      keywords: ["eco"]
    },
    {
      id: "cavaleiro-desgastado",
      name: "Cavaleiro Desgastado",
      cost: 4,
      attack: 5,
      health: 2,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "matriarca-silenciosa",
      name: "Matriarca Silenciosa",
      cost: 4,
      attack: 1,
      health: 6,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal",
      keywords: ["silencio"]
    },
    {
      id: "abominacao-lenta",
      name: "Abomina\xE7\xE3o Lenta",
      cost: 5,
      attack: 5,
      health: 4,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "tita-partido",
      name: "Tit\xE3 Partido",
      cost: 5,
      attack: 6,
      health: 3,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "filho-bruma",
      name: "Filho da Bruma",
      cost: 1,
      attack: 2,
      health: 2,
      hasEssenceSymbol: true,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal",
      keywords: ["voar"]
    },
    {
      id: "fera-estalar",
      name: "Fera de Estalar",
      cost: 3,
      attack: 3,
      health: 3,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "vigia-crepusculo",
      name: "Vigia do Crep\xFAsculo",
      cost: 2,
      attack: 2,
      health: 3,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "colosso-rachado",
      name: "Colosso Rachado",
      cost: 4,
      attack: 4,
      health: 4,
      hasEssenceSymbol: false,
      cardType: "troop",
      faction: "neutra",
      cardRole: "normal"
    },
    {
      id: "compendio-vazio",
      name: "Comp\xEAndio do Vazio",
      cardType: "spell",
      cardKind: "spell",
      cardSpeed: "turn",
      spellEffect: "draw-two",
      cost: 2,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      faction: "neutra"
    },
    {
      id: "chamado-tropas",
      name: "Chamado das Tropas",
      cardType: "spell",
      cardKind: "spell",
      cardSpeed: "turn",
      spellEffect: "troop-tutor",
      cost: 3,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      faction: "neutra"
    },
    {
      id: "contramagia",
      name: "Contramagia",
      cardType: "spell",
      cardKind: "spell",
      cardSpeed: "fast",
      spellEffect: "counterspell",
      cost: 3,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      faction: "neutra"
    },
    {
      id: "revelacao-erudito",
      name: "Revela\xE7\xE3o do Erudito",
      cardType: "spell",
      cardKind: "spell",
      cardSpeed: "turn",
      spellEffect: "spell-tutor",
      cost: 2,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      faction: "neutra"
    },
    {
      id: "constricao",
      name: "Constri\xE7\xE3o",
      cardType: "spell",
      cardKind: "spell",
      cardSpeed: "combat",
      spellEffect: "constriction",
      cost: 2,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      faction: "neutra"
    },
    {
      id: "eterealidade",
      name: "Eterealidade",
      cardType: "spell",
      cardKind: "spell",
      cardSpeed: "combat",
      spellEffect: "ethereal",
      cost: 3,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      faction: "neutra"
    },
    {
      id: "omega",
      name: "Omega",
      cardType: "spell",
      cardKind: "spell",
      cardSpeed: "combat",
      spellEffect: "omega",
      cost: 4,
      essenceCost: {
        exhaust: 4,
        sacrifice: 1
      },
      corruptionCost: 1,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      faction: "neutra"
    },
    {
      id: "equip-lamina-pacto",
      name: "L\xE2mina do Pacto",
      cardType: "equipment",
      faction: "neutra",
      cost: 2,
      attack: 2,
      health: 0,
      hasEssenceSymbol: false
    },
    {
      id: "equip-escudo-delta",
      name: "Escudo Delta",
      cardType: "equipment",
      faction: "delta",
      cost: 2,
      attack: 0,
      health: 2,
      hasEssenceSymbol: false
    },
    {
      id: "equip-amuleto-sombrio",
      name: "Amuleto Sombrio",
      cardType: "equipment",
      faction: "neutra",
      cost: 1,
      corruptionCost: 1,
      attack: 1,
      health: 1,
      hasEssenceSymbol: false
    },
    {
      id: "equip-corrente-ferro",
      name: "Corrente de Ferro",
      cardType: "equipment",
      faction: "neutra",
      cost: 1,
      attack: 0,
      health: 1,
      hasEssenceSymbol: false
    },
    {
      id: "altar-sombrio",
      name: "Altar Sombrio",
      cardType: "artifact",
      faction: "neutra",
      cost: 0,
      corruptionCost: 1,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      artifactEffect: "sacrifice-for-corruption"
    },
    {
      id: "destruidor-reliquias",
      name: "Destruidor de Rel\xEDquias",
      cardType: "troop",
      faction: "neutra",
      cost: 3,
      attack: 2,
      health: 2,
      hasEssenceSymbol: false,
      keywords: ["aterrisagem"],
      landingEffect: "destroy-enemy-artifact"
    },
    {
      id: "fragmentar",
      name: "Fragmentar",
      cardType: "spell",
      cardKind: "spell",
      cardSpeed: "standard",
      spellEffect: "destroy-artifact",
      cost: 2,
      attack: 0,
      health: 0,
      hasEssenceSymbol: false,
      faction: "neutra"
    }
  ],
  starterDeck: [
    "cinza-rastejante",
    "cinza-rastejante",
    "cinza-rastejante",
    "fragmento-poco",
    "fragmento-poco",
    "fragmento-poco",
    "fragmento-poco",
    "vigia-reverso",
    "vigia-reverso",
    "vigia-reverso",
    "vigia-reverso",
    "eco-banshee",
    "eco-banshee",
    "eco-banshee",
    "eco-banshee",
    "lamina-pacto",
    "lamina-pacto",
    "lamina-pacto",
    "lamina-pacto",
    "guardiao-estandarte",
    "guardiao-estandarte",
    "guardiao-estandarte",
    "guardiao-estandarte",
    "flagelo-cobre",
    "flagelo-cobre",
    "flagelo-cobre",
    "flagelo-cobre",
    "sombra-erudito",
    "sombra-erudito",
    "sombra-erudito",
    "sombra-erudito",
    "colosso-abismo",
    "colosso-abismo",
    "colosso-abismo",
    "colosso-abismo",
    "carnical-incandescente",
    "carnical-incandescente",
    "carnical-incandescente",
    "carnical-incandescente",
    "encore",
    "encore",
    "pele-ferro",
    "pele-ferro",
    "caldeirao-sangue",
    "caldeirao-sangue",
    "lufada-vento",
    "lufada-vento",
    "escudeiro-pacto",
    "escudeiro-pacto",
    "mensageiro-alado",
    "mensageiro-alado",
    "ultimo-suspiro",
    "eco-persistente",
    "corrente-eterea",
    "vazio-antimagia",
    "muralha-ossos",
    "ceifador-laminar",
    "ceifador-laminar",
    "falcao-abismo",
    "falcao-abismo",
    "noah-vampiro-inverno",
    "noah-delta-empatia",
    "altar-sombrio",
    "equip-lamina-pacto",
    "equip-lamina-pacto",
    "equip-escudo-delta",
    "equip-escudo-delta",
    "equip-amuleto-sombrio",
    "equip-corrente-ferro",
    "equip-corrente-ferro",
    "destruidor-reliquias",
    "fragmentar"
  ]
};

// src/server/load-catalog.ts
var cached = null;
function loadCatalogSync() {
  if (cached) return cached;
  cached = normalizeCatalog(cards_default);
  return cached;
}

// src/net/room-service.ts
function newToken() {
  return randomBytes(16).toString("hex");
}
function newRoomId() {
  return randomBytes(3).toString("hex").toUpperCase();
}
function seatFromToken(room, token) {
  if (room.tokens[0] === token) return 0;
  if (room.tokens[1] === token) return 1;
  return null;
}
function viewFor(room, seat) {
  return toPlayerView(room.state, seat, {
    version: room.version,
    seat,
    handCounts: [
      room.state.players[0].hand.length,
      room.state.players[1].hand.length
    ],
    deckCounts: [
      room.state.players[0].deck.length,
      room.state.players[1].deck.length
    ],
    bothConnected: room.tokens[0] !== null && room.tokens[1] !== null,
    roomId: room.id
  });
}
function buildNewRoom(leaderId) {
  const catalog = loadCatalogSync();
  const state = createInitialGame(catalog, { cpuPlayer: null, leaderId });
  const roomId = newRoomId();
  const token = newToken();
  return {
    id: roomId,
    state,
    version: 1,
    tokens: [token, null],
    updatedAt: Date.now()
  };
}
function createRoom(leaderId) {
  const room = buildNewRoom(leaderId);
  const token = room.tokens[0];
  return {
    roomId: room.id,
    token,
    seat: 0,
    view: viewFor(room, 0),
    room
  };
}
function joinRoom(room, leaderId) {
  if (room.tokens[1]) return { error: "Sala cheia." };
  if (leaderId) {
    const catalog = loadCatalogSync();
    const next = reassignPlayerLeader(room.state, 1, leaderId, catalog.starterDeck);
    if ("error" in next) return { error: next.error };
    room.state = next;
    room.version += 1;
  }
  const token = newToken();
  room.tokens[1] = token;
  room.updatedAt = Date.now();
  return { seat: 1, token, view: viewFor(room, 1) };
}
function applyRoomAction(room, token, action) {
  const seat = seatFromToken(room, token);
  if (seat === null) {
    return { ok: false, error: "Token inv\xE1lido.", view: null };
  }
  if (!canSubmitAction(room.state, seat, action)) {
    return {
      ok: false,
      error: "A\xE7\xE3o inv\xE1lida ou fora da sua vez.",
      view: viewFor(room, seat)
    };
  }
  const beforeLog = room.state.log.length;
  const next = dispatch(room.state, action);
  room.state = next;
  room.version += 1;
  room.updatedAt = Date.now();
  if (next.log.length === beforeLog && action.type !== "END_TURN") {
  }
  return { ok: true, view: viewFor(room, seat) };
}
function getRoomView(room, token) {
  const seat = seatFromToken(room, token);
  if (seat === null) return null;
  return viewFor(room, seat);
}

// src/net/room-store-memory.ts
var rooms = globalThis.__rrRooms ?? /* @__PURE__ */ new Map();
globalThis.__rrRooms = rooms;
async function getRoom(id) {
  return rooms.get(id.toUpperCase()) ?? null;
}
async function saveRoom(room) {
  rooms.set(room.id, room);
}
function isPersistentStore() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// src/net/room-store.ts
var KV_PREFIX = "rr-room:";
async function getRoom2(id) {
  if (isPersistentStore()) {
    try {
      const { kv } = await import("@vercel/kv");
      const fromKv = await kv.get(`${KV_PREFIX}${id.toUpperCase()}`);
      if (fromKv) return fromKv;
    } catch (err) {
      console.error("KV get failed:", err);
    }
  }
  return getRoom(id);
}
async function saveRoom2(room) {
  if (isPersistentStore()) {
    try {
      const { kv } = await import("@vercel/kv");
      await kv.set(`${KV_PREFIX}${room.id}`, room);
    } catch (err) {
      console.error("KV set failed:", err);
    }
  }
  await saveRoom(room);
}
export {
  applyRoomAction,
  createRoom,
  getRoom2 as getRoom,
  getRoomView,
  joinRoom,
  saveRoom2 as saveRoom
};
//# sourceMappingURL=rr-server.mjs.map
