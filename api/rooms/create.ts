export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { createRoom } = await import("../../src/net/room-service.js");
    const { saveRoom } = await import("../../src/net/room-store.js");
    const body = req.body ?? {};
    const result = createRoom(body.leaderId);
    await saveRoom(result.room);
    return res.status(200).json({
      roomId: result.roomId,
      token: result.token,
      seat: result.seat,
      view: result.view,
    });
  } catch (err) {
    console.error("create room failed:", err);
    const message = err instanceof Error ? err.message : "Falha ao criar sala";
    return res.status(500).json({ error: message });
  }
}
