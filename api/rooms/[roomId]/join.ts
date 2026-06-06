export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const roomId = String(req.query.roomId ?? "");
  if (!roomId) return res.status(400).json({ error: "roomId obrigatório" });

  try {
    const { joinRoom } = await import("../../src/net/room-service.js");
    const { getRoom, saveRoom } = await import("../../src/net/room-store.js");
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });

    const joined = joinRoom(room);
    if ("error" in joined) return res.status(409).json({ error: joined.error });

    await saveRoom(room);
    return res.status(200).json(joined);
  } catch (err) {
    console.error("join room failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao entrar na sala";
    return res.status(500).json({ error: message });
  }
}
