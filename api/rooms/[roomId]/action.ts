export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const roomId = String(req.query.roomId ?? "");
  if (!roomId) return res.status(400).json({ error: "roomId obrigatório" });

  const body = req.body ?? {};
  if (!body.token || !body.action) {
    return res.status(400).json({ error: "token e action obrigatórios" });
  }

  try {
    const { applyRoomAction } = await import("../../src/net/room-service.js");
    const { getRoom, saveRoom } = await import("../../src/net/room-store.js");
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });

    const result = applyRoomAction(room, body.token, body.action);
    await saveRoom(room);
    return res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    console.error("room action failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao processar ação";
    return res.status(500).json({ error: message });
  }
}
