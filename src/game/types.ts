export type PlayerId = 0 | 1;

export const LEADER_MAX_HP = 3;
export const MAX_TROOPS_PER_ZONE = 3;
export const INITIAL_HAND_SIZE = 5;
export const CARDS_DRAW_PER_TURN = 1;
/** @deprecated Use dominationsToWinPhase(gamePhase) */
export const DOMINATIONS_TO_WIN_PHASE = 3;
export const DOMINATIONS_ABISMO = 2;
export const MAX_CORRUPTION = 3;
export const DEFAULT_CONQUEST_TO_DOMINATE = 2;

export type WorldPhase = "mundo-normal" | "abismo" | "reino-reverso";

export type ArenaEffectId =
  | "none"
  | "no-magic"
  | "gargoyle-fill"
  | "susej-on-dominate"
  | "random-buff-on-combat"
  | "draw-two-on-dominate"
  | "ping-after-strike"
  | "conquest-3-corruption";

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  attack: number;
  health: number;
  hasEssenceSymbol: boolean;
  /** Caminho opcional da arte (ex.: /cards/meu-id.svg). */
  image?: string;
  /** Ficha / token — não vai no baralho inicial. */
  isToken?: boolean;
}

export interface CardCatalog {
  cards: CardDefinition[];
  starterDeck: string[];
}

export interface TroopInstance {
  instanceId: string;
  cardId: string;
  owner: PlayerId;
  currentHealth: number;
  attack: number;
  exhausted: boolean;
  pinned: boolean;
  zone: "hand" | "base" | "arena" | "discard";
  arenaId: string | null;
}

/** Carta no Espaço de Essência — exausta ao pagar custos, desvira na preparação. */
export interface EssenceInstance {
  instanceId: string;
  cardId: string;
  owner: PlayerId;
  exhausted: boolean;
}

export interface ArenaDefinition {
  id: string;
  name: string;
  neutral: boolean;
  phase: WorldPhase;
  effect: ArenaEffectId;
  conquestPointsToDominate: number;
  pickedBy: PlayerId | null;
}

export interface ArenaState {
  id: string;
  name: string;
  neutral: boolean;
  phase: WorldPhase;
  effect: ArenaEffectId;
  conquestPointsToDominate: number;
  dominatedBy: PlayerId | null;
  conquestPoints: Record<PlayerId, number>;
}

/** Aguardando o turno do oponente sem combate nesta arena. */
export interface ConquestWatch {
  player: PlayerId;
}

export type MatchPhase =
  | "setup_arenas_p0"
  | "setup_arenas_p1"
  | "mulligan_p0"
  | "mulligan_p1"
  | "phase_end_choice"
  | "setup_abismo_winner"
  | "setup_abismo_loser"
  | "setup_rr_winner"
  | "playing"
  | "finished";

export type TurnPhase = "preparation" | "draw" | "start" | "main" | "combat";

export interface PlayerState {
  leaderHp: number;
  deck: string[];
  hand: string[];
  discard: string[];
  /** IDs no mapa `essencePool` do GameState. */
  essenceIds: string[];
  dominatedArenas: number;
  sacrificedThisTurn: boolean;
  corruption: number;
}

export interface CombatState {
  arenaId: string;
  /** Golpe de combate (1 = atacante, 2 = defensor, 3 = atacante…). */
  strike: number;
  /** Quem declarou o combate — ataca nos golpes ímpares. */
  declaredBy: PlayerId;
  /** Jogador que escolhe alvos e causa dano neste golpe. */
  strikingPlayer: PlayerId;
  /** Tropas que já atacaram neste golpe (um ataque por vez). */
  attackedThisStrike: string[];
  /** Bar do João — magias bloqueadas neste combate. */
  noMagic?: boolean;
}

export interface GameState {
  catalog: Record<string, CardDefinition>;
  troops: Record<string, TroopInstance>;
  essencePool: Record<string, EssenceInstance>;
  players: [PlayerState, PlayerState];
  arenas: ArenaState[];
  activePlayer: PlayerId;
  matchPhase: MatchPhase;
  turnPhase: TurnPhase;
  turnNumber: number;
  winner: PlayerId | null;
  winReason: string | null;
  log: string[];
  /** Fase macro da partida (arenas filtradas por fase). */
  gamePhase: WorldPhase;
  arenaPool: ArenaDefinition[];
  selectedArenaIds: [string[], string[]];
  conquestWatch: Record<string, ConquestWatch | null>;
  combat: CombatState | null;
  nextInstanceId: number;
  mulliganUsed: [boolean, boolean];
  /** Vencedor da fase anterior (escolha pós-fase e draft de arenas). */
  phaseWinner: PlayerId | null;
  /** IDs acumulados no setup do Abismo / RR. */
  arenaSetupPicks: string[];
}

export type GameAction =
  | { type: "SELECT_ARENA"; player: PlayerId; arenaId: string }
  | { type: "MULLIGAN"; player: PlayerId; handIndices: number[] }
  | { type: "SKIP_MULLIGAN"; player: PlayerId }
  | { type: "ADVANCE_TURN_PHASE" }
  | { type: "PLAY_TROOP"; troopId: string }
  | { type: "SACRIFICE_ESSENCE"; troopId: string }
  | { type: "MOVE_TROOP"; troopId: string; to: "base" | "arena"; arenaId?: string }
  | { type: "DECLARE_COMBAT"; arenaId: string }
  | { type: "EXECUTE_COMBAT_ATTACK"; attackerId: string; targetId: string }
  | { type: "END_COMBAT_STRIKE" }
  | { type: "END_TURN" }
  | {
      type: "POST_PHASE_CHOICE";
      player: PlayerId;
      choice: "essence" | "corruption" | "recycle";
    };
