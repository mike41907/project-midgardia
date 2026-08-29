import type { CharacterSummary } from "@midgardia/shared";

export interface AuthResponse {
  token: string;
  account: { id: string; username: string };
}

interface CharacterResponse {
  character: CharacterSummary;
}

async function request<T>(url: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export function register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function getCharacters(token: string): Promise<CharacterSummary[]> {
  const response = await request<{ characters: CharacterSummary[] }>("/api/characters", {}, token);
  return response.characters;
}

export async function createCharacter(
  token: string,
  values: { name: string; gender: string; hair: number; hairColor: string },
): Promise<CharacterSummary> {
  const response = await request<CharacterResponse>("/api/characters", {
    method: "POST",
    body: JSON.stringify(values),
  }, token);
  return response.character;
}
