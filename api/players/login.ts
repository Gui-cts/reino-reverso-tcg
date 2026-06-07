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
    const { loginTestPlayer } = await import("../lib/rr-server.mjs");
    const body = await readJsonBody(req);
    const nickname = typeof body.nickname === "string" ? body.nickname : "";
    const result = await loginTestPlayer(nickname);
    if ("error" in result) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
  } catch (err) {
    console.error("player login failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao entrar";
    sendJson(res, 500, { error: message });
  }
}
