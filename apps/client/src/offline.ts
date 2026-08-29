import { canTraverse, findPortalAt, findWalkablePath, getMapDefinition, isWalkable } from "@midgardia/game-data";
import {
  directionFromVector,
  type ChatMessage,
  type CharacterSummary,
  type Direction8,
  type NpcDialog,
  type Point2,
  type WorldState,
  WORLD,
} from "@midgardia/shared";
import type { GameClient } from "./network";

export const OFFLINE_CHARACTER_KEY = "midgardia-offline-character";

function createId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `offline-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
}

export function readOfflineCharacter(): CharacterSummary | undefined {
  try {
    const raw = localStorage.getItem(OFFLINE_CHARACTER_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CharacterSummary>;
    if (
      typeof parsed.id === "string" &&
      typeof parsed.name === "string" &&
      typeof parsed.mapId === "string" &&
      typeof parsed.x === "number" &&
      typeof parsed.y === "number"
    ) {
      return {
        id: parsed.id,
        name: parsed.name,
        gender: typeof parsed.gender === "string" ? parsed.gender : "androgynous",
        hair: typeof parsed.hair === "number" ? parsed.hair : 1,
        hairColor: typeof parsed.hairColor === "string" ? parsed.hairColor : "#e8bd77",
        baseLevel: typeof parsed.baseLevel === "number" ? parsed.baseLevel : 1,
        jobLevel: typeof parsed.jobLevel === "number" ? parsed.jobLevel : 1,
        baseExp: typeof parsed.baseExp === "number" ? parsed.baseExp : 0,
        jobExp: typeof parsed.jobExp === "number" ? parsed.jobExp : 0,
        mapId: getMapDefinition(parsed.mapId).id,
        x: parsed.x,
        y: parsed.y,
        facing: (parsed.facing as Direction8 | undefined) ?? "south",
        isSitting: parsed.isSitting === true,
      };
    }
  } catch {
    localStorage.removeItem(OFFLINE_CHARACTER_KEY);
  }
  return undefined;
}

export function saveOfflineCharacter(character: CharacterSummary): void {
  localStorage.setItem(OFFLINE_CHARACTER_KEY, JSON.stringify(character));
}

export function createOfflineCharacter(values: { name: string; gender: string; hairColor: string }): CharacterSummary {
  const map = getMapDefinition("sunpetal-village");
  const character: CharacterSummary = {
    id: createId(),
    name: values.name.trim().slice(0, 16),
    gender: values.gender,
    hair: 1,
    hairColor: values.hairColor,
    baseLevel: 1,
    jobLevel: 1,
    baseExp: 0,
    jobExp: 0,
    mapId: map.id,
    x: map.spawn.x,
    y: map.spawn.y,
    facing: "south",
    isSitting: false,
  };
  saveOfflineCharacter(character);
  return character;
}

interface OfflineRuntime extends CharacterSummary {
  targetX: number;
  targetY: number;
  waypoints: Point2[];
}

export class OfflineGameClient implements GameClient {
  private latestState?: WorldState;
  private runtime?: OfflineRuntime;
  private timer?: number;
  private lastSavedAt = 0;
  private readonly stateListeners = new Set<(state: WorldState) => void>();
  private readonly chatListeners = new Set<(message: ChatMessage) => void>();
  private readonly dialogListeners = new Set<(dialog: NpcDialog) => void>();
  private readonly systemListeners = new Set<(message: string) => void>();

  connect(): Promise<void> {
    return Promise.resolve();
  }

  join(character: CharacterSummary): void {
    this.stopTimer();
    const map = getMapDefinition(character.mapId);
    const position = canTraverse(map.id, { x: character.x, y: character.y }, { x: character.x, y: character.y })
      ? { x: character.x, y: character.y }
      : map.spawn;
    this.runtime = {
      ...character,
      mapId: map.id,
      x: position.x,
      y: position.y,
      targetX: position.x,
      targetY: position.y,
      waypoints: [],
    };
    this.emitSystem(`Offline mode ready. Welcome to ${map.name}, ${this.runtime.name}.`);
    this.emitState();
    this.timer = window.setInterval(() => this.tick(), Math.floor(1000 / WORLD.tickRate));
  }

  setTarget(point: Point2): void {
    const runtime = this.runtime;
    if (!runtime) return;
    const map = getMapDefinition(runtime.mapId);
    const target = {
      x: Math.max(WORLD.playerRadius, Math.min(map.width * map.tileSize - WORLD.playerRadius, point.x)),
      y: Math.max(WORLD.playerRadius, Math.min(map.height * map.tileSize - WORLD.playerRadius, point.y)),
    };
    const path = findWalkablePath(runtime.mapId, { x: runtime.x, y: runtime.y }, target, WORLD.playerRadius);
    if (path.length === 0) {
      runtime.targetX = runtime.x;
      runtime.targetY = runtime.y;
      this.emitSystem("The way is blocked.");
      this.emitState();
      return;
    }
    runtime.waypoints = path;
    this.advanceWaypoint();
    runtime.isSitting = false;
    if (Math.hypot(target.x - runtime.x, target.y - runtime.y) > 0.5) {
      runtime.facing = directionFromVector(target.x - runtime.x, target.y - runtime.y);
    }
    if (!isWalkable(runtime.mapId, target.x, target.y, WORLD.playerRadius)) this.emitSystem("That spot is occupied; moving to the nearest open ground.");
    this.emitState();
  }

  toggleSit(): void {
    const runtime = this.runtime;
    if (!runtime) return;
    runtime.targetX = runtime.x;
    runtime.targetY = runtime.y;
    runtime.waypoints = [];
    runtime.isSitting = !runtime.isSitting;
    this.emitSystem(runtime.isSitting ? "You sit down to rest." : "You stand up.");
    this.saveRuntime(true);
    this.emitState();
  }

  interactNpc(npcId: string): void {
    const runtime = this.runtime;
    if (!runtime) return;
    const npc = getMapDefinition(runtime.mapId).npcs.find((candidate) => candidate.id === npcId);
    if (!npc) return;
    if (Math.hypot(npc.x - runtime.x, npc.y - runtime.y) > 128) {
      this.emitSystem(`${npc.name} is too far away.`);
      return;
    }
    this.emitDialog({ npcId: npc.id, npcName: npc.name, role: npc.role, pages: npc.pages });
  }

  sendChat(channel: string, message: string): void {
    const runtime = this.runtime;
    const text = message.trim().slice(0, 160);
    if (!runtime || !text) return;
    if (text.startsWith("/w ") || text.startsWith("/whisper ")) {
      this.emitSystem("Whispers need another player and are unavailable in offline mode.");
      return;
    }
    if (text.startsWith("/party ") || text.startsWith("/guild ") || channel === "party" || channel === "guild") {
      this.emitSystem("Party and guild chat are available in the online world.");
      return;
    }
    this.emitChat({
      id: `${runtime.id}-${Date.now()}`,
      channel: "local",
      senderId: runtime.id,
      senderName: runtime.name,
      message: text,
      createdAt: Date.now(),
    });
  }

  onState(listener: (state: WorldState) => void): () => void {
    this.stateListeners.add(listener);
    if (this.latestState) listener(this.latestState);
    return () => this.stateListeners.delete(listener);
  }

  onChat(listener: (message: ChatMessage) => void): () => void {
    this.chatListeners.add(listener);
    return () => this.chatListeners.delete(listener);
  }

  onDialog(listener: (dialog: NpcDialog) => void): () => void {
    this.dialogListeners.add(listener);
    return () => this.dialogListeners.delete(listener);
  }

  onSystem(listener: (message: string) => void): () => void {
    this.systemListeners.add(listener);
    return () => this.systemListeners.delete(listener);
  }

  disconnect(): void {
    this.saveRuntime(true);
    this.stopTimer();
  }

  private tick(): void {
    const runtime = this.runtime;
    if (!runtime) return;
    let dx = runtime.targetX - runtime.x;
    let dy = runtime.targetY - runtime.y;
    let distance = Math.hypot(dx, dy);
    let moved = false;
    let waypointAdvanced = false;
    if (distance <= 0.5 && runtime.waypoints.length > 0) {
      this.advanceWaypoint();
      dx = runtime.targetX - runtime.x;
      dy = runtime.targetY - runtime.y;
      distance = Math.hypot(dx, dy);
      waypointAdvanced = true;
    }
    if (distance > 0.5) {
      const amount = Math.min(WORLD.movementSpeed / WORLD.tickRate, distance);
      const next = { x: runtime.x + (dx / distance) * amount, y: runtime.y + (dy / distance) * amount };
      if (canTraverse(runtime.mapId, { x: runtime.x, y: runtime.y }, next, WORLD.playerRadius)) {
        runtime.x = next.x;
        runtime.y = next.y;
        runtime.facing = directionFromVector(dx, dy);
        moved = true;
      } else {
        runtime.targetX = runtime.x;
        runtime.targetY = runtime.y;
        runtime.waypoints = [];
        this.emitSystem("The way is blocked.");
      }
    }

    const portal = findPortalAt(runtime.mapId, { x: runtime.x, y: runtime.y });
    if (portal) {
      runtime.mapId = portal.toMapId;
      runtime.x = portal.toX;
      runtime.y = portal.toY;
      runtime.targetX = portal.toX;
      runtime.targetY = portal.toY;
      runtime.waypoints = [];
      runtime.isSitting = false;
      this.emitSystem(`You arrive at ${getMapDefinition(runtime.mapId).name}.`);
      moved = true;
    }

    if (moved || Date.now() - this.lastSavedAt > 1000) this.saveRuntime();
    if (moved || waypointAdvanced || distance > 0.5) this.emitState();
  }

  private emitState(): void {
    const runtime = this.runtime;
    if (!runtime) return;
    const player = {
      id: runtime.id,
      characterId: runtime.id,
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
    const state: WorldState = {
      mapId: runtime.mapId,
      players: [player],
      selfId: runtime.id,
      serverTime: Date.now(),
    };
    this.latestState = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private emitChat(message: ChatMessage): void {
    for (const listener of this.chatListeners) listener(message);
  }

  private emitDialog(dialog: NpcDialog): void {
    for (const listener of this.dialogListeners) listener(dialog);
  }

  private emitSystem(message: string): void {
    const payload: ChatMessage = {
      id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      channel: "system",
      senderId: "system",
      senderName: "System",
      message,
      createdAt: Date.now(),
    };
    this.emitChat(payload);
  }

  private saveRuntime(force = false): void {
    const runtime = this.runtime;
    if (!runtime || (!force && Date.now() - this.lastSavedAt < 900)) return;
    const { targetX: _targetX, targetY: _targetY, waypoints: _waypoints, ...character } = runtime;
    saveOfflineCharacter(character);
    this.lastSavedAt = Date.now();
  }

  private advanceWaypoint(): void {
    const runtime = this.runtime;
    if (!runtime) return;
    const waypoint = runtime.waypoints.shift();
    if (waypoint) {
      runtime.targetX = waypoint.x;
      runtime.targetY = waypoint.y;
    } else {
      runtime.targetX = runtime.x;
      runtime.targetY = runtime.y;
    }
  }

  private stopTimer(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }
}
