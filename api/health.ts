import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../_http.js";

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  sendJson(res, 200, { ok: true, ts: Date.now() });
}
