import type { RoomRecord } from "./room-service";

declare global {
  // eslint-disable-next-line no-var
  var __rrRooms: Map<string, RoomRecord> | undefined;
}

const rooms = globalThis.__rrRooms ?? new Map<string, RoomRecord>();
globalThis.__rrRooms = rooms;

export async function getRoom(id: string): Promise<RoomRecord | null> {
  return rooms.get(id.toUpperCase()) ?? null;
}

export async function saveRoom(room: RoomRecord): Promise<void> {
  rooms.set(room.id, room);
}

export async function deleteRoom(id: string): Promise<void> {
  rooms.delete(id.toUpperCase());
}

export function isPersistentStore(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
