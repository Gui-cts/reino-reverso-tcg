import type { IncomingMessage, ServerResponse } from "node:http";
import type { GameAction } from "../../../src/game/types.js";
import { getQuery, readJsonBody, sendJson, setCors } from "../../http.js";

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

  const roomId = String(getQuery(req).roomId ?? "");
  if (!roomId) {
    sendJson(res, 400, { error: "roomId obrigatório" });
    return;
  }

  const body = await readJsonBody(req);
  const token = typeof body.token === "string" ? body.token : "";
  const action = body.action as GameAction | undefined;
  if (!token || !action) {
    sendJson(res, 400, { error: "token e action obrigatórios" });
    return;
  }

  try {
    const { applyRoomAction, getRoom, saveRoom } = await import("../../lib/rr-server.mjs");
    const room = await getRoom(roomId);
    if (!room) {
      sendJson(res, 404, { error: "Sala não encontrada" });
      return;
    }

    const result = applyRoomAction(room, token, action);
    await saveRoom(room);
    sendJson(res, result.ok ? 200 : 409, result);
  } catch (err) {
    console.error("room action failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao processar ação";
    sendJson(res, 500, { error: message });
  }
}
