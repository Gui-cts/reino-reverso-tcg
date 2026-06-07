import type { IncomingMessage, ServerResponse } from "node:http";
import { getQuery, sendJson, setCors } from "../http.js";

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
    const { getPlayerSession } = await import("../lib/rr-server.mjs");
    const token = String(getQuery(req).token ?? "");
    const result = await getPlayerSession(token);
    if ("error" in result) {
      sendJson(res, 401, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
  } catch (err) {
    console.error("player session failed:", err);
    const message = err instanceof Error ? err.message : "Falha na sessão";
    sendJson(res, 500, { error: message });
  }
}
