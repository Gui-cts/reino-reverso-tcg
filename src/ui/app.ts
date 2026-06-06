import {
  createInitialGame,
  createTestGame,
  dispatch,
  loadCardCatalog,
  testModeLabel,
  type TestMode,
} from "../game";
import type { GameAction, CardCatalog, GameState, PlayerId, TroopInstance } from "../game/types";
import { LEADER_MAX_HP, LEADER_EVOLUTION_CORRUPTION_COST, maxCorruptionForPhase } from "../game/types";
import {
  getAvailableEssence,
  getCombatAssigningPlayer,
  getContestedArenaNames,
  getRRUnansweredArenaNames,
  getPlayerEssence,
  hasAttackedThisStrike,
  isCombatMagicPhase,
  isCombatStrikePhase,
  isLegalCombatTarget,
} from "../game";
import { formatKeywordsLine } from "../game/keywords";
import { describeArenaEffect } from "../game/arenas";
import {
  arenaUsesRandomCombatTargets,
  dominationsToWinPhase,
  phaseDisplayName,
} from "../game";
import {
  canAffordSpellCost,
  canPlaySpellNow,
  canTargetSpell,
  formatCardCost,
  describeSpellEffect,
  getCardSpeed,
  isSpellCard,
  spellEffectLabel,
  spellRequiresTarget,
} from "../game";
import { opponent } from "../game/helpers";
import { pickCpuAction, cpuControlsPhase } from "./cpu";
import { attachCardHoverPreview } from "./card-hover-preview";
import { cardFromDef, createCardEl, createEssenceTokenEl, createHiddenCardEl } from "./card-view";
import {
  bindDropZone,
  setCardDraggable,
  type DragPayload,
  type DropZoneInfo,
} from "./drag-drop";

type UiSelection = {
  troopId: string | null;
  arenaId: string | null;
  spellInstanceId: string | null;
  mulliganIndices: Set<number>;
  /** Habilidade do Líder ativada — próximo clique em tropa aplica a habilidade. */
  leaderAbilityTargeting: boolean;
};

type AppScreen = "menu" | "game";

export class GameApp {
  private catalog: CardCatalog | null = null;
  private state: GameState | null = null;
  private screen: AppScreen = "menu";
  private lastCpuPlayer: PlayerId | null = null;
  private lastTestMode: TestMode | null = null;
  private selection: UiSelection = {
    troopId: null,
    arenaId: null,
    spellInstanceId: null,
    leaderAbilityTargeting: false,
    mulliganIndices: new Set(),
  };
  private root: HTMLElement;
  private cpuRunning = false;
  /** Incrementado a cada mudança de estado — invalida esperas/ações obsoletas do loop da CPU. */
  private cpuLoopGeneration = 0;
  /** Próxima ação da CPU usa 500 ms (botão "Acelerar"). */
  private cpuDelayOverride = false;

  private static readonly CPU_DELAY_MS = 7000;
  private static readonly CPU_DELAY_FAST_MS = 500;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  private humanPlayer(s: GameState): PlayerId {
    if (s.cpuPlayer === null) return 0;
    return s.cpuPlayer === 0 ? 1 : 0;
  }

  private isCpuPlayer(s: GameState, player: PlayerId): boolean {
    return s.cpuPlayer !== null && s.cpuPlayer === player;
  }

  /** Jogador que pode usar mouse/teclado neste momento. */
  private canControlPlayer(s: GameState, player: PlayerId): boolean {
    if (this.isCpuPlayer(s, player)) return false;

    if (s.matchPhase === "setup_arenas_p0") return player === 0;
    if (s.matchPhase === "setup_arenas_p1") return player === 1;
    if (s.matchPhase === "mulligan_p0") return player === 0;
    if (s.matchPhase === "mulligan_p1") return player === 1;
    if (s.matchPhase === "phase_end_choice_p0") return player === 0;
    if (s.matchPhase === "phase_end_choice_p1") return player === 1;

    const setup = this.arenaSetupContext(s);
    if (setup) return player === setup.player;

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

  async init(): Promise<void> {
    this.catalog = await loadCardCatalog();
    this.screen = "menu";
    this.render();
  }

  private startGame(cpuPlayer: PlayerId | null, testMode: TestMode | null = null): void {
    if (!this.catalog) throw new Error("Catálogo não carregado");
    this.lastCpuPlayer = cpuPlayer;
    this.lastTestMode = testMode;
    this.state = testMode
      ? createTestGame(this.catalog, { cpuPlayer, testMode })
      : createInitialGame(this.catalog, { cpuPlayer });
    this.screen = "game";
    this.selection = {
      troopId: null,
      arenaId: null,
      spellInstanceId: null,
      mulliganIndices: new Set(),
      leaderAbilityTargeting: false,
    };
    this.render();
    void this.runCpuLoop();
  }

  private returnToMenu(): void {
    this.screen = "menu";
    this.state = null;
    this.cpuRunning = false;
    this.render();
  }

  private getState(): GameState {
    if (!this.state) throw new Error("Jogo não inicializado");
    if (
      this.state.matchPhase === "playing" &&
      !this.state.combat &&
      this.state.turnPhase === "combat"
    ) {
      this.state = { ...this.state, turnPhase: "main" };
    }
    return this.state;
  }

  private canDragTroopsOnField(s: GameState, troop: TroopInstance): boolean {
    if (
      s.matchPhase !== "playing" ||
      s.turnPhase !== "main" ||
      s.combat ||
      s.activePlayer !== troop.owner ||
      troop.pinned ||
      troop.exhausted ||
      !this.canControlPlayer(s, troop.owner)
    ) {
      return false;
    }
    return troop.zone === "base" || troop.zone === "arena";
  }

  private update(next: GameState): void {
    this.state = next;
    this.selection.troopId = null;
    this.selection.arenaId = null;
    this.selection.spellInstanceId = null;
    this.selection.leaderAbilityTargeting = false;
    this.cpuLoopGeneration++;
    this.render();
    void this.runCpuLoop();
  }

  private humanHasFastSpellInHand(state: GameState): boolean {
    const human = this.humanPlayer(state);
    return state.players[human].hand.some((id) => {
      const inst = state.troops[id];
      if (!inst) return false;
      const def = state.catalog[inst.cardId];
      return Boolean(def && isSpellCard(def) && getCardSpeed(def) === "fast");
    });
  }

  private humanHasPlayableFastSpell(state: GameState): boolean {
    const human = this.humanPlayer(state);
    for (const id of state.players[human].hand) {
      const inst = state.troops[id];
      if (!inst) continue;
      const def = state.catalog[inst.cardId];
      if (!def || !isSpellCard(def) || getCardSpeed(def) !== "fast") continue;
      if (!canPlaySpellNow(state, human, def)) continue;
      if (Object.values(state.troops).some((t) => canTargetSpell(state, human, def, t))) {
        return true;
      }
    }
    return false;
  }

  private getCpuActionDelayMs(state: GameState): number {
    if (this.cpuDelayOverride) {
      this.cpuDelayOverride = false;
      return GameApp.CPU_DELAY_FAST_MS;
    }
    if (!this.humanHasPlayableFastSpell(state)) {
      return GameApp.CPU_DELAY_FAST_MS;
    }
    return GameApp.CPU_DELAY_MS;
  }

  private requestCpuFastDelay(): void {
    this.cpuDelayOverride = true;
    this.cpuLoopGeneration++;
    void this.runCpuLoop();
  }

  private applyCpuActionResult(after: GameState): void {
    this.state = after;
    this.selection.troopId = null;
    this.selection.arenaId = null;
    this.selection.spellInstanceId = null;
    this.render();
  }

  private async runCpuLoop(): Promise<void> {
    if (this.cpuRunning) return;
    const s = this.getState();
    if (s.cpuPlayer === null) return;

    const loopGen = this.cpuLoopGeneration;
    this.cpuRunning = true;
    try {
      let safety = 0;
      while (safety++ < 64 && loopGen === this.cpuLoopGeneration) {
        const cur = this.getState();
        if (cur.matchPhase === "finished" || cur.cpuPlayer === null) break;
        const cpu = cur.cpuPlayer;
        if (!cpuControlsPhase(cur, cpu)) break;

        const delayMs = this.getCpuActionDelayMs(cur);
        await new Promise((r) => setTimeout(r, delayMs));
        if (loopGen !== this.cpuLoopGeneration) break;

        const latest = this.getState();
        if (latest.matchPhase === "finished" || latest.cpuPlayer === null) break;
        if (!cpuControlsPhase(latest, latest.cpuPlayer)) break;

        const action = pickCpuAction(latest, latest.cpuPlayer);
        if (!action) break;

        const after = dispatch(latest, action);
        const logOnly =
          after !== latest &&
          after.troops === latest.troops &&
          after.players === latest.players &&
          after.combat === latest.combat &&
          after.matchPhase === latest.matchPhase &&
          after.arenas === latest.arenas &&
          after.selectedArenaIds === latest.selectedArenaIds &&
          after.arenaSetupPicks === latest.arenaSetupPicks &&
          after.pendingSpell === latest.pendingSpell;
        if ((after === latest || logOnly) && action.type !== "END_TURN") break;

        this.applyCpuActionResult(after);
        this.cpuLoopGeneration++;

        if (action.type === "END_TURN") break;
      }
    } finally {
      this.cpuRunning = false;
      if (this.cpuLoopGeneration !== loopGen) {
        void this.runCpuLoop();
      }
    }
  }

  /** Sempre usa o estado atual — evita sobrescrever ações com estado antigo. */
  private dispatchAction(action: GameAction): void {
    this.update(dispatch(this.getState(), action));
  }

  private tryCastSelectedSpell(targetTroopId: string): void {
    const s = this.getState();
    const spellId = this.selection.spellInstanceId;
    if (!spellId) return;
    const spellInst = s.troops[spellId];
    if (!spellInst) return;
    this.dispatchAction({
      type: "PLAY_SPELL",
      player: spellInst.owner,
      spellInstanceId: spellId,
      targetTroopId,
    });
  }

  private handleCardDrop(payload: DragPayload, zone: DropZoneInfo): void {
    const s = this.getState();
    if (s.matchPhase !== "playing" || s.turnPhase !== "main" || s.combat) return;

    const active = s.activePlayer;

    if (payload.kind === "hand") {
      const troop = s.troops[payload.troopId];
      if (!troop || troop.owner !== active) return;
      if (zone.kind === "base" && zone.player === active) {
        this.dispatchAction({ type: "PLAY_TROOP", troopId: payload.troopId });
        return;
      }
      if (zone.kind === "essence" && zone.player === active) {
        const def = s.catalog[troop.cardId];
        if (def?.hasEssenceSymbol) {
          this.dispatchAction({ type: "SACRIFICE_ESSENCE", troopId: payload.troopId });
        }
      }
      return;
    }

    const troop = s.troops[payload.troopId];
    if (!troop || troop.owner !== active) return;

    if (zone.kind === "arena" && zone.arenaId) {
      if (troop.zone === "base") {
        this.dispatchAction({
          type: "MOVE_TROOP",
          troopId: payload.troopId,
          to: "arena",
          arenaId: zone.arenaId,
        });
        return;
      }
      if (troop.zone === "arena" && troop.arenaId !== zone.arenaId) {
        this.dispatchAction({
          type: "MOVE_TROOP",
          troopId: payload.troopId,
          to: "arena",
          arenaId: zone.arenaId,
        });
        return;
      }
    }
    if (zone.kind === "base" && zone.player === active && troop.zone === "arena") {
      this.dispatchAction({ type: "MOVE_TROOP", troopId: payload.troopId, to: "base" });
    }
  }

  private activeMulliganPlayer(): PlayerId | null {
    const s = this.getState();
    if (s.matchPhase === "mulligan_p0") return 0;
    if (s.matchPhase === "mulligan_p1") return 1;
    return null;
  }

  private render(): void {
    this.root.innerHTML = "";

    if (this.screen === "menu") {
      this.renderMainMenu();
      return;
    }

    const s = this.getState();

    if (s.matchPhase === "finished") {
      this.renderGameOver(s);
      return;
    }

    const header = document.createElement("header");
    const domGoal = dominationsToWinPhase(s.gamePhase);
    const phaseMeta =
      domGoal !== null
        ? `${domGoal} domínios para vencer a fase`
        : "Combate final — derrote o Líder inimigo";
    header.innerHTML = `
      <h1>Reino Reverso TCG</h1>
      <p class="subtitle">${phaseDisplayName(s.gamePhase)} · ${this.modeLabel(s)} · Líderes J1 ${s.players[0].leaderHp}/${this.getLeaderMaxHp(s, 0)} · J2 ${s.players[1].leaderHp}/${this.getLeaderMaxHp(s, 1)} · ${phaseMeta}</p>
    `;
    this.root.appendChild(header);

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "secondary menu-back-btn";
    menuBtn.textContent = "Menu";
    menuBtn.onclick = () => this.returnToMenu();
    header.appendChild(menuBtn);

    if (s.matchPhase === "phase_end_choice_p0") {
      this.renderPhaseEndChoice(s, 0);
      return;
    }
    if (s.matchPhase === "phase_end_choice_p1") {
      this.renderPhaseEndChoice(s, 1);
      return;
    }

    if (
      s.matchPhase.startsWith("setup_arenas") ||
      s.matchPhase.startsWith("setup_abismo") ||
      s.matchPhase === "setup_rr_winner"
    ) {
      this.renderArenaSetup(s);
      return;
    }

    const mp = this.activeMulliganPlayer();
    if (mp !== null) {
      this.renderMulligan(s, mp);
      return;
    }

    this.renderMatch(s);
  }

  private modeLabel(s: GameState): string {
    const base =
      s.cpuPlayer === null
        ? "2 jogadores local"
        : `Você = J${this.humanPlayer(s) + 1} · CPU = J${s.cpuPlayer + 1}`;
    if (s.testMode) return `${testModeLabel(s.testMode)} · ${base}`;
    return base;
  }

  private renderMainMenu(): void {
    const screen = document.createElement("div");
    screen.className = "menu-screen";

    const card = document.createElement("div");
    card.className = "menu-card panel";
    card.innerHTML = `
      <h1>Reino Reverso TCG</h1>
      <p class="menu-tagline">Protótipo v1.1 — fantasia urbana, arenas e domínio territorial</p>
    `;

    const actions = document.createElement("div");
    actions.className = "menu-actions";

    const vsCpu = document.createElement("button");
    vsCpu.type = "button";
    vsCpu.textContent = "Jogar vs CPU (você = Jogador 1)";
    vsCpu.onclick = () => this.startGame(1);
    actions.appendChild(vsCpu);

    const hotseat = document.createElement("button");
    hotseat.type = "button";
    hotseat.className = "secondary";
    hotseat.textContent = "2 jogadores no mesmo teclado";
    hotseat.onclick = () => this.startGame(null);
    actions.appendChild(hotseat);

    card.appendChild(actions);

    const testPanel = document.createElement("div");
    testPanel.className = "menu-test panel";
    testPanel.innerHTML = `
      <h2 class="menu-test__title">Modos de teste</h2>
      <p class="menu-tagline">Pula o Mundo Normal — já em jogo com recursos fixos.</p>
    `;
    const testActions = document.createElement("div");
    testActions.className = "menu-actions";

    const testAbismoCpu = document.createElement("button");
    testAbismoCpu.type = "button";
    testAbismoCpu.className = "secondary";
    testAbismoCpu.textContent = "Teste Abismo vs CPU";
    testAbismoCpu.onclick = () => this.startGame(1, "abismo");
    testActions.appendChild(testAbismoCpu);

    const testAbismoHot = document.createElement("button");
    testAbismoHot.type = "button";
    testAbismoHot.className = "secondary";
    testAbismoHot.textContent = "Teste Abismo (2 jogadores)";
    testAbismoHot.onclick = () => this.startGame(null, "abismo");
    testActions.appendChild(testAbismoHot);

    const testRrCpu = document.createElement("button");
    testRrCpu.type = "button";
    testRrCpu.className = "secondary";
    testRrCpu.textContent = "Teste Reino Reverso vs CPU";
    testRrCpu.onclick = () => this.startGame(1, "reino-reverso");
    testActions.appendChild(testRrCpu);

    const testRrHot = document.createElement("button");
    testRrHot.type = "button";
    testRrHot.className = "secondary";
    testRrHot.textContent = "Teste Reino Reverso (2 jogadores)";
    testRrHot.onclick = () => this.startGame(null, "reino-reverso");
    testActions.appendChild(testRrHot);

    testPanel.appendChild(testActions);
    screen.append(card, testPanel);
    this.root.appendChild(screen);
  }

  private renderGameOver(s: GameState): void {
    const screen = document.createElement("div");
    screen.className = "gameover-screen";

    const card = document.createElement("div");
    card.className = "gameover-card panel";

    const headline = this.winnerHeadline(s);
    const arenaList =
      s.arenas.length > 0
        ? s.arenas.map((a) => a.name).join(", ")
        : "—";

    card.innerHTML = `
      <p class="gameover-eyebrow">Fim de partida</p>
      <h2 class="gameover-title">${headline}</h2>
      <p class="gameover-reason">${s.winReason ?? "Partida encerrada"}</p>
    `;

    const stats = document.createElement("dl");
    stats.className = "gameover-stats";
    const rows: [string, string][] = [
      ["Fase final", phaseDisplayName(s.gamePhase)],
      ["Turnos jogados", String(s.turnNumber)],
      ["Líder J1", `${s.players[0].leaderHp} / ${LEADER_MAX_HP} HP`],
      ["Líder J2", `${s.players[1].leaderHp} / ${LEADER_MAX_HP} HP`],
      ["Domínios J1 / J2", `${s.players[0].dominatedArenas} / ${s.players[1].dominatedArenas}`],
      ["Arenas", arenaList],
    ];
    for (const [dt, dd] of rows) {
      const rowDt = document.createElement("dt");
      rowDt.textContent = dt;
      const rowDd = document.createElement("dd");
      rowDd.textContent = dd;
      stats.append(rowDt, rowDd);
    }
    card.appendChild(stats);

    const logSnippet = document.createElement("div");
    logSnippet.className = "gameover-log";
    logSnippet.innerHTML = "<h3>Últimos eventos</h3>";
    const logList = document.createElement("ul");
    for (const line of s.log.slice(-6).reverse()) {
      const li = document.createElement("li");
      li.textContent = line;
      logList.appendChild(li);
    }
    logSnippet.appendChild(logList);
    card.appendChild(logSnippet);

    const btns = document.createElement("div");
    btns.className = "menu-actions";

    const again = document.createElement("button");
    again.type = "button";
    again.textContent =
      s.cpuPlayer !== null ? "Jogar de novo vs CPU" : "Nova partida (2 jogadores)";
    again.onclick = () => this.startGame(this.lastCpuPlayer, this.lastTestMode);
    btns.appendChild(again);

    const menu = document.createElement("button");
    menu.type = "button";
    menu.className = "secondary";
    menu.textContent = "Menu principal";
    menu.onclick = () => this.returnToMenu();
    btns.appendChild(menu);

    card.appendChild(btns);
    screen.appendChild(card);
    this.root.appendChild(screen);
  }

  private winnerHeadline(s: GameState): string {
    if (s.winner === null) return "Partida encerrada";
    if (s.cpuPlayer === null) return `Jogador ${s.winner + 1} venceu!`;
    const human = this.humanPlayer(s);
    return s.winner === human ? "Você venceu!" : "CPU venceu!";
  }

  private arenaSetupContext(s: GameState): {
    player: PlayerId;
    title: string;
    hint: string;
    pickedIds: string[];
    takenIds: string[];
  } | null {
    if (s.matchPhase === "setup_arenas_p0") {
      return {
        player: 0,
        title: "Jogador 1 — escolha 2 arenas",
        hint: "Selecionadas: {n}/2 · Neutra: Ruas de São Paulo (automática)",
        pickedIds: s.selectedArenaIds[0],
        takenIds: s.selectedArenaIds[1],
      };
    }
    if (s.matchPhase === "setup_arenas_p1") {
      return {
        player: 1,
        title: "Jogador 2 — escolha 2 arenas",
        hint: "Selecionadas: {n}/2",
        pickedIds: s.selectedArenaIds[1],
        takenIds: s.selectedArenaIds[0],
      };
    }
    const winner = s.phaseWinner;
    if (winner === null) return null;
    if (s.matchPhase === "setup_abismo_winner") {
      return {
        player: winner,
        title: `Jogador ${winner + 1} (vencedor) — escolha 2 arenas do Abismo`,
        hint: "Selecionadas: {n}/2",
        pickedIds: s.arenaSetupPicks,
        takenIds: [],
      };
    }
    if (s.matchPhase === "setup_abismo_loser") {
      const loser = winner === 0 ? 1 : 0;
      return {
        player: loser,
        title: `Jogador ${loser + 1} — escolha 1 arena do Abismo`,
        hint: "Clique na arena restante para confirmar",
        pickedIds: [],
        takenIds: s.arenaSetupPicks,
      };
    }
    if (s.matchPhase === "setup_rr_winner") {
      return {
        player: winner,
        title: `Jogador ${winner + 1} — escolha a arena do Reino Reverso`,
        hint: "Escolha 1 das 4 arenas (inclui a neutra padrão)",
        pickedIds: s.arenaSetupPicks,
        takenIds: [],
      };
    }
    return null;
  }

  private countArenaTroops(s: GameState, player: PlayerId): number {
    return Object.values(s.troops).filter(
      (t) => t.owner === player && t.zone === "arena" && t.currentHealth > 0,
    ).length;
  }

  private renderPhaseEndChoice(s: GameState, player: PlayerId): void {
    const winner = s.phaseWinner;
    const troopCount = this.countArenaTroops(s, player);

    const panel = document.createElement("div");
    panel.className = "panel phase-choice-panel";
    const winnerLine =
      winner !== null
        ? `<p class="mulligan-hint">Jogador ${winner + 1} venceu o ${phaseDisplayName(s.gamePhase)}. Cada um escolhe só para <strong>suas</strong> tropas.</p>`
        : "";
    panel.innerHTML = `
      <h2>Jogador ${player + 1} — escolha pós-fase</h2>
      ${winnerLine}
      <p class="mulligan-hint">Suas tropas nas arenas: <strong>${troopCount}</strong></p>
    `;

    const choices: {
      id: "essence" | "corruption" | "recycle";
      label: string;
      desc: string;
    }[] = [
      {
        id: "essence",
        label: "Essência",
        desc: "Suas tropas nas arenas viram cartas no seu Espaço de Essência.",
      },
      {
        id: "corruption",
        label: "Corrupção",
        desc: "Destrói suas tropas nas arenas; +1 Corrupção cada (máx. +3).",
      },
      {
        id: "recycle",
        label: "Reciclar",
        desc: "Suas tropas nas arenas voltam ao seu baralho e embaralham.",
      },
    ];

    const grid = document.createElement("div");
    grid.className = "setup-grid";
    for (const c of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "setup-card";
      btn.innerHTML = `<span class="setup-card__name">${c.label}</span><span class="setup-card__fx">${c.desc}</span>`;
      btn.disabled = !this.canControlPlayer(s, player);
      btn.onclick = () => {
        if (!this.canControlPlayer(s, player)) return;
        this.dispatchAction({ type: "POST_PHASE_CHOICE", player, choice: c.id });
      };
      grid.appendChild(btn);
    }
    panel.appendChild(grid);
    this.root.appendChild(panel);
  }

  private renderArenaSetup(s: GameState): void {
    const ctx = this.arenaSetupContext(s);
    if (!ctx) return;

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `<h2>${ctx.title}</h2>`;
    const grid = document.createElement("div");
    grid.className = "setup-grid";

    const hideNeutral =
      s.matchPhase.startsWith("setup_arenas") || s.matchPhase.startsWith("setup_abismo");

    for (const arena of s.arenaPool) {
      if (arena.phase !== s.gamePhase) continue;
      if (arena.neutral && hideNeutral) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "setup-card";
      const picked = ctx.pickedIds.includes(arena.id);
      const taken = ctx.takenIds.includes(arena.id);
      if (picked) btn.classList.add("picked");
      if (taken) btn.classList.add("taken");
      const effectHint = describeArenaEffect(arena.effect);
      btn.innerHTML = `<span class="setup-card__name">${arena.name}</span><span class="setup-card__fx">${effectHint}</span>`;
      btn.disabled = taken || !this.canControlPlayer(s, ctx.player);
      btn.onclick = () => {
        if (!this.canControlPlayer(s, ctx.player)) return;
        this.dispatchAction({ type: "SELECT_ARENA", player: ctx.player, arenaId: arena.id });
      };
      grid.appendChild(btn);
    }

    panel.appendChild(grid);
    const hint = document.createElement("p");
    hint.className = "mulligan-hint";
    hint.textContent = ctx.hint.replace("{n}", String(ctx.pickedIds.length));
    panel.appendChild(hint);
    this.root.appendChild(panel);
  }

  private renderMulligan(s: GameState, player: PlayerId): void {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `<h2>Jogador ${player + 1} — Mulligan</h2>
      <p class="mulligan-hint">Clique nas cartas que deseja devolver. Você receberá a mesma quantidade do baralho.</p>`;

    const hand = document.createElement("div");
    hand.className = "hand-cards";

    s.players[player].hand.forEach((troopId, index) => {
      const troop = s.troops[troopId];
      if (!troop) return;
      const def = s.catalog[troop.cardId];
      if (!def) return;
      const card = cardFromDef(def, {
        mulliganPick: this.selection.mulliganIndices.has(index),
        onClick: () => {
          const set = this.selection.mulliganIndices;
          if (set.has(index)) set.delete(index);
          else set.add(index);
          this.render();
        },
      });
      hand.appendChild(card);
    });

    panel.appendChild(hand);

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.style.marginTop = "0.75rem";

    const confirm = document.createElement("button");
    confirm.textContent = `Confirmar mulligan (${this.selection.mulliganIndices.size})`;
    const canMulligan = this.canControlPlayer(s, player);
    confirm.disabled = this.selection.mulliganIndices.size === 0 || !canMulligan;
    confirm.onclick = () => {
      if (!canMulligan) return;
      const indices = [...this.selection.mulliganIndices];
      this.selection.mulliganIndices = new Set();
      this.dispatchAction({ type: "MULLIGAN", player, handIndices: indices });
    };

    const skip = document.createElement("button");
    skip.className = "secondary";
    skip.textContent = "Manter mão";
    skip.disabled = !canMulligan;
    skip.onclick = () => {
      if (!canMulligan) return;
      this.selection.mulliganIndices = new Set();
      this.dispatchAction({ type: "SKIP_MULLIGAN", player });
    };

    actions.append(confirm, skip);
    panel.appendChild(actions);
    this.root.appendChild(panel);
  }

  private renderMatch(s: GameState): void {
    const layout = document.createElement("div");
    layout.className = "layout";

    const board = document.createElement("div");
    board.className = "board";

    board.appendChild(this.renderPhaseBanner(s));
    board.appendChild(this.renderPlayerZone(s, 1, "top"));
    board.appendChild(this.renderArenas(s));
    board.appendChild(this.renderPlayerZone(s, 0, "bottom"));

    layout.appendChild(board);
    layout.appendChild(this.renderSidebar(s));
    this.root.appendChild(layout);
  }

  private renderPhaseBanner(s: GameState): HTMLElement {
    const el = document.createElement("div");
    el.className = "phase-banner";
    if (s.matchPhase === "finished") {
      el.textContent = s.winner !== null
        ? `Fim — Jogador ${s.winner + 1} venceu (${s.winReason})`
        : "Partida encerrada";
      return el;
    }
    const phaseLabel: Record<string, string> = {
      preparation: "Preparação",
      draw: "Compra",
      start: "Início",
      main: "Jogo",
      combat: "Combate",
    };
    let phase: string;
    if (s.combat) {
      const arenaName = s.arenas.find((a) => a.id === s.combat!.arenaId)?.name ?? "?";
      if (s.combat.subPhase === "magic") {
        phase = `Combate em ${arenaName} · fase de magias ${s.combat.magicWindow} (antes do golpe ${s.combat.strike}) — lance magias ou passe`;
      } else {
        const assignP = getCombatAssigningPlayer(s.combat);
        const role =
          assignP === s.combat.declaredBy ? "atacante" : "defensor";
        phase = `Combate em ${arenaName} · golpe ${s.combat.strike} · J${assignP + 1} (${role}) — um ataque por vez`;
      }
    } else {
      phase = `${phaseDisplayName(s.gamePhase)} · Turno ${s.turnNumber} · Jogador ${s.activePlayer + 1} · ${phaseLabel[s.turnPhase] ?? s.turnPhase}`;
    }
    el.textContent = phase;
    return el;
  }

  /** J2: mão em cima da base. J1: base em cima da mão (você embaixo). */
  private renderPlayerZone(
    s: GameState,
    player: PlayerId,
    position: "top" | "bottom",
  ): HTMLElement {
    const zone = document.createElement("div");
    zone.className = `player-zone player-zone--${position}`;
    if (s.activePlayer === player && s.matchPhase === "playing") {
      zone.classList.add("active-turn");
    }
    if (position === "top") {
      zone.append(this.renderHand(s, player), this.renderPlayerRow(s, player));
    } else {
      zone.append(this.renderPlayerRow(s, player), this.renderHand(s, player));
    }
    return zone;
  }

  private renderPlayerRow(s: GameState, player: PlayerId): HTMLElement {
    const row = document.createElement("div");
    row.className = "player-row";

    const leader = document.createElement("div");
    leader.className = `leader-panel active-p${player}`;
    const p = s.players[player];
    const leaderDef = p.leaderId ? s.catalog[p.leaderId] : null;
    const leaderName = leaderDef?.name ?? "Líder";
    const domGoalNum = dominationsToWinPhase(s.gamePhase);
    const domLabel = domGoalNum !== null ? `${p.dominatedArenas}/${domGoalNum}` : `${p.dominatedArenas}`;
    const leaderAbilityHint = leaderDef?.leaderAbility
      ? `<br/><span style="font-size:0.75rem;color:var(--warn)">${leaderDef.leaderAbility}</span>`
      : "";
    leader.innerHTML = `
      <strong>Jogador ${player + 1}</strong><br/>
      ${leaderName}: ${p.leaderHp}/${leaderDef?.leaderMaxHp ?? LEADER_MAX_HP} HP<br/>
      Domínios: ${domLabel}<br/>
      Corrupção: ${p.corruption}/${maxCorruptionForPhase(s.gamePhase)}<br/>
      <span class="essence-badge">Essência: ${getAvailableEssence(s, player).length}/${getPlayerEssence(s, player).length} pronta(s)</span><br/>
      Deck: ${p.deck.length} · Descarte: ${p.discard.length} · Exílio: ${p.exile.length}
      ${this.discardSummaryHtml(s, player)}
      ${leaderAbilityHint}
    `;

    const base = document.createElement("div");
    base.className = "base-panel";
    const baseTroops = this.troopsInBase(s, player);
    base.innerHTML = `<strong>Base — Jogador ${player + 1} (${baseTroops.length}/3)</strong>`;
    const slots = document.createElement("div");
    slots.className = "troop-slots";
    if (baseTroops.length === 0) {
      const empty = document.createElement("div");
      empty.className = "zone-empty";
      empty.textContent = "— vazia —";
      slots.appendChild(empty);
    } else {
      for (const t of baseTroops) slots.appendChild(this.troopChip(s, t));
    }
    base.appendChild(slots);
    const canDrop =
      s.matchPhase === "playing" &&
      s.turnPhase === "main" &&
      !s.combat &&
      s.activePlayer === player;
    if (canDrop) {
      slots.classList.add("drop-zone");
      bindDropZone(slots, { kind: "base", player }, (p, z) => this.handleCardDrop(p, z));
    }

    const essencePanel = document.createElement("div");
    essencePanel.className = "essence-zone-panel";
    const essReady = getAvailableEssence(s, player).length;
    const essTotal = getPlayerEssence(s, player).length;
    const essHint =
      essTotal > essReady
        ? `<br/><span class="zone-hint">${essReady}/${essTotal} prontas — exausta desvira no seu próximo turno</span>`
        : `<br/><span class="zone-hint">Arraste cartas ✦ aqui para converter</span>`;
    essencePanel.innerHTML = `<strong>Espaço de Essência</strong>${essHint}`;
    const essSlots = document.createElement("div");
    essSlots.className = "troop-slots";
    const essCards = getPlayerEssence(s, player);
    if (essCards.length === 0) {
      const empty = document.createElement("div");
      empty.className = "zone-empty";
      empty.textContent = "— nenhuma —";
      essSlots.appendChild(empty);
    } else {
      for (const e of essCards) {
        essSlots.appendChild(createEssenceTokenEl(e.exhausted));
      }
    }
    essencePanel.appendChild(essSlots);
    if (canDrop) {
      essencePanel.classList.add("drop-zone");
      bindDropZone(essencePanel, { kind: "essence", player }, (p, z) =>
        this.handleCardDrop(p, z),
      );
    }

    const zones = document.createElement("div");
    zones.className = "zones-column";
    zones.append(base, essencePanel);

    const spacer = document.createElement("div");
    row.append(leader, zones, spacer);
    return row;
  }

  private renderArenas(s: GameState): HTMLElement {
    const row = document.createElement("div");
    row.className = "arenas-row";

    for (const arena of s.arenas) {
      const el = document.createElement("div");
      el.className = "arena";
      if (arena.dominatedBy === 0) el.classList.add("dom-p0");
      if (arena.dominatedBy === 1) el.classList.add("dom-p1");
      if (this.selection.arenaId === arena.id) el.classList.add("selected");

      const cap = arena.conquestPointsToDominate;
      const dom =
        arena.dominatedBy !== null
          ? `Dominada — J${arena.dominatedBy + 1}`
          : `Conquista — J1: ${arena.conquestPoints[0]}/${cap} · J2: ${arena.conquestPoints[1]}/${cap}`;
      const effectHtml =
        arena.effect !== "none"
          ? `<div class="arena-effect">${describeArenaEffect(arena.effect)}</div>`
          : "";

      el.innerHTML = `
        <div class="arena-name">${arena.name}${arena.neutral ? " (N)" : ""}</div>
        <div class="arena-meta">${dom}</div>
        ${effectHtml}
      `;

      const field = document.createElement("div");
      field.className = "arena-field";

      for (const player of [1, 0] as PlayerId[]) {
        const rowWrap = document.createElement("div");
        rowWrap.className = `arena-player-row arena-player-row--p${player}`;

        const rowLabel = document.createElement("div");
        rowLabel.className = "arena-row-label";
        rowLabel.textContent = `J${player + 1}`;
        rowWrap.appendChild(rowLabel);

        const troopRow = document.createElement("div");
        troopRow.className = `arena-row arena-row--p${player}`;
        const troops = this.troopsInArena(s, player, arena.id);
        if (troops.length === 0) {
          troopRow.classList.add("arena-row--empty");
          const empty = document.createElement("span");
          empty.className = "arena-row-empty";
          empty.textContent = "vazio";
          troopRow.appendChild(empty);
        } else {
          for (const t of troops) troopRow.appendChild(this.troopChip(s, t));
        }
        rowWrap.appendChild(troopRow);
        field.appendChild(rowWrap);
      }

      el.appendChild(field);

      const canDrop =
        s.matchPhase === "playing" &&
        s.turnPhase === "main" &&
        !s.combat &&
        arena.dominatedBy === null;
      if (canDrop) {
        field.classList.add("drop-zone");
        bindDropZone(
          field,
          { kind: "arena", player: s.activePlayer, arenaId: arena.id },
          (p, z) => this.handleCardDrop(p, z),
        );
      }

      el.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".arena-field")) return;
        this.onArenaClick(arena.id);
      });
      row.appendChild(el);
    }
    return row;
  }

  private onArenaClick(arenaId: string): void {
    const s = this.getState();
    if (s.matchPhase === "finished") return;
    if (s.turnPhase === "main" && !s.combat) {
      this.selection.arenaId = arenaId;
      this.render();
    }
  }

  private renderHand(s: GameState, player: PlayerId): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "hand-bar";
    const hiddenHand = this.isCpuPlayer(s, player);
    const isActive = s.activePlayer === player && s.matchPhase === "playing";
    const pl = s.players[player];
    const canInteractHand =
      !hiddenHand &&
      s.matchPhase === "playing" &&
      (s.turnPhase === "main" || s.turnPhase === "combat");

    const handCount = pl.hand.length;
    const turnTag =
      isActive && this.canControlPlayer(s, player)
        ? " ◀ SUA VEZ"
        : isActive && hiddenHand
          ? " ◀ vez da CPU"
          : isActive
            ? ` ◀ vez do J${player + 1}`
            : "";
    bar.innerHTML = `<strong>Mão — Jogador ${player + 1}${hiddenHand ? ` (${handCount} cartas ocultas)` : ""}</strong>${turnTag}`;

    if (canInteractHand && (!this.isCpuPlayer(s, player) || this.canControlPlayer(s, player))) {
      const tip = document.createElement("p");
      tip.className = "mulligan-hint";
      if (this.selection.spellInstanceId) {
        const sel = s.troops[this.selection.spellInstanceId];
        const selDef = sel ? s.catalog[sel.cardId] : undefined;
        if (selDef && isSpellCard(selDef) && !canAffordSpellCost(s, player, selDef)) {
          tip.textContent = `Recursos insuficientes para ${selDef.name} (${formatCardCost(selDef)}).`;
        } else {
          tip.textContent = "Magia selecionada — clique em uma tropa válida no campo.";
        }
      } else if (isCombatMagicPhase(s)) {
        tip.textContent =
          "Fase de magias: Padrão/Combate/Rápidas — clique na MAGIA e no alvo, ou Passe.";
      } else if (pl.sacrificedThisTurn) {
        tip.textContent = "Arraste tropas → base · MAGIA (Padrão no turno; Rápida a qualquer hora).";
      } else {
        tip.textContent =
          "Arraste tropas → base · MAGIA: clique na carta e no alvo · ✦ no poço.";
      }
      const baseFull = this.troopsInBase(s, player).length >= 3;
      const exhaustedBase = this.troopsInBase(s, player).some((t) => t.exhausted && !t.pinned);
      if (isActive && s.turnPhase === "main" && !s.combat && exhaustedBase) {
        tip.textContent +=
          " Tropas na base exaustas não podem ir à arena neste turno — use Fim de turno.";
      } else if (isActive && s.turnPhase === "main" && !s.combat && baseFull) {
        tip.textContent += " Base cheia (3) — não dá para jogar mais tropas da mão.";
      }
      bar.appendChild(tip);
    }

    const cards = document.createElement("div");
    cards.className = "hand-cards";

    s.players[player].hand.forEach((troopId) => {
      const troop = s.troops[troopId];
      if (!troop || troop.owner !== player) return;
      const def = s.catalog[troop.cardId];
      const wrap = document.createElement("div");
      wrap.className = "hand-card";

      if (!def && !hiddenHand) return;

      const isSpell = isSpellCard(def);
      const canSelectSpell =
        isSpell &&
        canInteractHand &&
        !this.isCpuPlayer(s, player) &&
        canPlaySpellNow(s, player, def!) &&
        canAffordSpellCost(s, player, def!);
      const chip = hiddenHand
        ? createHiddenCardEl(false)
        : cardFromDef(def!, {
            cost: def!.cost,
            attack: def!.attack,
            health: def!.health,
            hasEssenceSymbol: def!.hasEssenceSymbol,
            selected: this.selection.spellInstanceId === troopId,
            onClick: canSelectSpell
              ? () => {
                  const effect = def!.spellEffect;
                  if (
                    this.selection.spellInstanceId === troopId &&
                    effect &&
                    !spellRequiresTarget(effect)
                  ) {
                    this.dispatchAction({
                      type: "PLAY_SPELL",
                      player,
                      spellInstanceId: troopId,
                    });
                    this.selection.spellInstanceId = null;
                    return;
                  }
                  this.selection.spellInstanceId =
                    this.selection.spellInstanceId === troopId ? null : troopId;
                  this.selection.troopId = null;
                  this.render();
                }
              : undefined,
          });

      const canDragHand =
        canInteractHand &&
        !isSpell &&
        isActive &&
        s.turnPhase === "main" &&
        !s.combat &&
        this.canControlPlayer(s, player);

      if (canDragHand && !hiddenHand) {
        setCardDraggable(chip, { kind: "hand", troopId }, true);
        if (def!.hasEssenceSymbol && !pl.sacrificedThisTurn) {
          chip.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.dispatchAction({ type: "SACRIFICE_ESSENCE", troopId });
          });
        }
      }

      wrap.appendChild(chip);
      cards.appendChild(wrap);
    });

    bar.appendChild(cards);
    return bar;
  }

  private getLeaderMaxHp(s: GameState, player: PlayerId): number {
    const leaderId = s.players[player].leaderId;
    if (leaderId) {
      const def = s.catalog[leaderId];
      if (def?.leaderMaxHp) return def.leaderMaxHp;
    }
    return LEADER_MAX_HP;
  }

  private renderLeaderAbilityButton(s: GameState, player: PlayerId, container: HTMLElement): void {
    const pl = s.players[player];
    if (!pl.leaderId || pl.leaderAbilityUsedThisTurn) return;
    const leaderDef = s.catalog[pl.leaderId];
    if (!leaderDef?.leaderAbilityId) return;

    const abilityId = leaderDef.leaderAbilityId;
    const canUseHere =
      (abilityId === "shield" && s.combat) ||
      (abilityId === "frost-convert" && s.combat) ||
      (abilityId === "empathy-mark" && (s.combat || s.turnPhase === "main"));

    if (!canUseHere) return;

    if (this.selection.leaderAbilityTargeting) {
      const hint = document.createElement("p");
      hint.className = "mulligan-hint";
      hint.style.color = "#f0c878";
      hint.textContent = "Clique em uma tropa aliada na arena para aplicar a habilidade do Líder.";
      container.appendChild(hint);

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "secondary";
      cancelBtn.textContent = "Cancelar habilidade";
      cancelBtn.onclick = () => {
        this.selection.leaderAbilityTargeting = false;
        this.render();
      };
      container.appendChild(cancelBtn);
      return;
    }

    const labels: Record<string, string> = {
      shield: "Escudo do Líder (2 Essência)",
      "frost-convert": "Cria do Inverno (2 Essência)",
      "empathy-mark": "Marcar com Empatia (1 Essência)",
    };

    const btn = document.createElement("button");
    btn.textContent = labels[abilityId] ?? "Habilidade do Líder";
    btn.title = leaderDef.leaderAbility ?? "";
    btn.onclick = () => {
      this.selection.leaderAbilityTargeting = true;
      this.selection.spellInstanceId = null;
      this.render();
    };
    container.appendChild(btn);
  }

  private renderLeaderEvolutionButton(s: GameState, player: PlayerId, container: HTMLElement): void {
    const pl = s.players[player];
    if (!pl.leaderId) return;
    const leaderDef = s.catalog[pl.leaderId];
    if (!leaderDef?.leaderFormIds?.length) return;

    const canEvolve = pl.corruption >= LEADER_EVOLUTION_CORRUPTION_COST;
    const hasFormInHand = pl.hand.some((id) => {
      const t = s.troops[id];
      return t && leaderDef.leaderFormIds!.includes(t.cardId);
    });

    if (!hasFormInHand) return;

    for (const formId of leaderDef.leaderFormIds) {
      const formInstanceId = pl.hand.find((id) => s.troops[id]?.cardId === formId);
      if (!formInstanceId) continue;
      const formDef = s.catalog[formId];
      if (!formDef) continue;
      const btn = document.createElement("button");
      btn.className = "danger";
      btn.textContent = `Evoluir → ${formDef.name} (${LEADER_EVOLUTION_CORRUPTION_COST} Corrupção)`;
      btn.disabled = !canEvolve;
      btn.title = formDef.leaderAbility ?? "";
      btn.onclick = () => this.dispatchAction({
        type: "EVOLVE_LEADER",
        player,
        formId,
        formInstanceId,
      });
      container.appendChild(btn);
    }
  }

  private renderSidebar(s: GameState): HTMLElement {
    const side = document.createElement("div");
    side.className = "sidebar";

    const actions = document.createElement("div");
    actions.className = "panel";
    actions.innerHTML = "<h2>Ações</h2>";
    const btns = document.createElement("div");
    btns.className = "actions";

    const active = s.activePlayer;
    const human = this.humanPlayer(s);
    const canAct =
      s.matchPhase === "playing" && this.canControlPlayer(s, active);

    const pending = s.pendingSpell;
    if (pending) {
      const pendingName = s.catalog[pending.spellCardId]?.name ?? "Feitiço";
      const pendHint = document.createElement("p");
      pendHint.className = "mulligan-hint";
      pendHint.style.color = "#f0c878";
      if (pending.awaitingCounterPayment) {
        pendHint.textContent = `Contramagia vs ${pendingName}. Lançador (J${pending.caster + 1}): pagar 2 essências exauridas?`;
        actions.appendChild(pendHint);
        if (this.canControlPlayer(s, pending.caster)) {
          const payBtn = document.createElement("button");
          payBtn.textContent = "Pagar 2 essências — feitiço resolve";
          payBtn.onclick = () =>
            this.dispatchAction({
              type: "RESOLVE_COUNTER_PAYMENT",
              player: pending.caster,
              payTwoEssence: true,
            });
          btns.appendChild(payBtn);
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "secondary";
          cancelBtn.textContent = "Não pagar — feitiço anulado";
          cancelBtn.onclick = () =>
            this.dispatchAction({
              type: "RESOLVE_COUNTER_PAYMENT",
              player: pending.caster,
              payTwoEssence: false,
            });
          btns.appendChild(cancelBtn);
        }
      } else if (pending.counterWindowOpen) {
        pendHint.textContent = `${pendingName} pendente — J${opponent(pending.caster) + 1} pode Contramagia ou passar.`;
        actions.appendChild(pendHint);
        const opp = opponent(pending.caster);
        if (this.canControlPlayer(s, opp)) {
          const passBtn = document.createElement("button");
          passBtn.className = "secondary";
          passBtn.textContent = "Passar (resolver feitiço)";
          passBtn.onclick = () =>
            this.dispatchAction({ type: "PASS_SPELL_COUNTER", player: opp });
          btns.appendChild(passBtn);
        }
      }
    }

    if (this.selection.spellInstanceId && s.matchPhase === "playing") {
      const spellInst = s.troops[this.selection.spellInstanceId];
      const spellDef = spellInst ? s.catalog[spellInst.cardId] : undefined;
      if (spellInst?.owner === human && spellDef?.spellEffect) {
        const needsTarget = spellRequiresTarget(spellDef.spellEffect);
        const spellHint = document.createElement("p");
        spellHint.className = "mulligan-hint";
        spellHint.style.color = "#c4b5fd";
        spellHint.textContent = needsTarget
          ? `${spellDef.name}: ${describeSpellEffect(spellDef.spellEffect)} — clique no alvo.`
          : `${spellDef.name}: ${describeSpellEffect(spellDef.spellEffect)} — clique de novo na carta para lançar.`;
        actions.appendChild(spellHint);

        const cancelSpell = document.createElement("button");
        cancelSpell.className = "secondary";
        cancelSpell.textContent = "Cancelar magia";
        cancelSpell.onclick = () => {
          this.selection.spellInstanceId = null;
          this.render();
        };
        btns.appendChild(cancelSpell);
      }
    }

    if (
      s.cpuPlayer !== null &&
      s.matchPhase === "playing" &&
      this.humanHasFastSpellInHand(s) &&
      (cpuControlsPhase(s, s.cpuPlayer) || s.combat !== null)
    ) {
      const fastBtn = document.createElement("button");
      fastBtn.className = "secondary";
      fastBtn.textContent = "Acelerar CPU (0,5 s)";
      fastBtn.onclick = () => this.requestCpuFastDelay();
      btns.appendChild(fastBtn);
    }

    if (s.combat && isCombatMagicPhase(s)) {
      const magicHint = document.createElement("p");
      magicHint.className = "mulligan-hint";
      magicHint.style.color = "#c4b5fd";
      magicHint.textContent =
        "Fase de magias: Padrão, Combate e Rápidas. Só Combate não pode ser usada fora do combate. Ambos passam para iniciar o golpe.";
      actions.appendChild(magicHint);

      for (const p of [0, 1] as PlayerId[]) {
        if (s.combat!.magicPassed[p]) continue;
        if (!this.canControlPlayer(s, p)) continue;
        const passBtn = document.createElement("button");
        passBtn.className = p === 1 ? "secondary" : "";
        passBtn.textContent = `Jogador ${p + 1} — passar magias`;
        passBtn.onclick = () =>
          this.dispatchAction({ type: "PASS_COMBAT_MAGIC", player: p });
        btns.appendChild(passBtn);
      }

      const human = this.humanPlayer(s);
      this.renderLeaderAbilityButton(s, human, btns);
    } else if (s.combat && isCombatStrikePhase(s)) {
      const combatHint = document.createElement("p");
      combatHint.className = "mulligan-hint";
      const striker = getCombatAssigningPlayer(s.combat);
      combatHint.textContent = this.canControlPlayer(s, striker)
        ? "Golpe de combate: selecione sua tropa e clique no inimigo."
        : this.isCpuPlayer(s, striker)
          ? "Combate: vez da CPU…"
          : `Combate: vez do Jogador ${striker + 1}…`;
      actions.appendChild(combatHint);

      const humanStrike = this.humanPlayer(s);
      this.renderLeaderAbilityButton(s, humanStrike, btns);
    } else if (canAct && s.turnPhase === "main" && !s.combat) {
      const essencePanel = document.createElement("div");
      essencePanel.className = "essence-panel";
      essencePanel.innerHTML = `
        <p><strong>Espaço de Essência</strong></p>
        <p class="essence-count">${getAvailableEssence(s, active).length} pronta(s) / ${getPlayerEssence(s, active).length} total</p>
        <p class="mulligan-hint">Ao jogar tropas, Essência fica deitada (exausta) e desvira na preparação.</p>
      `;
      actions.appendChild(essencePanel);

      const selectedTroop = this.selection.troopId ? s.troops[this.selection.troopId] : null;
      if (
        selectedTroop &&
        selectedTroop.owner === active &&
        selectedTroop.zone === "arena" &&
        !selectedTroop.exhausted &&
        !selectedTroop.pinned &&
        !selectedTroop.movementLocked
      ) {
        const retreatBtn = document.createElement("button");
        const troopName = s.catalog[selectedTroop.cardId]?.name ?? "Tropa";
        retreatBtn.textContent = `Recuar ${troopName} para a base`;
        retreatBtn.onclick = () => {
          this.dispatchAction({
            type: "MOVE_TROOP",
            troopId: selectedTroop.instanceId,
            to: "base",
          });
          this.selection.troopId = null;
        };
        btns.appendChild(retreatBtn);
      }

      const combatBtn = document.createElement("button");
      combatBtn.textContent = "Declarar combate na arena selecionada";
      combatBtn.disabled = !this.selection.arenaId;
      combatBtn.onclick = () => {
        const arenaId = this.selection.arenaId;
        if (arenaId) {
          this.dispatchAction({ type: "DECLARE_COMBAT", arenaId });
        }
      };
      btns.appendChild(combatBtn);

      const contested = getContestedArenaNames(s, active);
      const rrUnanswered =
        s.gamePhase === "reino-reverso" ? getRRUnansweredArenaNames(s, active) : [];
      const endBtn = document.createElement("button");
      endBtn.className = "secondary";
      endBtn.textContent = "Fim de turno";
      endBtn.onclick = () => this.dispatchAction({ type: "END_TURN" });
      btns.appendChild(endBtn);

      this.renderLeaderEvolutionButton(s, active, btns);
      this.renderLeaderAbilityButton(s, active, btns);

      if (contested.length > 0) {
        const warn = document.createElement("p");
        warn.className = "mulligan-hint";
        warn.style.color = "#e85d5d";
        warn.textContent = `Combate obrigatório em: ${contested.join(", ")}`;
        actions.appendChild(warn);
      } else if (rrUnanswered.length > 0) {
        const warn = document.createElement("p");
        warn.className = "mulligan-hint";
        warn.style.color = "#e85d5d";
        warn.textContent = `Responda em ${rrUnanswered.join(", ")} ou seu Líder leva 1 de dano ao encerrar o turno.`;
        actions.appendChild(warn);
      }
    }

    const hint = document.createElement("p");
    hint.className = "mulligan-hint";
    hint.textContent = s.combat
      ? "Um ataque por vez; troca de dano no mesmo instante com o alvo."
      : s.gamePhase === "reino-reverso"
        ? "RR: tropas inimigas na arena sem resposta = 1 de dano no Líder ao fim do turno; ambos presentes = declare combate."
        : "Arraste cartas/tropas · arena contestada = declare combate antes do fim de turno.";
    actions.append(btns, hint);
    side.appendChild(actions);

    const logPanel = document.createElement("div");
    logPanel.className = "panel";
    logPanel.innerHTML = "<h2>Registro</h2>";
    const log = document.createElement("div");
    log.className = "log";
    for (const line of [...s.log].reverse()) {
      const p = document.createElement("p");
      p.textContent = line;
      if (/conquista|dominou|\+1 ponto/i.test(line)) {
        p.classList.add("log-entry--conquest");
      } else if (/combate|atacou|golpe/i.test(line)) {
        p.classList.add("log-entry--combat");
      } else if (/descarte/i.test(line)) {
        p.classList.add("log-entry--discard");
      }
      log.appendChild(p);
    }
    logPanel.appendChild(log);
    side.appendChild(logPanel);

    return side;
  }

  private discardSummaryHtml(s: GameState, player: PlayerId): string {
    const pile = s.players[player].discard;
    if (pile.length === 0) return "";
    const recent = pile.slice(-3).map((id) => s.catalog[id]?.name ?? id);
    const tail = pile.length > 3 ? "…" : "";
    return `<span class="discard-hint">Últimas: ${recent.join(", ")}${tail}</span>`;
  }

  private troopsInBase(s: GameState, player: PlayerId): TroopInstance[] {
    return Object.values(s.troops).filter(
      (t) => t.owner === player && t.zone === "base" && t.currentHealth > 0,
    );
  }

  private troopsInArena(s: GameState, player: PlayerId, arenaId: string): TroopInstance[] {
    return Object.values(s.troops).filter(
      (t) =>
        t.owner === player &&
        t.zone === "arena" &&
        t.arenaId === arenaId &&
        t.currentHealth > 0,
    );
  }

  private troopChip(s: GameState, troop: TroopInstance): HTMLElement {
    const def = s.catalog[troop.cardId];
    const combat = s.combat;
    const inCombatArena =
      combat !== null &&
      troop.zone === "arena" &&
      troop.arenaId === combat.arenaId &&
      troop.currentHealth > 0;

    let onClick: ((e: MouseEvent) => void) | undefined;
    let selected = this.selection.troopId === troop.instanceId;
    let subLabel: string | undefined;

    if (inCombatArena && combat && isCombatStrikePhase(s)) {
      const assigningPlayer = getCombatAssigningPlayer(combat);
      const alreadyAttacked = hasAttackedThisStrike(combat, troop.instanceId);
      const randomTargets = arenaUsesRandomCombatTargets(s, combat.arenaId);

      if (troop.owner === assigningPlayer) {
        if (alreadyAttacked) subLabel = "já atacou";
        else if (randomTargets) subLabel = "clique para atacar (alvo aleatório)";
        else if (this.selection.troopId === troop.instanceId) subLabel = "escolha alvo";
        if (!alreadyAttacked && this.canControlPlayer(s, assigningPlayer)) {
          onClick = (e) => {
            e.stopPropagation();
            if (randomTargets) {
              const enemies = this.troopsInArena(s, opponent(assigningPlayer), combat.arenaId);
              if (enemies.length === 0) return;
              this.selection.troopId = null;
              this.dispatchAction({
                type: "EXECUTE_COMBAT_ATTACK",
                attackerId: troop.instanceId,
                targetId: enemies[0]!.instanceId,
              });
              return;
            }
            this.selection.troopId =
              this.selection.troopId === troop.instanceId ? null : troop.instanceId;
            this.render();
          };
        }
      } else if (!randomTargets && this.canControlPlayer(s, assigningPlayer)) {
        const attackerId = this.selection.troopId;
        const attacker = attackerId ? s.troops[attackerId] : null;
        const legalTarget = isLegalCombatTarget(s, assigningPlayer, combat.arenaId, troop);
        if (
          attacker?.owner === assigningPlayer &&
          attacker.zone === "arena" &&
          !hasAttackedThisStrike(combat, attacker.instanceId) &&
          legalTarget
        ) {
          onClick = (e) => {
            e.stopPropagation();
            this.dispatchAction({
              type: "EXECUTE_COMBAT_ATTACK",
              attackerId: attacker.instanceId,
              targetId: troop.instanceId,
            });
          };
          subLabel = subLabel ? `${subLabel} · alvo` : "clique — alvo do ataque";
        } else if (
          attacker?.owner === assigningPlayer &&
          !legalTarget &&
          troop.owner !== assigningPlayer
        ) {
          subLabel = "bloqueado — ataque Protetores primeiro";
        }
      }
    } else {
      if (
        this.selection.leaderAbilityTargeting &&
        troop.zone === "arena" &&
        troop.owner === this.humanPlayer(s) &&
        troop.currentHealth > 0
      ) {
        const human = this.humanPlayer(s);
        onClick = (e) => {
          e.stopPropagation();
          this.selection.leaderAbilityTargeting = false;
          this.dispatchAction({
            type: "USE_LEADER_ABILITY",
            player: human,
            targetTroopId: troop.instanceId,
          });
        };
        subLabel = subLabel ? `${subLabel} · alvo habilidade` : "clique — alvo da habilidade";
        selected = true;
      } else if (this.canDragTroopsOnField(s, troop) && troop.zone === "arena") {
        onClick = (e) => {
          e.stopPropagation();
          this.selection.troopId =
            this.selection.troopId === troop.instanceId ? null : troop.instanceId;
          this.render();
        };
        if (this.selection.troopId === troop.instanceId) {
          subLabel = subLabel ? `${subLabel} · selecionada` : "selecionada — use botão Recuar";
        }
      }
    }

    if (troop.attachedSpell && !subLabel) {
      subLabel = spellEffectLabel(troop.attachedSpell);
    }
    if (!subLabel && def) {
      const kw = formatKeywordsLine(def);
      if (kw) subLabel = kw;
    }
    if (troop.movementLocked) {
      subLabel = subLabel ? `${subLabel} · vinculada` : "vinculada — não move";
    }

    const spellTargeting =
      this.selection.spellInstanceId &&
      s.matchPhase === "playing" &&
      (s.turnPhase === "main" || s.turnPhase === "combat") &&
      (troop.zone === "base" || troop.zone === "arena") &&
      troop.currentHealth > 0;

    if (spellTargeting) {
      const spellInst = s.troops[this.selection.spellInstanceId!];
      const spellDef = spellInst ? s.catalog[spellInst.cardId] : undefined;
      const caster = spellInst?.owner ?? s.activePlayer;
      if (
        spellDef &&
        canPlaySpellNow(s, caster, spellDef) &&
        canTargetSpell(s, caster, spellDef, troop)
      ) {
        const spellClick = (e: MouseEvent) => {
          e.stopPropagation();
          this.tryCastSelectedSpell(troop.instanceId);
        };
        onClick = spellClick;
        subLabel = subLabel ? `${subLabel} · alvo` : "clique — alvo da magia";
      }
    }

    const boardOpts = {
      attack: troop.attack,
      health: troop.currentHealth,
      exhausted: troop.exhausted,
      pinned: troop.pinned,
      selected:
        selected ||
        Boolean(
          spellTargeting &&
            this.selection.spellInstanceId &&
            (() => {
              const si = s.troops[this.selection.spellInstanceId!];
              const sd = si ? s.catalog[si.cardId] : undefined;
              return (
                !!si &&
                !!sd &&
                canPlaySpellNow(s, si.owner, sd) &&
                canTargetSpell(s, si.owner, sd, troop)
              );
            })(),
        ),
      subLabel,
      onClick,
    };

    let chip: HTMLElement;
    if (def) {
      const mini = cardFromDef(def, { ...boardOpts, miniature: true });
      const wrap = document.createElement("div");
      wrap.className = "board-card-wrap";
      wrap.appendChild(mini);
      attachCardHoverPreview(wrap, () =>
        cardFromDef(def, {
          ...boardOpts,
          exhausted: false,
          selected: false,
          onClick: undefined,
          miniature: false,
        }),
      );
      chip = wrap;
    } else {
      chip = createCardEl("?", { compact: true });
    }

    const cardEl = chip.querySelector(".game-card") ?? chip;

    if (inCombatArena && combat) {
      const alreadyAttacked = hasAttackedThisStrike(combat, troop.instanceId);
      if (!alreadyAttacked) {
        cardEl.classList.add(
          troop.owner === 0 ? "combat-highlight-p0" : "combat-highlight-p1",
        );
      } else {
        cardEl.classList.add("combat-attacked");
      }
    }

    if (!inCombatArena && this.canDragTroopsOnField(s, troop)) {
      setCardDraggable(chip, { kind: "troop", troopId: troop.instanceId }, true);
    }

    return chip;
  }
}



