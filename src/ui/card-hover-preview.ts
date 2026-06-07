const HOVER_DELAY_MS = 2000;

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let previewEl: HTMLElement | null = null;

function clearPreview(): void {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  previewEl?.remove();
  previewEl = null;
}

function positionPreview(anchor: HTMLElement, card: HTMLElement): void {
  const overlay = document.createElement("div");
  overlay.className = "card-preview-overlay";
  overlay.style.visibility = "hidden";
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const anchorRect = anchor.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 12;

  let left = anchorRect.left + anchorRect.width / 2 - cardRect.width / 2;
  let top = anchorRect.top - cardRect.height - margin;

  if (top < margin) {
    top = anchorRect.bottom + margin;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - cardRect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - cardRect.height - margin));

  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.visibility = "visible";
  previewEl = overlay;
}

export type CardHoverPreviewOptions = {
  /** Padrão 2000ms no tabuleiro; deckbuilder pode usar menos. */
  delayMs?: number;
};

/** Após um delay com o mouse em cima, mostra a carta em tamanho grande. */
export function attachCardHoverPreview(
  anchor: HTMLElement,
  buildFullCard: () => HTMLElement,
  options: CardHoverPreviewOptions = {},
): void {
  const delayMs = options.delayMs ?? HOVER_DELAY_MS;

  anchor.addEventListener("mouseenter", () => {
    if (document.body.classList.contains("is-dragging-card")) return;

    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      if (document.body.classList.contains("is-dragging-card")) return;

      clearPreview();
      const full = buildFullCard();
      full.classList.add("game-card--framed-preview");
      full.classList.remove("exhausted", "game-card--framed-mini");
      positionPreview(anchor, full);
    }, delayMs);
  });

  anchor.addEventListener("mouseleave", () => {
    clearPreview();
  });

  anchor.addEventListener("mousedown", () => {
    clearPreview();
  });
}

export function dismissCardHoverPreview(): void {
  clearPreview();
}
