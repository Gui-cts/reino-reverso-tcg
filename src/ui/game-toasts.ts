type ToastKind = "info" | "combat" | "dice" | "dominate" | "spell";

type ToastItem = {
  id: number;
  text: string;
  kind: ToastKind;
};

let container: HTMLElement | null = null;
let nextId = 0;

function ensureContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement("div");
  container.className = "game-toast-stack";
  container.setAttribute("aria-live", "polite");
  document.body.appendChild(container);
  return container;
}

function classifyLogLine(line: string): ToastKind {
  if (/1d6|d6/i.test(line)) return "dice";
  if (/domin|conquista|dano ao Líder/i.test(line)) return "dominate";
  if (/combate|ataca|golpe|dano/i.test(line)) return "combat";
  if (/feitiço|magia|resolve|Contramagia/i.test(line)) return "spell";
  return "info";
}

function shouldToast(line: string): boolean {
  if (line.length < 8) return false;
  return (
    /1d6|d6|dano|domin|conquista|resolve|Contramagia|combate declarado|golpe \d/i.test(
      line,
    ) || /Líder.*→\s*\d+\s*HP/i.test(line)
  );
}

function renderToast(item: ToastItem, host: HTMLElement): void {
  const el = document.createElement("div");
  el.className = `game-toast game-toast--${item.kind}`;
  el.textContent = item.text;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("game-toast--visible"));
  setTimeout(() => {
    el.classList.remove("game-toast--visible");
    setTimeout(() => el.remove(), 320);
  }, 3400);
}

/** Mostra toasts para linhas novas do log de jogo. */
export function pushGameLogToasts(previousLog: string[], nextLog: string[]): void {
  if (nextLog.length <= previousLog.length) return;
  const fresh = nextLog.slice(previousLog.length).filter(shouldToast);
  if (fresh.length === 0) return;

  const host = ensureContainer();
  for (const line of fresh.slice(-3)) {
    renderToast(
      { id: nextId++, text: line, kind: classifyLogLine(line) },
      host,
    );
  }
}

export function clearGameToasts(): void {
  container?.replaceChildren();
}
