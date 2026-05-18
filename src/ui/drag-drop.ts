export type DragPayload =
  | { kind: "hand"; troopId: string }
  | { kind: "troop"; troopId: string };

const MIME = "application/x-reino-reverso";

export function setCardDraggable(
  el: HTMLElement,
  payload: DragPayload,
  enabled: boolean,
): void {
  if (!enabled) {
    el.draggable = false;
    return;
  }
  el.draggable = true;
  el.classList.add("game-card--draggable");

  el.addEventListener("dragstart", (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData(MIME, JSON.stringify(payload));
    dt.effectAllowed = "move";
    el.classList.add("is-dragging");
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("is-dragging");
    document.querySelectorAll(".drop-target").forEach((n) => n.classList.remove("drop-target"));
  });
}

export type DropZoneKind = "base" | "arena" | "essence";

export type DropZoneInfo = {
  kind: DropZoneKind;
  player: number;
  arenaId?: string;
};

export function bindDropZone(
  el: HTMLElement,
  zone: DropZoneInfo,
  onDrop: (payload: DragPayload, zone: DropZoneInfo) => void,
): void {
  el.dataset.dropZone = zone.kind;
  if (zone.arenaId) el.dataset.arenaId = zone.arenaId;
  el.dataset.dropPlayer = String(zone.player);

  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    el.classList.add("drop-target");
  });

  el.addEventListener("dragleave", (e) => {
    if (e.currentTarget === e.target || !el.contains(e.relatedTarget as Node)) {
      el.classList.remove("drop-target");
    }
  });

  el.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("drop-target");
    const raw = e.dataTransfer?.getData(MIME);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as DragPayload;
      onDrop(payload, zone);
    } catch {
      /* ignore */
    }
  });
}

export function readDragPayload(e: DragEvent): DragPayload | null {
  const raw = e.dataTransfer?.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}
