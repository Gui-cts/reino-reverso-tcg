import catalogJson from "../../public/data/cards.json";
import { normalizeCatalog } from "../game/cards";
import type { CardCatalog } from "../game/types";

let cached: CardCatalog | null = null;

export function loadCatalogSync(): CardCatalog {
  if (cached) return cached;
  cached = normalizeCatalog(catalogJson as CardCatalog);
  return cached;
}
