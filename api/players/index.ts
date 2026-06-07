import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson, setCors } from "../http.js";

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

  try {
    const { listTestPlayers } = await import("../lib/rr-server.mjs");
    const result = await listTestPlayers();
    sendJson(res, 200, result);
  } catch (err) {
    console.error("player list failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao listar contas";
    sendJson(res, 500, { error: message });
  }
}
