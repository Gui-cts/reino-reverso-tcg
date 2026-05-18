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
    .filter((e): e is EssenceInstance => Boolean(e));
}

export function getAvailableEssence(
  state: GameState,
  player: PlayerId,
): EssenceInstance[] {
  return getPlayerEssence(state, player).filter((e) => !e.exhausted);
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
  return getAvailableEssence(state, player).length >= cost;
}

/** Exausta cartas de Essência (não descarta). */
export function exhaustEssence(
  state: GameState,
  player: PlayerId,
  cost: number,
): GameState {
  const available = getAvailableEssence(state, player);
  if (available.length < cost) return state;

  const essencePool = { ...state.essencePool };
  for (let i = 0; i < cost; i++) {
    const card = available[i];
    essencePool[card.instanceId] = { ...card, exhausted: true };
  }

  return { ...state, essencePool };
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
