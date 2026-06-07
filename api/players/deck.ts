import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson, setCors } from "../http.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST" });
    return;
  }

  try {
    const { savePlayerDeck } = await import("../lib/rr-server.mjs");
    const body = await readJsonBody(req);
    const token = typeof body.token === "string" ? body.token : "";
    const deck = body.deck as { leaderId?: string; cardIds?: unknown } | undefined;
    const activeSlot = body.activeSlot;

    if (!deck?.leaderId || !Array.isArray(deck.cardIds)) {
      sendJson(res, 400, { error: "Baralho malformado." });
      return;
    }

    const cardIds = deck.cardIds.filter((id): id is string => typeof id === "string");
    const result = await savePlayerDeck(
      token,
      { leaderId: deck.leaderId, cardIds },
      activeSlot,
    );
    if ("error" in result) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
  } catch (err) {
    console.error("player deck save failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao salvar baralho";
    sendJson(res, 500, { error: message });
  }
}
