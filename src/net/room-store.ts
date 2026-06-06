import type { RoomRecord } from "./room-service";
import * as memory from "./room-store-memory";

const KV_PREFIX = "rr-room:";

export async function getRoom(id: string): Promise<RoomRecord | null> {
  if (memory.isPersistentStore()) {
    try {
      const { kv } = await import("@vercel/kv");
      const fromKv = await kv.get<RoomRecord>(`${KV_PREFIX}${id.toUpperCase()}`);
      if (fromKv) return fromKv;
    } catch (err) {
      console.error("KV get failed:", err);
    }
  }
  return memory.getRoom(id);
}

export async function saveRoom(room: RoomRecord): Promise<void> {
  if (memory.isPersistentStore()) {
    try {
      const { kv } = await import("@vercel/kv");
      await kv.set(`${KV_PREFIX}${room.id}`, room);
    } catch (err) {
      console.error("KV set failed:", err);
    }
  }
  await memory.saveRoom(room);
}

export { isPersistentStore } from "./room-store-memory";
