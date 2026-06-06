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
    const { createRoom, saveRoom } = await import("../lib/rr-server.mjs");
    const body = await readJsonBody(req);
    const result = createRoom(typeof body.leaderId === "string" ? body.leaderId : undefined);
    await saveRoom(result.room);
    sendJson(res, 200, {
      roomId: result.roomId,
      token: result.token,
      seat: result.seat,
      view: result.view,
    });
  } catch (err) {
    console.error("create room failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao criar sala";
    sendJson(res, 500, { error: message });
  }
}
