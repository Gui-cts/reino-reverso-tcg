import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { GameAction } from "../../src/game/types";
import { applyRoomAction } from "../../src/net/room-service";
import { getRoom, saveRoom } from "../../src/net/room-store";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const roomId = String(req.query.roomId ?? "");
  if (!roomId) return res.status(400).json({ error: "roomId obrigatório" });

  const body = (req.body ?? {}) as { token?: string; action?: GameAction };
  if (!body.token || !body.action) {
    return res.status(400).json({ error: "token e action obrigatórios" });
  }

  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });

    const result = applyRoomAction(room, body.token, body.action);
    await saveRoom(room);
    return res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao processar ação" });
  }
}
