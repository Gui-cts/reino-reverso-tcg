import { appendLog, getTroopName } from "./helpers";
import { shufflePlayerDeck } from "./tokens";
import { getCardType } from "./card-meta";
import type {
  ArtifactEffectId,
  CardDefinition,
  EquipmentInstance,
  GameState,
  PlayerId,
  TroopInstance,
} from "./types";

export function describeArtifactEffect(effect: ArtifactEffectId): string {
  switch (effect) {
    case "sacrifice-for-corruption":
      return "Ativar: sacrifique uma tropa aliada para ganhar +1 Corrupção. Fica exausto até o próximo turno.";
    case "free-spell":
      return "Ativar (exausta): conjure um feitiço da mão sem pagar custo.";
    default:
      return "";
  }
}

export function describeEquipmentEffect(def: CardDefinition): string {
  const atk = def.attack ?? 0;
  const hp = def.health ?? 0;
  const bonus: string[] = [];
  if (atk > 0) bonus.push(`+${atk} ataque`);
  if (hp > 0) bonus.push(`+${hp} vida`);
  const bonusText = bonus.length ? ` Concede ${bonus.join(" e ")}.` : "";
  const trait =
    def.equipmentTrait === "vacuum-resist"
      ? " Resistência ao Vácuo (RR): após combate, o equipamento volta ao baralho em vez da tropa ser destruída."
      : "";
  const role = def.cardRole === "signature" ? " Assinatura do Líder." : "";
  return `Equipa em tropa aliada na base ou arena.${bonusText}${trait}${role}`;
}

export function troopHasVacuumResistance(state: GameState, troop: TroopInstance): boolean {
  if (state.gamePhase !== "reino-reverso") return false;
  const eqDef = getEquipmentDef(state, troop);
  return eqDef?.equipmentTrait === "vacuum-resist";
}

export function isEquipmentCard(def: CardDefinition | undefined): boolean {
  return Boolean(def && getCardType(def) === "equipment");
}

export function getTroopEquipment(
  state: GameState,
  troop: TroopInstance,
): EquipmentInstance | null {
  if (!troop.equipmentId) return null;
  return state.equipments[troop.equipmentId] ?? null;
}

export function getEquipmentDef(
  state: GameState,
  troop: TroopInstance,
): CardDefinition | null {
  const eq = getTroopEquipment(state, troop);
  if (!eq) return null;
  return state.catalog[eq.cardId] ?? null;
}

export function troopHasEquipment(state: GameState, troop: TroopInstance): boolean {
  return getTroopEquipment(state, troop) !== null;
}

/** Lista equipamentos inimigos (presos em tropas). */
export function getEnemyEquippedTroops(state: GameState, player: PlayerId): TroopInstance[] {
  const enemy = player === 0 ? 1 : 0;
  return Object.values(state.troops).filter(
    (t) =>
      t.owner === enemy &&
      t.equipmentId !== null &&
      (t.zone === "base" || t.zone === "arena") &&
      t.currentHealth > 0,
  );
}

export function destroyEquipmentOnTroop(
  state: GameState,
  troopId: string,
  logPrefix: string,
): GameState {
  const troop = state.troops[troopId];
  if (!troop?.equipmentId) return state;

  const eq = state.equipments[troop.equipmentId];
  if (!eq) {
    const troops = { ...state.troops, [troopId]: { ...troop, equipmentId: null } };
    return { ...state, troops };
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
    currentHealth: Math.max(1, troop.currentHealth - bonusHp),
  };

  const equipments = { ...state.equipments };
  delete equipments[eq.instanceId];

  const owner = troop.owner as PlayerId;
  const players = [...state.players] as GameState["players"];
  players[owner] = {
    ...players[owner],
    discard: [...players[owner].discard, eq.cardId],
  };

  const eqName = eqDef?.name ?? eq.cardId;
  return {
    ...state,
    troops,
    equipments,
    players,
    log: appendLog(state, `${logPrefix} — ${eqName} foi destruído.`),
  };
}

/** Destrói artefato inimigo ou equipamento em tropa (prioriza artefato). */
export function destroyEnemyRelic(state: GameState, caster: PlayerId): GameState {
  const enemy = caster === 0 ? 1 : 0;
  const enemyArtifacts = Object.values(state.artifacts).filter((a) => a.owner === enemy);
  if (enemyArtifacts.length > 0) {
    const target = enemyArtifacts[0]!;
    const targetName = state.catalog[target.cardId]?.name ?? "Artefato";
    const artifacts = { ...state.artifacts };
    delete artifacts[target.instanceId];
    const players = [...state.players] as GameState["players"];
    players[enemy] = {
      ...players[enemy],
      discard: [...players[enemy].discard, target.cardId],
    };
    return {
      ...state,
      artifacts,
      players,
      log: appendLog(state, `${targetName} do Jogador ${enemy + 1} foi destruído!`),
    };
  }

  const equipped = getEnemyEquippedTroops(state, caster);
  if (equipped.length === 0) {
    return {
      ...state,
      log: appendLog(state, "Nenhum artefato/equipamento inimigo para destruir."),
    };
  }

  const victim = equipped[0]!;
  const eq = state.equipments[victim.equipmentId!];
  const eqName = eq ? (state.catalog[eq.cardId]?.name ?? "Equipamento") : "Equipamento";
  return destroyEquipmentOnTroop(
    state,
    victim.instanceId,
    `${eqName} em ${getTroopName(state, victim)}`,
  );
}

/** Desequipa e embaralha a carta de equipamento no baralho do dono (assinaturas). */
export function returnEquipmentToDeck(
  state: GameState,
  troopId: string,
  logPrefix: string,
): GameState {
  const troop = state.troops[troopId];
  if (!troop?.equipmentId) return state;

  const eq = state.equipments[troop.equipmentId];
  if (!eq) {
    const troops = { ...state.troops, [troopId]: { ...troop, equipmentId: null } };
    return { ...state, troops };
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
    currentHealth: Math.max(1, troop.currentHealth - bonusHp),
  };

  const equipments = { ...state.equipments };
  delete equipments[eq.instanceId];

  const owner = troop.owner as PlayerId;
  const players = [...state.players] as GameState["players"];
  players[owner] = {
    ...players[owner],
    deck: [...players[owner].deck, eq.cardId],
  };

  const eqName = eqDef?.name ?? eq.cardId;
  let next: GameState = {
    ...state,
    troops,
    equipments,
    players,
    log: appendLog(
      state,
      `${logPrefix} — ${eqName} voltou ao baralho de Jogador ${owner + 1}.`,
    ),
  };
  return shufflePlayerDeck(next, owner);
}
