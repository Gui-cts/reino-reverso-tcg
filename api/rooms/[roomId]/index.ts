import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson, setCors } from "../_http.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Use GET" });
    return;
  }

  const query = (req as IncomingMessage & { query?: Record<string, string> }).query ?? {};
  const roomId = String(query.roomId ?? "");
  const token = String(query.token ?? "");
  if (!roomId || !token) {
    sendJson(res, 400, { error: "roomId e token obrigatórios" });
    return;
  }

  try {
    const { getRoomView } = await import("../../src/net/room-service.js");
    const { getRoom } = await import("../../src/net/room-store.js");
    const room = await getRoom(roomId);
    if (!room) {
      sendJson(res, 404, { error: "Sala não encontrada" });
      return;
    }

    const view = getRoomView(room, token);
    if (!view) {
      sendJson(res, 403, { error: "Token inválido" });
      return;
    }

    sendJson(res, 200, view);
  } catch (err) {
    console.error("fetch room failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao buscar sala";
    sendJson(res, 500, { error: message });
  }
}
