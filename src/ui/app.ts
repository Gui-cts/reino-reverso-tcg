import { createInitialGame, dispatch, loadCardCatalog } from "../game";
import type { GameAction, GameState, PlayerId, TroopInstance } from "../game/types";
import {
  getAvailableEssence,
  getCombatAssigningPlayer,
  getContestedArenaNames,
  getPlayerEssence,
  hasAttackedThisStrike,
} from "../game";
import { describeArenaEffect } from "../game/arenas";
import { dominationsToWinPhase, phaseDisplayName } from "../game";
import { cardFromDef, createCardEl, createEssenceTokenEl } from "./card-view";
import {
  bindDropZone,
  setCardDraggable,
  type DragPayload,
  type DropZoneInfo,
} from "./drag-drop";

type UiSelection = {
  troopId: string | null;
  arenaId: string | null;
  mulliganIndices: Set<number>;
};

export class GameApp {
  private state: GameState | null = null;
  private selection: UiSelection = {
    troopId: null,
    arenaId: null,
    mulliganIndices: new Set(),
  };
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(): Promise<void> {
    const catalog = await loadCardCatalog();
    this.state = createInitialGame(catalog);
    this.render();
  }

  private getState(): GameState {
    if (!this.state) throw new Error("Jogo não inicializado");
    return this.state;
  }

  private update(next: GameState): void {
    this.state = next;
    this.selection.troopId = null;
    this.selection.arenaId = null;
    this.render();
  }

  /** Sempre usa o estado atual — evita sobrescrever ações com estado antigo. */
  private dispatchAction(action: GameAction): void {
    this.update(dispatch(this.getState(), action));
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

    if (zone.kind === "arena" && zone.arenaId && troop.zone === "base") {
      this.dispatchAction({
        type: "MOVE_TROOP",
        troopId: payload.troopId,
        to: "arena",
        arenaId: zone.arenaId,
      });
      return;
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
    const s = this.getState();
    this.root.innerHTML = "";

    const header = document.createElement("header");
    const domGoal = dominationsToWinPhase(s.gamePhase);
    const phaseMeta =
      domGoal !== null
        ? `${domGoal} domínios para vencer a fase`
        : "Combate final — derrote o Líder inimigo";
    header.innerHTML = `
      <h1>Reino Reverso TCG</h1>
      <p class="subtitle">${phaseDisplayName(s.gamePhase)} · 2 jogadores local · Líder ${s.players[0].leaderHp}/${s.players[1].leaderHp} HP · ${phaseMeta}</p>
    `;
    this.root.appendChild(header);

    if (s.matchPhase === "phase_end_choice") {
      this.renderPhaseEndChoice(s);
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
        hint: "Clique na arena para iniciar o combate final",
        pickedIds: s.arenaSetupPicks,
        takenIds: [],
      };
    }
    return null;
  }

  private renderPhaseEndChoice(s: GameState): void {
    const winner = s.phaseWinner;
    if (winner === null) return;

    const panel = document.createElement("div");
    panel.className = "panel phase-choice-panel";
    panel.innerHTML = `
      <h2>Jogador ${winner + 1} venceu o ${phaseDisplayName(s.gamePhase)}</h2>
      <p class="mulligan-hint">Escolha o que fazer com as tropas ainda nas arenas:</p>
    `;

    const choices: {
      id: "essence" | "corruption" | "recycle";
      label: string;
      desc: string;
    }[] = [
      {
        id: "essence",
        label: "Essência",
        desc: "Destrói todas; cada uma vira 1 carta no Espaço de Essência.",
      },
      {
        id: "corruption",
        label: "Corrupção",
        desc: "Destrói todas; você ganha até +3 Corrupção.",
      },
      {
        id: "recycle",
        label: "Reciclar",
        desc: "Todas voltam ao baralho e embaralham.",
      },
    ];

    const grid = document.createElement("div");
    grid.className = "setup-grid";
    for (const c of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "setup-card";
      btn.innerHTML = `<span class="setup-card__name">${c.label}</span><span class="setup-card__fx">${c.desc}</span>`;
      btn.onclick = () => {
        this.dispatchAction({ type: "POST_PHASE_CHOICE", player: winner, choice: c.id });
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

    for (const arena of s.arenaPool) {
      if (arena.neutral || arena.phase !== s.gamePhase) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "setup-card";
      const picked = ctx.pickedIds.includes(arena.id);
      const taken = ctx.takenIds.includes(arena.id);
      if (picked) btn.classList.add("picked");
      if (taken) btn.classList.add("taken");
      const effectHint = describeArenaEffect(arena.effect);
      btn.innerHTML = `<span class="setup-card__name">${arena.name}</span><span class="setup-card__fx">${effectHint}</span>`;
      btn.disabled = taken;
      btn.onclick = () => {
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
    confirm.disabled = this.selection.mulliganIndices.size === 0;
    confirm.onclick = () => {
      const indices = [...this.selection.mulliganIndices];
      this.selection.mulliganIndices = new Set();
      this.dispatchAction({ type: "MULLIGAN", player, handIndices: indices });
    };

    const skip = document.createElement("button");
    skip.className = "secondary";
    skip.textContent = "Manter mão";
    skip.onclick = () => {
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
      const assignP = getCombatAssigningPlayer(s.combat);
      const role =
        assignP === s.combat.declaredBy ? "atacante" : "defensor";
      phase = `Combate em ${arenaName} · golpe ${s.combat.strike} · J${assignP + 1} (${role}) — um ataque por vez`;
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
    leader.innerHTML = `
      <strong>Jogador ${player + 1}</strong><br/>
      Líder: ${p.leaderHp} HP<br/>
      Domínios: ${p.dominatedArenas}/3<br/>
      Corrupção: ${p.corruption}/3<br/>
      <span class="essence-badge">Essência: ${getAvailableEssence(s, player).length}/${getPlayerEssence(s, player).length} pronta(s)</span><br/>
      Deck: ${p.deck.length} · Descarte: ${p.discard.length}
      ${this.discardSummaryHtml(s, player)}
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
    essencePanel.innerHTML = `<strong>Espaço de Essência</strong><br/><span class="zone-hint">Arraste cartas ✦ aqui</span>`;
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
        const troopRow = document.createElement("div");
        troopRow.className = `arena-row arena-row--p${player}`;
        const troops = this.troopsInArena(s, player, arena.id);
        if (troops.length === 0) {
          troopRow.classList.add("arena-row--empty");
          const empty = document.createElement("span");
          empty.className = "arena-row-empty";
          empty.textContent = "—";
          troopRow.appendChild(empty);
        } else {
          for (const t of troops) troopRow.appendChild(this.troopChip(s, t));
        }
        field.appendChild(troopRow);
      }

      el.appendChild(field);

      const canDrop =
        s.matchPhase === "playing" &&
        s.turnPhase === "main" &&
        !s.combat &&
        s.activePlayer !== null;
      if (canDrop && arena.dominatedBy === null) {
        el.classList.add("drop-zone");
        bindDropZone(el, { kind: "arena", player: s.activePlayer, arenaId: arena.id }, (p, z) =>
          this.handleCardDrop(p, z),
        );
      }

      el.onclick = () => this.onArenaClick(arena.id);
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
    const isActive = s.activePlayer === player && s.matchPhase === "playing";
    const pl = s.players[player];
    const canDragHand = isActive && !s.combat && s.turnPhase === "main";

    bar.innerHTML = `<strong>Mão — Jogador ${player + 1}</strong>${isActive ? " ◀ SUA VEZ" : ""}`;

    if (isActive && !s.combat) {
      const tip = document.createElement("p");
      tip.className = "mulligan-hint";
      tip.textContent = pl.sacrificedThisTurn
        ? "Arraste para a base para jogar. Essência já usada neste turno."
        : "Arraste → base (jogar) · poço ✦ (Essência) · botão direito ✦ na carta.";
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

      if (!def) return;
      const chip = cardFromDef(def, {
        cost: def.cost,
        attack: def.attack,
        health: def.health,
        hasEssenceSymbol: def.hasEssenceSymbol,
      });

      if (canDragHand) {
        setCardDraggable(chip, { kind: "hand", troopId }, true);
        if (def.hasEssenceSymbol && !pl.sacrificedThisTurn) {
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

  private renderSidebar(s: GameState): HTMLElement {
    const side = document.createElement("div");
    side.className = "sidebar";

    const actions = document.createElement("div");
    actions.className = "panel";
    actions.innerHTML = "<h2>Ações</h2>";
    const btns = document.createElement("div");
    btns.className = "actions";

    const canAct = s.matchPhase === "playing";

    if (s.combat) {
      const combatHint = document.createElement("p");
      combatHint.className = "mulligan-hint";
      combatHint.textContent =
        "Combate: selecione sua tropa e clique no inimigo. Quando todas atacarem, passa a vez automaticamente.";
      actions.appendChild(combatHint);
    } else if (canAct && s.turnPhase === "main") {
      const essencePanel = document.createElement("div");
      essencePanel.className = "essence-panel";
      essencePanel.innerHTML = `
        <p><strong>Espaço de Essência</strong></p>
        <p class="essence-count">${getAvailableEssence(s, s.activePlayer).length} pronta(s) / ${getPlayerEssence(s, s.activePlayer).length} total</p>
        <p class="mulligan-hint">Ao jogar tropas, Essência fica deitada (exausta) e desvira na preparação.</p>
      `;
      actions.appendChild(essencePanel);

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

      const contested = getContestedArenaNames(s, s.activePlayer);
      const endBtn = document.createElement("button");
      endBtn.className = "secondary";
      endBtn.textContent = "Fim de turno";
      endBtn.onclick = () => this.dispatchAction({ type: "END_TURN" });
      btns.appendChild(endBtn);

      if (contested.length > 0) {
        const warn = document.createElement("p");
        warn.className = "mulligan-hint";
        warn.style.color = "#e85d5d";
        warn.textContent = `Combate obrigatório em: ${contested.join(", ")}`;
        actions.appendChild(warn);
      }
    }

    const hint = document.createElement("p");
    hint.className = "mulligan-hint";
    hint.textContent = s.combat
      ? "Um ataque por vez; alvo morto não revida."
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

    if (inCombatArena && combat) {
      const assigningPlayer = getCombatAssigningPlayer(combat);
      const alreadyAttacked = hasAttackedThisStrike(combat, troop.instanceId);

      if (troop.owner === assigningPlayer) {
        if (alreadyAttacked) subLabel = "já atacou";
        else if (this.selection.troopId === troop.instanceId) subLabel = "escolha alvo";
        if (!alreadyAttacked) {
          onClick = (e) => {
            e.stopPropagation();
            this.selection.troopId =
              this.selection.troopId === troop.instanceId ? null : troop.instanceId;
            this.render();
          };
        }
      } else {
        const attackerId = this.selection.troopId;
        const attacker = attackerId ? s.troops[attackerId] : null;
        if (
          attacker?.owner === assigningPlayer &&
          attacker.zone === "arena" &&
          !hasAttackedThisStrike(combat, attacker.instanceId)
        ) {
          onClick = (e) => {
            e.stopPropagation();
            this.dispatchAction({
              type: "EXECUTE_COMBAT_ATTACK",
              attackerId: attacker.instanceId,
              targetId: troop.instanceId,
            });
          };
        }
      }
    } else {
      const canDragTroop =
        s.matchPhase === "playing" &&
        s.activePlayer === troop.owner &&
        s.turnPhase === "main" &&
        !troop.pinned &&
        !troop.exhausted;

      if (canDragTroop) {
        // drag configurado após criar chip
      }
    }

    const chip = def
      ? cardFromDef(def, {
          attack: troop.attack,
          health: troop.currentHealth,
          ownerLabel: `J${troop.owner + 1}`,
          compact: true,
          exhausted: troop.exhausted,
          pinned: troop.pinned,
          selected,
          subLabel,
          onClick,
        })
      : createCardEl("?", { compact: true });

    if (inCombatArena && combat && hasAttackedThisStrike(combat, troop.instanceId)) {
      chip.classList.add("combat-attacked");
    }

    if (
      !inCombatArena &&
      s.matchPhase === "playing" &&
      s.activePlayer === troop.owner &&
      s.turnPhase === "main" &&
      !troop.pinned &&
      !troop.exhausted
    ) {
      setCardDraggable(chip, { kind: "troop", troopId: troop.instanceId }, true);
    }

    return chip;
  }
}



