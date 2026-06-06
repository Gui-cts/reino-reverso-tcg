import type { GameAction } from "../game/types";
import type { PlayerViewPayload } from "./player-view";

const API = "/api/rooms";

export type CreateRoomResponse = {
  roomId: string;
  token: string;
  seat: 0 | 1;
  view: PlayerViewPayload;
};

export type JoinRoomResponse = {
  seat: 0 | 1;
  token: string;
  view: PlayerViewPayload;
};

export type ActionResponse = {
  ok: boolean;
  error?: string;
  view: PlayerViewPayload | null;
};

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(text.slice(0, 120) || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(data.error ?? (text.slice(0, 120) || `HTTP ${res.status}`));
  }
  return data;
}

export async function apiCreateRoom(leaderId?: string): Promise<CreateRoomResponse> {
  const res = await fetch(`${API}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaderId }),
  });
  return parseJson(res);
}

export async function apiJoinRoom(roomId: string): Promise<JoinRoomResponse> {
  const res = await fetch(`${API}/${encodeURIComponent(roomId)}/join`, {
    method: "POST",
  });
  return parseJson(res);
}

export async function apiFetchRoom(roomId: string, token: string): Promise<PlayerViewPayload> {
  const res = await fetch(
    `${API}/${encodeURIComponent(roomId)}?token=${encodeURIComponent(token)}`,
  );
  return parseJson(res);
}

export async function apiSendAction(
  roomId: string,
  token: string,
  action: GameAction,
): Promise<ActionResponse> {
  const res = await fetch(`${API}/${encodeURIComponent(roomId)}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, action }),
  });
  return parseJson(res);
}
