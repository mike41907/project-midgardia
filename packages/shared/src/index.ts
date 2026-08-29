export const WORLD = {
  tileSize: 32,
  playerRadius: 12,
  movementSpeed: 180,
  tickRate: 20,
  maxCharactersPerAccount: 5,
} as const;

export type Direction8 =
  | "south"
  | "southEast"
  | "east"
  | "northEast"
  | "north"
  | "northWest"
  | "west"
  | "southWest";

export type ChatChannel = "local" | "party" | "guild" | "whisper" | "system";

export interface Point2 {
  x: number;
  y: number;
}

export interface CharacterSummary {
  id: string;
  name: string;
  gender: string;
  hair: number;
  hairColor: string;
  baseLevel: number;
  jobLevel: number;
  baseExp: number;
  jobExp: number;
  mapId: string;
  x: number;
  y: number;
  facing: Direction8;
  isSitting: boolean;
}

export interface NetworkPlayerState extends Point2 {
  id: string;
  characterId: string;
  name: string;
  gender: string;
  hair: number;
  hairColor: string;
  baseLevel: number;
  jobLevel: number;
  facing: Direction8;
  isMoving: boolean;
  isSitting: boolean;
}

export interface WorldState {
  mapId: string;
  players: NetworkPlayerState[];
  selfId: string;
  serverTime: number;
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  senderId: string;
  senderName: string;
  message: string;
  createdAt: number;
  recipientName?: string;
}

export interface NpcDialog {
  npcId: string;
  npcName: string;
  role: string;
  pages: string[];
}

export interface DerivedStats {
  maxHp: number;
  maxSp: number;
  atk: number;
  matk: number;
  def: number;
  mdef: number;
  hit: number;
  flee: number;
  aspd: number;
  cri: number;
  moveSpeed: number;
}

/** Cost to raise a classic six-stat point, intentionally deterministic and server-shareable. */
export function statPointCost(currentValue: number): number {
  const value = Math.max(1, Math.floor(currentValue));
  return Math.max(2, Math.floor(value / 10) + 2 + Math.floor(value / 30));
}

export function baseExpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(99, Math.floor(level)));
  return Math.floor(80 * Math.pow(safeLevel, 2.15));
}

export function jobExpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(50, Math.floor(level)));
  return Math.floor(55 * Math.pow(safeLevel, 2.08));
}

export function deriveStats(
  level: number,
  stats: { str: number; agi: number; vit: number; int: number; dex: number; luk: number },
): DerivedStats {
  const safeLevel = Math.max(1, level);
  return {
    maxHp: 40 + safeLevel * 18 + stats.vit * 12,
    maxSp: 12 + safeLevel * 4 + stats.int * 7,
    atk: safeLevel * 2 + stats.str * 2 + Math.floor(stats.dex / 2),
    matk: safeLevel + stats.int * 3 + Math.floor(stats.dex / 3),
    def: Math.floor(stats.vit * 0.7 + stats.agi * 0.25),
    mdef: Math.floor(stats.int * 0.65 + stats.vit * 0.2),
    hit: 100 + safeLevel + stats.dex * 2 + stats.luk,
    flee: 80 + stats.agi * 2 + Math.floor(stats.luk / 2),
    aspd: Math.min(190, 140 + Math.floor(stats.agi * 0.45) + Math.floor(stats.dex * 0.15)),
    cri: 1 + Math.floor(stats.luk / 3),
    moveSpeed: WORLD.movementSpeed + Math.min(35, Math.floor(stats.agi / 10)),
  };
}

export function directionFromVector(dx: number, dy: number): Direction8 {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return "south";
  const angle = Math.atan2(dy, dx);
  const octant = Math.round(angle / (Math.PI / 4));
  const normalized = (octant + 8) % 8;
  return (["east", "southEast", "south", "southWest", "west", "northWest", "north", "northEast"] as const)[normalized];
}

export function directionVector(direction: Direction8): Point2 {
  const values: Record<Direction8, Point2> = {
    south: { x: 0, y: 1 },
    southEast: { x: 1, y: 1 },
    east: { x: 1, y: 0 },
    northEast: { x: 1, y: -1 },
    north: { x: 0, y: -1 },
    northWest: { x: -1, y: -1 },
    west: { x: -1, y: 0 },
    southWest: { x: -1, y: 1 },
  };
  return values[direction];
}
