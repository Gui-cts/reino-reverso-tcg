import type { EssenceCost } from "./types";
import type {
  ArenaState,
  EssenceInstance,
  GameState,
  PlayerId,
  TroopInstance,
} from "./types";

export function opponent(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

export function appendLog(state: GameState, message: string): string[] {
  const next = [...state.log, message];
  return next.length > 80 ? next.slice(-80) : next;
}

export function nextInstanceId(state: GameState): [number, number] {
  return [state.nextInstanceId, state.nextInstanceId + 1];
}

export function getTroopsInZone(
  state: GameState,
  player: PlayerId,
  zone: TroopInstance["zone"],
  arenaId?: string,
): TroopInstance[] {
  return Object.values(state.troops).filter((t) => {
    if (t.owner !== player || t.zone !== zone || t.currentHealth <= 0) return false;
    if (zone === "arena") return t.arenaId === arenaId;
    return true;
  });
}

export function countTroopsInZone(
  state: GameState,
  player: PlayerId,
  zone: TroopInstance["zone"],
  arenaId?: string,
): number {
  return getTroopsInZone(state, player, zone, arenaId).length;
}

export function getPlayerEssence(
  state: GameState,
  player: PlayerId,
): EssenceInstance[] {
  return state.players[player].essenceIds
    .map((id) => state.essencePool[id])
    .filter((e): e is EssenceInstance => Boolean(e) && e.owner === player);
}

export function getAvailableEssence(
  state: GameState,
  player: PlayerId,
): EssenceInstance[] {
  return getPlayerEssence(state, player).filter((e) => !e.exhausted);
}

export function getAvailableNonTempEssence(
  state: GameState,
  player: PlayerId,
): EssenceInstance[] {
  return getAvailableEssence(state, player).filter((e) => !e.spellOnly);
}

export function getArena(state: GameState, arenaId: string): ArenaState {
  const arena = state.arenas.find((a) => a.id === arenaId);
  if (!arena) throw new Error(`Arena não encontrada: ${arenaId}`);
  return arena;
}

export function getCardName(state: GameState, cardId: string): string {
  return state.catalog[cardId]?.name ?? cardId;
}

export function getTroopName(state: GameState, troop: TroopInstance): string {
  return getCardName(state, troop.cardId);
}

export function canAfford(state: GameState, player: PlayerId, cost: number): boolean {
  return canPayEssenceCost(state, player, { exhaust: cost });
}

export function canPayEssenceCost(
  state: GameState,
  player: PlayerId,
  payment: EssenceCost,
): boolean {
  const available = getAvailableEssence(state, player);
  const sacrifice = payment.sacrifice ?? 0;
  if (available.length < payment.exhaust) return false;
  if (sacrifice > payment.exhaust) return false;
  return true;
}

/** Exausta cartas de Essência (não descarta). */
export function exhaustEssence(
  state: GameState,
  player: PlayerId,
  cost: number,
): GameState {
  return payEssenceCost(state, player, { exhaust: cost }).state;
}

/**
 * Paga custo em Essência: exaurte N fichas; opcionalmente sacrifique M
 * (vão para `essenceDiscard` do jogador, removidas do pool).
 */
export function payEssenceCost(
  state: GameState,
  player: PlayerId,
  payment: EssenceCost,
  preferTemp = false,
): { state: GameState; ok: boolean } {
  const sacrifice = payment.sacrifice ?? 0;
  const pool = getPlayerEssence(state, player);
  if (pool.length < payment.exhaust || sacrifice > payment.exhaust) {
    return { state, ok: false };
  }

  let next = state;
  const exhaustedIds: string[] = [];

  for (let i = 0; i < payment.exhaust; i++) {
    const available = getAvailableEssence(next, player)
      .sort((a, b) => preferTemp
        ? (b.spellOnly ? 1 : 0) - (a.spellOnly ? 1 : 0)
        : (a.spellOnly ? 1 : 0) - (b.spellOnly ? 1 : 0)
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
    const players = [...next.players] as GameState["players"];

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

export function canPayCorruptionCost(
  state: GameState,
  player: PlayerId,
  amount: number,
): boolean {
  if (amount <= 0) return true;
  return state.players[player].corruption >= amount;
}

/** Gasta Corrupção acumulada. */
export function payCorruptionCost(
  state: GameState,
  player: PlayerId,
  amount: number,
): { state: GameState; ok: boolean } {
  if (amount <= 0) return { state, ok: true };
  if (!canPayCorruptionCost(state, player, amount)) {
    return { state, ok: false };
  }
  const players = [...state.players] as GameState["players"];
  players[player] = {
    ...players[player],
    corruption: players[player].corruption - amount,
  };
  return { state: { ...state, players }, ok: true };
}

/** Garante que cada mão só referencia tropas do próprio dono. */
export function sanitizePlayerHands(state: GameState): GameState {
  const players = [...state.players] as GameState["players"];
  for (const p of [0, 1] as PlayerId[]) {
    players[p] = {
      ...players[p],
      hand: players[p].hand.filter((id) => state.troops[id]?.owner === p),
    };
  }
  return { ...state, players };
}

export function untapEssence(state: GameState, player: PlayerId): GameState {
  const essencePool = { ...state.essencePool };
  for (const id of state.players[player].essenceIds) {
    const e = essencePool[id];
    if (e && e.owner === player) {
      essencePool[id] = { ...e, exhausted: false };
    }
  }
  return { ...state, essencePool };
}
