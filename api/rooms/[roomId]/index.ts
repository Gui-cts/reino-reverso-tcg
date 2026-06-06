import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRoomView } from "../../src/net/room-service.js";
import { getRoom } from "../../src/net/room-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });

  const roomId = String(req.query.roomId ?? "");
  const token = String(req.query.token ?? "");
  if (!roomId || !token) {
    return res.status(400).json({ error: "roomId e token obrigatórios" });
  }

  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });

    const view = getRoomView(room, token);
    if (!view) return res.status(403).json({ error: "Token inválido" });

    return res.status(200).json(view);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao buscar sala" });
  }
}
