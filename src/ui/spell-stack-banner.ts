import { opponent } from "../game/helpers";
import type { GameState } from "../game/types";

export type SpellStackBannerHandlers = {
  canRespond: (player: 0 | 1) => boolean;
  onPassCounter: (player: 0 | 1) => void;
  onPayCounter: (player: 0 | 1, pay: boolean) => void;
  humanPlayer: 0 | 1;
};

/** Banner fixo no tabuleiro enquanto há feitiço pendente. */
export function renderSpellStackBanner(
  s: GameState,
  handlers: SpellStackBannerHandlers,
): HTMLElement | null {
  const pending = s.pendingSpell;
  if (!pending) return null;

  const spellName = s.catalog[pending.spellCardId]?.name ?? "Feitiço";
  const el = document.createElement("div");
  el.className = "spell-stack-banner";
  el.setAttribute("role", "alert");

  const title = document.createElement("strong");
  title.className = "spell-stack-banner__title";
  title.textContent = `Feitiço pendente: ${spellName}`;
  el.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "spell-stack-banner__meta";
  meta.textContent = `Lançado por Jogador ${pending.caster + 1}`;
  el.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "spell-stack-banner__actions";

  if (pending.awaitingCounterPayment) {
    const hint = document.createElement("p");
    hint.className = "spell-stack-banner__hint";
    hint.textContent =
      "Contramagia! Lançador: pagar 2 essências exauridas ou o feitiço é anulado.";
    el.appendChild(hint);

    if (handlers.canRespond(pending.caster)) {
      const payBtn = document.createElement("button");
      payBtn.type = "button";
      payBtn.textContent = "Pagar 2 essências — resolve";
      payBtn.onclick = () => handlers.onPayCounter(pending.caster, true);
      actions.appendChild(payBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "secondary";
      cancelBtn.textContent = "Não pagar — anula";
      cancelBtn.onclick = () => handlers.onPayCounter(pending.caster, false);
      actions.appendChild(cancelBtn);
    }
  } else if (pending.counterWindowOpen) {
    const opp = opponent(pending.caster);
    const hint = document.createElement("p");
    hint.className = "spell-stack-banner__hint";
    hint.textContent =
      opp === handlers.humanPlayer
        ? "Responda com Contramagia (clique na carta) ou passe para resolver."
        : `Jogador ${opp + 1} pode responder com Contramagia.`;
    el.appendChild(hint);

    if (handlers.canRespond(opp)) {
      const passBtn = document.createElement("button");
      passBtn.type = "button";
      passBtn.className = "secondary";
      passBtn.textContent = "Passar — resolver feitiço";
      passBtn.onclick = () => handlers.onPassCounter(opp);
      actions.appendChild(passBtn);
    }
  }

  if (actions.childElementCount > 0) {
    el.appendChild(actions);
  }

  return el;
}
