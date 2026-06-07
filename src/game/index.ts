export * from "./types";
export {
  canPayCorruptionCost,
  canPayEssenceCost,
  getAvailableEssence,
  getPlayerEssence,
  getCardName,
  payCorruptionCost,
  payEssenceCost,
} from "./helpers";
export { loadCardCatalog, normalizeCatalog, shuffle } from "./cards";
export {
  cardTypeLabel,
  factionLabel,
  canAffordCardCost,
  formatCardCost,
  formatCorruptionCost,
  formatEssenceCost,
  getCardType,
  getCorruptionCost,
  getEssenceCost,
  getFaction,
  isCaptainCard,
  isDeckableCard,
  isLeaderCard,
  normalizeCardDefinition,
} from "./card-meta";
export { validateDeck, validateStarterDeck, type DeckValidationResult } from "./deck-rules";
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
  canAffordSpellCost,
  canPlaySpellNow,
  canTargetSpell,
  describeSpellEffect,
  getCardSpeed,
  isSpellCard,
  isTroopCard,
  passSpellCounter,
  resolveCounterPayment,
  speedLabel,
  spellEffectLabel,
} from "./spells";
export { spellRequiresTarget, troopIsUntargetable } from "./spell-stack";
export { runTurnBegin, repairStaleTurnPhase } from "./turn";
export { buryDeadTroops } from "./troop-cleanup";
export {
  applyLandingEffect,
  cardHasKeyword,
  describeKeywordRule,
  formatKeywordsLine,
  getLegalCombatTargets,
  isLegalCombatTarget,
  keywordLabel,
  troopCanFlyBetweenArenas,
} from "./keywords";
export { phaseDisplayName, dominationsToWinPhase } from "./phase-transition";
