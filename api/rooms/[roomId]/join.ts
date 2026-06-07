import type { IncomingMessage, ServerResponse } from "node:http";
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

  try {
    const { joinRoom, getRoom, saveRoom } = await import("../../lib/rr-server.mjs");
    const room = await getRoom(roomId);
    if (!room) {
      sendJson(res, 404, { error: "Sala não encontrada" });
      return;
    }

    const body = await readJsonBody(req);
    const leaderId = typeof body.leaderId === "string" ? body.leaderId : undefined;
    const joined = joinRoom(room, leaderId);
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
