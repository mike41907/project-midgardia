export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface NpcDefinition {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  accent: string;
  pages: string[];
}

export interface PortalDefinition {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  toMapId: string;
  toX: number;
  toY: number;
}

export interface MapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  spawn: MapPoint;
  blocked: Rect[];
  npcs: NpcDefinition[];
  portals: PortalDefinition[];
}

const village: MapDefinition = {
  id: "sunpetal-village",
  name: "Sunpetal Village",
  width: 60,
  height: 40,
  tileSize: 32,
  spawn: { x: 960, y: 704 },
  blocked: [
    { x: 0, y: 0, width: 1920, height: 32 },
    { x: 0, y: 1248, width: 1920, height: 32 },
    { x: 0, y: 0, width: 32, height: 1280 },
    { x: 1888, y: 0, width: 32, height: 1280 },
    { x: 320, y: 320, width: 320, height: 160 },
    { x: 320, y: 480, width: 96, height: 256 },
    { x: 1376, y: 288, width: 320, height: 192 },
    { x: 1536, y: 480, width: 160, height: 256 },
    { x: 640, y: 960, width: 256, height: 128 },
    { x: 1120, y: 928, width: 352, height: 160 },
    { x: 64, y: 832, width: 256, height: 96 },
  ],
  npcs: [
    {
      id: "village-guide",
      name: "Liora",
      role: "Village Guide",
      x: 960,
      y: 608,
      accent: "#f7c66d",
      pages: [
        "Welcome to Sunpetal Village, traveller.",
        "Click any open ground to walk. Press Insert to sit and recover when that system is enabled.",
        "The eastern portal leads to Emberfall Town. Keep your eyes open for future field paths.",
      ],
    },
    {
      id: "village-cartographer",
      name: "Bram",
      role: "Cartographer",
      x: 1184,
      y: 768,
      accent: "#78d6c5",
      pages: [
        "I chart the old roads around the village.",
        "The map is small for now, but every landmark is built to grow into a larger world.",
      ],
    },
  ],
  portals: [
    {
      id: "village-east-gate",
      label: "To Emberfall Town",
      x: 1792,
      y: 704,
      radius: 42,
      toMapId: "emberfall-town",
      toX: 160,
      toY: 704,
    },
  ],
};

const town: MapDefinition = {
  id: "emberfall-town",
  name: "Emberfall Town",
  width: 60,
  height: 40,
  tileSize: 32,
  spawn: { x: 160, y: 704 },
  blocked: [
    { x: 0, y: 0, width: 1920, height: 32 },
    { x: 0, y: 1248, width: 1920, height: 32 },
    { x: 0, y: 0, width: 32, height: 1280 },
    { x: 1888, y: 0, width: 32, height: 1280 },
    { x: 352, y: 288, width: 384, height: 224 },
    { x: 352, y: 512, width: 128, height: 256 },
    { x: 1152, y: 288, width: 416, height: 192 },
    { x: 1408, y: 480, width: 160, height: 288 },
    { x: 704, y: 960, width: 352, height: 160 },
    { x: 128, y: 960, width: 256, height: 128 },
  ],
  npcs: [
    {
      id: "town-steward",
      name: "Seren",
      role: "Town Steward",
      x: 960,
      y: 704,
      accent: "#d99bff",
      pages: [
        "Emberfall is the first crossroads of the Midgardia frontier.",
        "The market, storage, and job halls will open in later phases.",
      ],
    },
  ],
  portals: [
    {
      id: "town-west-gate",
      label: "To Sunpetal Village",
      x: 96,
      y: 704,
      radius: 42,
      toMapId: "sunpetal-village",
      toX: 1760,
      toY: 704,
    },
  ],
};

export const MAPS: Record<string, MapDefinition> = {
  [village.id]: village,
  [town.id]: town,
};

export function getMapDefinition(mapId: string): MapDefinition {
  return MAPS[mapId] ?? village;
}

export function isWalkable(mapId: string, x: number, y: number, radius = 12): boolean {
  const map = getMapDefinition(mapId);
  if (x < radius || y < radius || x > map.width * map.tileSize - radius || y > map.height * map.tileSize - radius) {
    return false;
  }
  return !map.blocked.some((rect) => {
    return x + radius > rect.x && x - radius < rect.x + rect.width && y + radius > rect.y && y - radius < rect.y + rect.height;
  });
}

export function canTraverse(mapId: string, from: MapPoint, to: MapPoint, radius = 12): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const samples = Math.max(1, Math.ceil(distance / 16));
  for (let index = 1; index <= samples; index += 1) {
    const progress = index / samples;
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    if (!isWalkable(mapId, x, y, radius)) return false;
  }
  return true;
}

/** Find grid waypoints around blockers for the offline click-to-move client. */
export function findWalkablePath(mapId: string, from: MapPoint, to: MapPoint, radius = 12): MapPoint[] {
  if (canTraverse(mapId, from, to, radius)) return [to];

  const map = getMapDefinition(mapId);
  const cellSize = map.tileSize;
  const nodes = new Map<string, MapPoint>();
  const keyFor = (column: number, row: number) => `${column},${row}`;
  const distanceTo = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y);

  for (let row = 0; row < map.height; row += 1) {
    for (let column = 0; column < map.width; column += 1) {
      const point = { x: column * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
      if (isWalkable(mapId, point.x, point.y, radius)) nodes.set(keyFor(column, row), point);
    }
  }

  const candidates = [...nodes.entries()].sort(([, a], [, b]) => distanceTo(a, from) - distanceTo(b, from));
  const startEntry = candidates.find(([, point]) => canTraverse(mapId, from, point, radius));
  if (!startEntry) return [];

  const targetIsWalkable = isWalkable(mapId, to.x, to.y, radius);
  const startKey = startEntry[0];
  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, distanceTo(nodes.get(startKey)!, to)]]);
  const offsets = [-1, 0, 1];
  let bestKey = startKey;
  let bestDistance = distanceTo(nodes.get(startKey)!, to);
  let terminalKey: string | undefined;

  while (open.size > 0) {
    let currentKey = "";
    let currentScore = Number.POSITIVE_INFINITY;
    for (const key of open) {
      const score = fScore.get(key) ?? Number.POSITIVE_INFINITY;
      if (score < currentScore) {
        currentKey = key;
        currentScore = score;
      }
    }
    if (!currentKey) break;
    open.delete(currentKey);
    const current = nodes.get(currentKey)!;
    const currentDistance = distanceTo(current, to);
    if (currentDistance < bestDistance) {
      bestKey = currentKey;
      bestDistance = currentDistance;
    }
    if (targetIsWalkable && canTraverse(mapId, current, to, radius)) {
      terminalKey = currentKey;
      break;
    }

    const [column, row] = currentKey.split(",").map(Number);
    for (const rowOffset of offsets) {
      for (const columnOffset of offsets) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const neighborKey = keyFor(column + columnOffset, row + rowOffset);
        const neighbor = nodes.get(neighborKey);
        if (!neighbor || !canTraverse(mapId, current, neighbor, radius)) continue;
        const stepCost = Math.hypot(columnOffset, rowOffset);
        const tentativeScore = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + stepCost;
        if (tentativeScore >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeScore);
        fScore.set(neighborKey, tentativeScore + distanceTo(neighbor, to) / cellSize);
        open.add(neighborKey);
      }
    }
  }

  const endKey = terminalKey ?? bestKey;
  const pathKeys = [endKey];
  while (pathKeys[0] !== startKey) {
    const previous = cameFrom.get(pathKeys[0]);
    if (!previous) break;
    pathKeys.unshift(previous);
  }
  const path = pathKeys.map((key) => nodes.get(key)!).filter(Boolean);
  const last = path[path.length - 1];
  if (targetIsWalkable && last && canTraverse(mapId, last, to, radius)) path.push(to);
  return path;
}

export function findPortalAt(mapId: string, point: MapPoint): PortalDefinition | undefined {
  return getMapDefinition(mapId).portals.find((portal) => Math.hypot(portal.x - point.x, portal.y - point.y) <= portal.radius);
}

export function findNpcAt(mapId: string, point: MapPoint, range = 100): NpcDefinition | undefined {
  return getMapDefinition(mapId).npcs.find((npc) => Math.hypot(npc.x - point.x, npc.y - point.y) <= range);
}
