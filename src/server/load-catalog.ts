import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeCatalog } from "../game/cards";
import type { CardCatalog } from "../game/types";

let cached: CardCatalog | null = null;

function resolveCatalogPath(): string {
  const candidates = [
    join(process.cwd(), "public", "data", "cards.json"),
    join(process.cwd(), "..", "public", "data", "cards.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error("cards.json não encontrado no bundle da função");
}

export function loadCatalogSync(): CardCatalog {
  if (cached) return cached;
  const path = resolveCatalogPath();
  const raw = JSON.parse(readFileSync(path, "utf-8")) as CardCatalog;
  cached = normalizeCatalog(raw);
  return cached;
}
