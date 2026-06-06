import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createRoom } from "../../src/net/room-service.js";
import { saveRoom } from "../../src/net/room-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const body = (req.body ?? {}) as { leaderId?: string };
    const result = createRoom(body.leaderId);
    await saveRoom(result.room);
    return res.status(200).json({
      roomId: result.roomId,
      token: result.token,
      seat: result.seat,
      view: result.view,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao criar sala" });
  }
}
