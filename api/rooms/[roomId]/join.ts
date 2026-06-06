import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson, setCors } from "../_http.js";

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

  const roomId = String((req as IncomingMessage & { query?: Record<string, string> }).query?.roomId ?? "");
  if (!roomId) {
    sendJson(res, 400, { error: "roomId obrigatório" });
    return;
  }

  try {
    const { joinRoom } = await import("../../src/net/room-service.js");
    const { getRoom, saveRoom } = await import("../../src/net/room-store.js");
    const room = await getRoom(roomId);
    if (!room) {
      sendJson(res, 404, { error: "Sala não encontrada" });
      return;
    }

    const joined = joinRoom(room);
    if ("error" in joined) {
      sendJson(res, 409, { error: joined.error });
      return;
    }

    await saveRoom(room);
    sendJson(res, 200, joined);
  } catch (err) {
    console.error("join room failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao entrar na sala";
    sendJson(res, 500, { error: message });
  }
}
