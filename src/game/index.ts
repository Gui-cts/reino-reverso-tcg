export * from "./types";
export {
  getAvailableEssence,
  getPlayerEssence,
  getCardName,
} from "./helpers";
export { loadCardCatalog, shuffle } from "./cards";
export { getCardArtUrl, getCardArtUrlById } from "./card-art";
export { createInitialGame } from "./state";
export { createTestGame, testModeLabel, type TestMode } from "./test-setup";
export { dispatch } from "./actions";
export {
  getCombatAssigningPlayer,
  getContestedArenaNames,
  hasAttackedThisStrike,
  isCombatMagicPhase,
  isCombatStrikePhase,
} from "./combat";
export {
  arenaBlocksNormalExit,
  arenaUsesRandomCombatTargets,
  spellCostReductionInCombat,
} from "./arena-effects";
export { getRRUnansweredArenaNames } from "./reino-reverso";
export {
  canPlaySpellNow,
  canTargetSpell,
  describeSpellEffect,
  getCardSpeed,
  isSpellCard,
  isTroopCard,
  speedLabel,
  spellEffectLabel,
} from "./spells";
export { runTurnBegin } from "./turn";
export { buryDeadTroops } from "./troop-cleanup";
export { phaseDisplayName, dominationsToWinPhase } from "./phase-transition";
