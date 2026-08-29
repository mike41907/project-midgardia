import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  canTraverse,
  findNpcAt,
  findPortalAt,
  getMapDefinition,
  type MapPoint,
} from "@midgardia/game-data";
import {
  directionFromVector,
  type ChatChannel,
  type ChatMessage,
  type Direction8,
  type NetworkPlayerState,
  type NpcDialog,
  type Point2,
  type WorldState,
  WORLD,
} from "@midgardia/shared";
import type { PrismaClient } from "@prisma/client";
import { config } from "./config";
import { verifyToken, type SessionClaims } from "./auth";

interface PlayerRuntime extends Point2 {
  socket: Socket;
  accountId: string;
  characterId: string;
  name: string;
  gender: string;
  hair: number;
  hairColor: string;
  baseLevel: number;
  jobLevel: number;
  mapId: string;
  targetX: number;
  targetY: number;
  facing: Direction8;
  isSitting: boolean;
  lastSavedAt: number;
}

interface TargetPayload {
  x?: unknown;
  y?: unknown;
}

interface ChatPayload {
  channel?: unknown;
  message?: unknown;
}

const ROOM_PREFIX = "map:";
const runtimes = new Map<string, PlayerRuntime>();
const characterSockets = new Map<string, string>();

function roomFor(mapId: string): string {
  return `${ROOM_PREFIX}${mapId}`;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stateFor(runtime: PlayerRuntime): NetworkPlayerState {
  return {
    id: runtime.characterId,
    characterId: runtime.characterId,
    name: runtime.name,
    gender: runtime.gender,
    hair: runtime.hair,
    hairColor: runtime.hairColor,
    baseLevel: runtime.baseLevel,
    jobLevel: runtime.jobLevel,
    x: runtime.x,
    y: runtime.y,
    facing: runtime.facing,
    isMoving: Math.hypot(runtime.targetX - runtime.x, runtime.targetY - runtime.y) > 1,
    isSitting: runtime.isSitting,
  };
}

async function persistRuntime(database: PrismaClient, runtime: PlayerRuntime): Promise<void> {
  try {
    await database.character.update({
      where: { id: runtime.characterId },
      data: {
        mapId: runtime.mapId,
        x: runtime.x,
        y: runtime.y,
        facing: runtime.facing,
        isSitting: runtime.isSitting,
      },
    });
    runtime.lastSavedAt = Date.now();
  } catch (error) {
    console.error(`[persistence] could not save ${runtime.characterId}`, error);
  }
}

function emitSystem(socket: Socket, message: string): void {
  const payload: ChatMessage = {
    id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    channel: "system",
    senderId: "system",
    senderName: "System",
    message,
    createdAt: Date.now(),
  };
  socket.emit("chat:message", payload);
}

function emitWorld(io: Server, mapId: string): void {
  const players = [...runtimes.values()].filter((runtime) => runtime.mapId === mapId);
  for (const runtime of players) {
    const state: WorldState = {
      mapId,
      players: players.map(stateFor),
      selfId: runtime.characterId,
      serverTime: Date.now(),
    };
    runtime.socket.emit("world:state", state);
  }
}

function parseChat(runtime: PlayerRuntime, payload: ChatPayload): { channel: ChatChannel; message: string; targetName?: string } | undefined {
  let message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) return undefined;
  if (message.length > 160) message = message.slice(0, 160);

  let channel: ChatChannel = payload.channel === "party" || payload.channel === "guild" ? payload.channel : "local";
  let targetName: string | undefined;
  if (message.startsWith("/w ") || message.startsWith("/whisper ")) {
    const parts = message.split(/\s+/);
    targetName = parts[1]?.slice(0, 24);
    message = parts.slice(2).join(" ").trim();
    channel = "whisper";
  } else if (message.startsWith("/party ")) {
    channel = "party";
    message = message.slice("/party ".length).trim();
  } else if (message.startsWith("/guild ")) {
    channel = "guild";
    message = message.slice("/guild ".length).trim();
  }
  if (!message) return undefined;
  return { channel, message: message.slice(0, 160), targetName };
}

function chatPayload(runtime: PlayerRuntime, channel: ChatChannel, message: string, recipientName?: string): ChatMessage {
  return {
    id: `${runtime.characterId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    channel,
    senderId: runtime.characterId,
    senderName: runtime.name,
    message,
    createdAt: Date.now(),
    recipientName,
  };
}

function notifyPortal(socket: Socket, mapName: string): void {
  emitSystem(socket, `You arrive at ${mapName}.`);
}

export function createSocketServer(httpServer: HttpServer, database: PrismaClient) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigins,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    const rawToken = socket.handshake.auth?.token;
    let claims: SessionClaims;
    try {
      claims = verifyToken(typeof rawToken === "string" ? rawToken : "");
    } catch {
      socket.emit("session:error", { message: "Your session is invalid. Please sign in again." });
      socket.disconnect(true);
      return;
    }

    socket.on("player:join", async (payload: { characterId?: unknown }) => {
      if (runtimes.has(socket.id)) return;
      const characterId = typeof payload?.characterId === "string" ? payload.characterId : "";
      const character = await database.character.findFirst({ where: { id: characterId, accountId: claims.accountId } });
      if (!character) {
        emitSystem(socket, "That character is not available on this account.");
        socket.disconnect(true);
        return;
      }

      const previousSocketId = characterSockets.get(character.id);
      if (previousSocketId) {
        runtimes.get(previousSocketId)?.socket.disconnect(true);
      }

      const map = getMapDefinition(character.mapId);
      const initialPosition = {
        x: map.id === character.mapId ? character.x : map.spawn.x,
        y: map.id === character.mapId ? character.y : map.spawn.y,
      };
      if (!canTraverse(map.id, initialPosition, initialPosition)) {
        initialPosition.x = map.spawn.x;
        initialPosition.y = map.spawn.y;
      }
      const runtime: PlayerRuntime = {
        socket,
        accountId: claims.accountId,
        characterId: character.id,
        name: character.name,
        gender: character.gender,
        hair: character.hair,
        hairColor: character.hairColor,
        baseLevel: character.baseLevel,
        jobLevel: character.jobLevel,
        mapId: map.id,
        x: initialPosition.x,
        y: initialPosition.y,
        targetX: initialPosition.x,
        targetY: initialPosition.y,
        facing: character.facing as Direction8,
        isSitting: character.isSitting,
        lastSavedAt: Date.now(),
      };
      runtimes.set(socket.id, runtime);
      characterSockets.set(character.id, socket.id);
      socket.data.characterId = character.id;
      socket.join(roomFor(runtime.mapId));
      socket.emit("world:joined", { selfId: runtime.characterId, mapId: runtime.mapId });
      emitSystem(socket, `Welcome to ${map.name}, ${runtime.name}.`);
      emitWorld(io, runtime.mapId);
    });

    socket.on("player:setTarget", (payload: TargetPayload) => {
      const runtime = runtimes.get(socket.id);
      if (!runtime || !finiteNumber(payload?.x) || !finiteNumber(payload?.y)) return;
      const map = getMapDefinition(runtime.mapId);
      const target = {
        x: Math.max(WORLD.playerRadius, Math.min(map.width * map.tileSize - WORLD.playerRadius, payload.x)),
        y: Math.max(WORLD.playerRadius, Math.min(map.height * map.tileSize - WORLD.playerRadius, payload.y)),
      };
      if (!canTraverse(runtime.mapId, { x: runtime.x, y: runtime.y }, target, WORLD.playerRadius)) {
        runtime.targetX = runtime.x;
        runtime.targetY = runtime.y;
        emitSystem(socket, "The way is blocked.");
        return;
      }
      runtime.targetX = target.x;
      runtime.targetY = target.y;
      runtime.isSitting = false;
      if (Math.hypot(target.x - runtime.x, target.y - runtime.y) > 0.5) {
        runtime.facing = directionFromVector(target.x - runtime.x, target.y - runtime.y);
      }
    });

    socket.on("player:toggleSit", () => {
      const runtime = runtimes.get(socket.id);
      if (!runtime) return;
      runtime.targetX = runtime.x;
      runtime.targetY = runtime.y;
      runtime.isSitting = !runtime.isSitting;
      emitSystem(socket, runtime.isSitting ? "You sit down to rest." : "You stand up.");
      emitWorld(io, runtime.mapId);
    });

    socket.on("npc:interact", (payload: { npcId?: unknown }) => {
      const runtime = runtimes.get(socket.id);
      if (!runtime || typeof payload?.npcId !== "string") return;
      const map = getMapDefinition(runtime.mapId);
      const npc = map.npcs.find((candidate) => candidate.id === payload.npcId);
      if (!npc) return;
      if (Math.hypot(npc.x - runtime.x, npc.y - runtime.y) > 128) {
        emitSystem(socket, `${npc.name} is too far away.`);
        return;
      }
      const dialog: NpcDialog = { npcId: npc.id, npcName: npc.name, role: npc.role, pages: npc.pages };
      socket.emit("npc:dialog", dialog);
    });

    socket.on("chat:send", (payload: ChatPayload) => {
      const runtime = runtimes.get(socket.id);
      if (!runtime) return;
      const parsed = parseChat(runtime, payload);
      if (!parsed) return;
      const message = chatPayload(runtime, parsed.channel, parsed.message, parsed.targetName);
      if (parsed.channel === "whisper") {
        const target = [...runtimes.values()].find((candidate) => candidate.name.toLowerCase() === parsed.targetName?.toLowerCase());
        if (!target) {
          emitSystem(socket, `No online player named ${parsed.targetName ?? "that"}.`);
          return;
        }
        target.socket.emit("chat:message", message);
        if (target.socket.id !== socket.id) socket.emit("chat:message", message);
        return;
      }
      if (parsed.channel === "party" || parsed.channel === "guild") {
        emitSystem(socket, `The ${parsed.channel} channel will unlock with the Phase 7 social systems.`);
        return;
      }
      for (const recipient of runtimes.values()) {
        if (recipient.mapId === runtime.mapId) recipient.socket.emit("chat:message", message);
      }
    });

    socket.on("disconnect", () => {
      const runtime = runtimes.get(socket.id);
      if (!runtime) return;
      runtimes.delete(socket.id);
      if (characterSockets.get(runtime.characterId) === socket.id) characterSockets.delete(runtime.characterId);
      void persistRuntime(database, runtime).finally(() => emitWorld(io, runtime.mapId));
    });
  });

  const tickMs = Math.floor(1000 / WORLD.tickRate);
  const tick = setInterval(() => {
    const changedMaps = new Set<string>();
    const step = WORLD.movementSpeed / WORLD.tickRate;
    for (const runtime of runtimes.values()) {
      const dx = runtime.targetX - runtime.x;
      const dy = runtime.targetY - runtime.y;
      const distance = Math.hypot(dx, dy);
      let moved = false;
      if (distance > 0.5) {
        const amount = Math.min(step, distance);
        const next = { x: runtime.x + (dx / distance) * amount, y: runtime.y + (dy / distance) * amount };
        if (canTraverse(runtime.mapId, { x: runtime.x, y: runtime.y }, next, WORLD.playerRadius)) {
          runtime.x = next.x;
          runtime.y = next.y;
          runtime.facing = directionFromVector(dx, dy);
          moved = true;
        } else {
          runtime.targetX = runtime.x;
          runtime.targetY = runtime.y;
        }
      }

      const portal = findPortalAt(runtime.mapId, { x: runtime.x, y: runtime.y });
      if (portal) {
        const oldMapId = runtime.mapId;
        runtime.socket.leave(roomFor(oldMapId));
        runtime.mapId = portal.toMapId;
        runtime.x = portal.toX;
        runtime.y = portal.toY;
        runtime.targetX = portal.toX;
        runtime.targetY = portal.toY;
        runtime.isSitting = false;
        runtime.socket.join(roomFor(runtime.mapId));
        notifyPortal(runtime.socket, getMapDefinition(runtime.mapId).name);
        changedMaps.add(oldMapId);
        changedMaps.add(runtime.mapId);
        moved = true;
      }

      if (moved || Date.now() - runtime.lastSavedAt > 1000) {
        changedMaps.add(runtime.mapId);
      }
      if (Date.now() - runtime.lastSavedAt > 1000) void persistRuntime(database, runtime);
    }
    for (const mapId of changedMaps) emitWorld(io, mapId);
  }, tickMs);

  return {
    io,
    close: () => clearInterval(tick),
  };
}
