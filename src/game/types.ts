export type PlayerId = 0 | 1;

/** Vida inicial do Líder (protótipo — permite testar MN → Abismo → RR). */
export const LEADER_MAX_HP = 15;
export const MAX_TROOPS_PER_ZONE = 3;
export const INITIAL_HAND_SIZE = 5;
export const CARDS_DRAW_PER_TURN = 1;
/** @deprecated Use dominationsToWinPhase(gamePhase) */
export const DOMINATIONS_TO_WIN_PHASE = 3;
export const DOMINATIONS_ABISMO = 2;
export const LEADER_EVOLUTION_CORRUPTION_COST = 5;

/** Corrupção máxima por fase de mundo. */
export function maxCorruptionForPhase(phase: WorldPhase): number {
  switch (phase) {
    case "mundo-normal": return 5;
    case "abismo": return 10;
    case "reino-reverso": return 999;
  }
}
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
  | "conquest-3-corruption"
  | "no-leave-by-move"
  | "random-combat-target"
  | "exile-on-death"
  | "spells-cost-less"
  | "rr-vacuum-2"
  | "rr-mutual-wipe-leader-damage"
  | "rr-loser-only-vacuum";

/** @deprecated Preferir `cardType`. Mantido para JSON legado. */
export type CardKind = "troop" | "spell";

/** Tipo da carta no baralho / catálogo. */
export type CardType = "troop" | "spell" | "equipment" | "artifact" | "leader";

/** Papéis extras (tropas). */
export type CardRole = "normal" | "captain";

/** Facções — todas as cartas piloto usam `neutra`. */
export type FactionId = "neutra" | (string & {});

/**
 * Padrão = seu turno + janelas de magia no combate.
 * Turno = só main do seu turno (não no combate).
 * Combate = janelas de magia no combate.
 * Rápida = main ou combate (ex.: contramagia).
 */
export type CardSpeed = "standard" | "combat" | "fast" | "turn";

export type SpellEffectId =
  | "encore"
  | "iron-skin"
  | "blood-cauldron"
  | "gust-wind"
  | "draw-two"
  | "troop-tutor"
  | "counterspell"
  | "spell-tutor"
  | "constriction"
  | "ethereal"
  | "omega"
  | "destroy-artifact";

/** Palavras-chave de tropa (não são magias). */
export type KeywordId =
  | "protetor"
  | "investida"
  | "testamento"
  | "eco"
  | "vincular"
  | "silencio"
  | "fatiar"
  | "voar"
  | "aterrisagem";

/** Efeito ao morrer (`testamento`) — independente de `spellEffect`. */
export type DeathEffectId = "draw-one" | "ping-leader-1";

/** Efeitos de ativação de artefatos permanentes. */
export type ArtifactEffectId = "sacrifice-for-corruption";

/** Efeitos de aterrisagem (ao entrar em campo). */
export type LandingEffectId = "destroy-enemy-artifact";

/** Habilidades ativas de Líder. */
export type LeaderAbilityId = "shield" | "frost-convert" | "empathy-mark" | "arcane-melody";

export type CombatSubPhase = "magic" | "strike";

/**
 * Custo em Essência: exaurte N fichas (viram 90°) e, opcionalmente, sacrifique M
 * para o descarte de Essência (não é o descarte de cartas do baralho).
 * O sacrifício pode ser uma das fichas recém-exauridas.
 */
export interface EssenceCost {
  exhaust: number;
  sacrifice?: number;
}

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
  /** Tipo da carta (feitiço, tropa, equipamento, artefato, líder). */
  cardType?: CardType;
  /** @deprecated Use `cardType`. */
  cardKind?: CardKind;
  /** Facção da carta (sinergias de deck). */
  faction?: FactionId;
  /** Tropas: normal ou capitã (máx. 1 cópia; exige `requiredLeaderId`). */
  cardRole?: CardRole;
  /** Capitã: id da carta de Líder que permite esta tropa no deck. */
  requiredLeaderId?: string;
  /** Líder: vida máxima fora do baralho (substitui LEADER_MAX_HP quando ativo). */
  leaderMaxHp?: number;
  /** Líder: texto descritivo da habilidade. */
  leaderAbility?: string;
  /** Líder: id da habilidade ativa (para o engine). */
  leaderAbilityId?: LeaderAbilityId;
  /**
   * Líder base: ids das formas evoluídas.
   * Ex.: Noah inverno, Noah delta.
   */
  leaderFormIds?: string[];
  /** Forma de Líder: id do Líder base a que pertence. Cartas com este campo vão no deck. */
  leaderFormOf?: string;
  /** Recompensa ao sacrificar no Espaço de Essência (substitui o padrão de 1 essência). */
  sacrificeReward?: { essence: number; corruption: number };
  /** Custo avançado; se omitido, equivale a `{ exhaust: cost }`. */
  essenceCost?: EssenceCost;
  /** Custo em Corrupção (bolinha roxa). */
  corruptionCost?: number;
  spellEffect?: SpellEffectId;
  /** Tropas = padrão; magias piloto = combate. */
  cardSpeed?: CardSpeed;
  /** Palavras-chave da tropa. */
  keywords?: KeywordId[];
  /** Com `testamento` — efeito ao morrer (não bloqueado por Bar do João). */
  deathEffect?: DeathEffectId;
  /** Artefato: efeito de ativação. */
  artifactEffect?: ArtifactEffectId;
  /** Efeito de aterrisagem (ao entrar em campo). */
  landingEffect?: LandingEffectId;
}

/** Baralho + metadados para validação (deckbuilder / partida). */
export interface DeckDefinition {
  leaderId: string | null;
  cardIds: string[];
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
  /** Magia permanente na tropa (Encore, Pele de Ferro). */
  attachedSpell: SpellEffectId | null;
  /** Bônus de vida permanente (ex.: Pele de Ferro). */
  healthBonus: number;
  /** Vincular — não pode mover até a preparação do dono. */
  movementLocked: boolean;
  /** Eterealidade — não pode ser alvo de ataques/feitiços pontuais neste turno. */
  etherealThisTurn?: boolean;
  /** Constrição — não pode atacar no próximo combate em que o dono atacaria. */
  attackSuppressed?: boolean;
  /** Escudo do Líder — bloqueia o próximo dano recebido (qualquer quantidade). */
  shielded?: boolean;
  /** Cria do Inverno — tropa transformada pela habilidade frost-convert. */
  isFrostborn?: boolean;
  /** Marca de Empatia — tropa marcada pela habilidade empathy-mark. */
  hasEmpathy?: boolean;
  /** Equipamento preso nesta tropa (id em `GameState.equipments`). */
  equipmentId: string | null;
}

/** Equipamento em jogo — anexado a uma tropa aliada. */
export interface EquipmentInstance {
  instanceId: string;
  cardId: string;
  owner: PlayerId;
  troopId: string;
}

/** Artefato permanente em jogo na base do jogador. */
export interface ArtifactInstance {
  instanceId: string;
  cardId: string;
  owner: PlayerId;
  exhausted: boolean;
}

/** Feitiço aguardando contramagia ou resolução. */
export interface PendingSpellState {
  caster: PlayerId;
  spellCardId: string;
  effect: SpellEffectId;
  targetTroopId: string | null;
  targetArtifactId: string | null;
  /** Oponente pode responder com Contramagia. */
  counterWindowOpen: boolean;
  /** Contramagia foi jogada; o lançador original decide pagar 2 essências. */
  awaitingCounterPayment: boolean;
}

/** Carta no Espaço de Essência — exausta ao pagar custos, desvira na preparação. */
export interface EssenceInstance {
  instanceId: string;
  cardId: string;
  owner: PlayerId;
  exhausted: boolean;
  /** Essência temporária — só paga feitiços, some no fim do turno. */
  spellOnly?: boolean;
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
  | "phase_end_choice_p0"
  | "phase_end_choice_p1"
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
  /**
   * Essências sacrificadas como custo (cardIds da carta convertida).
   * Separado do descarte — cartas que “voltam do descarte” não recuperam isto.
   */
  essenceDiscard: string[];
  /** Cartas exiladas (fora do jogo). */
  exile: string[];
  /** IDs no mapa `essencePool` do GameState. */
  essenceIds: string[];
  dominatedArenas: number;
  sacrificedThisTurn: boolean;
  corruption: number;
  /** ID da carta de Líder atual (pode mudar com evolução). */
  leaderId: string | null;
  /** Habilidade do Líder já usada neste turno. */
  leaderAbilityUsedThisTurn: boolean;
  /** Líder exausto — não pode usar habilidade até a próxima preparação. */
  leaderExhausted: boolean;
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
  /** Fase de magias ou golpe de ataques. */
  subPhase: CombatSubPhase;
  /** Janela de magia (1 antes do golpe 1, 2 antes do golpe 2…). */
  magicWindow: number;
  /** Cada jogador passou a fase de magia atual. */
  magicPassed: [boolean, boolean];
  /** Bar do João — magias bloqueadas neste combate. */
  noMagic?: boolean;
  /** Castelo de Pedra Rubra — magias nesta arena custam 1 a menos. */
  spellsCostLess?: boolean;
}

export interface GameState {
  catalog: Record<string, CardDefinition>;
  troops: Record<string, TroopInstance>;
  essencePool: Record<string, EssenceInstance>;
  /** Artefatos em jogo (permanentes na base). */
  artifacts: Record<string, ArtifactInstance>;
  /** Equipamentos anexados a tropas. */
  equipments: Record<string, EquipmentInstance>;
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
  /** Jogador controlado pela CPU (null = hotseat). */
  cpuPlayer: PlayerId | null;
  /** Modo de teste (pula MN / setup); null em partida normal. */
  testMode: "abismo" | "reino-reverso" | null;
  /** Pilha de feitiço (contramagia / resolução). */
  pendingSpell: PendingSpellState | null;
}

export type GameAction =
  | { type: "SELECT_ARENA"; player: PlayerId; arenaId: string }
  | { type: "MULLIGAN"; player: PlayerId; handIndices: number[] }
  | { type: "SKIP_MULLIGAN"; player: PlayerId }
  | { type: "ADVANCE_TURN_PHASE" }
  | { type: "PLAY_TROOP"; troopId: string }
  | {
      type: "PLAY_SPELL";
      player: PlayerId;
      spellInstanceId: string;
      targetTroopId?: string | null;
      targetArtifactId?: string | null;
    }
  | { type: "PASS_SPELL_COUNTER"; player: PlayerId }
  | { type: "RESOLVE_COUNTER_PAYMENT"; player: PlayerId; payTwoEssence: boolean }
  | { type: "PASS_COMBAT_MAGIC"; player: PlayerId }
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
    }
  | { type: "USE_LEADER_ABILITY"; player: PlayerId; targetTroopId: string }
  | { type: "EVOLVE_LEADER"; player: PlayerId; formId: string; formInstanceId: string }
  | { type: "ACTIVATE_ARTIFACT"; artifactId: string; sacrificeTroopId?: string }
  | { type: "EQUIP_TROOP"; equipmentInstanceId: string; targetTroopId: string };
