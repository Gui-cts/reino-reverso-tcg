import { dismissCardHoverPreview } from "./card-hover-preview";

export type DragPayload =
  | { kind: "hand"; troopId: string }
  | { kind: "troop"; troopId: string };

const MIME = "application/x-reino-reverso";
const DRAGGING_BODY_CLASS = "is-dragging-card";
const DRAG_BOUND_ATTR = "data-drag-bound";

function setGlobalDragging(active: boolean): void {
  document.body.classList.toggle(DRAGGING_BODY_CLASS, active);
}

function writeDragPayload(dt: DataTransfer, payload: DragPayload): void {
  const json = JSON.stringify(payload);
  dt.setData(MIME, json);
  // Alguns browsers só iniciam drag se houver text/plain.
  dt.setData("text/plain", json);
  dt.effectAllowed = "move";
}

export function setCardDraggable(
  el: HTMLElement,
  payload: DragPayload,
  enabled: boolean,
): void {
  if (!enabled) {
    el.draggable = false;
    el.classList.remove("game-card--draggable");
    return;
  }

  el.draggable = true;
  el.classList.add("game-card--draggable");

  if (el.hasAttribute(DRAG_BOUND_ATTR)) return;
  el.setAttribute(DRAG_BOUND_ATTR, "1");

  el.addEventListener("dragstart", (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    writeDragPayload(dt, payload);
    el.classList.add("is-dragging");
    setGlobalDragging(true);
    dismissCardHoverPreview();
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("is-dragging");
    setGlobalDragging(false);
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
  onCardDrop: (payload: DragPayload, zone: DropZoneInfo) => void,
): void {
  el.dataset.dropZone = zone.kind;
  if (zone.arenaId) el.dataset.arenaId = zone.arenaId;
  el.dataset.dropPlayer = String(zone.player);

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    el.classList.add("drop-target");
  };

  const onDragLeave = (e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (!related || !el.contains(related)) {
      el.classList.remove("drop-target");
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("drop-target");
    const raw =
      e.dataTransfer?.getData(MIME) || e.dataTransfer?.getData("text/plain");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as DragPayload;
      onCardDrop(payload, zone);
    } catch {
      /* ignore */
    }
  };

  // Captura: soltar em cima de tropas/cartas filhas ainda acerta a zona (crítico no RR com arena única cheia).
  el.addEventListener("dragover", onDragOver, true);
  el.addEventListener("dragleave", onDragLeave, true);
  el.addEventListener("drop", handleDrop, true);
}

export function readDragPayload(e: DragEvent): DragPayload | null {
  const raw = e.dataTransfer?.getData(MIME) || e.dataTransfer?.getData("text/plain");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}
