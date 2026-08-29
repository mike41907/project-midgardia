import { getMapDefinition, type MapDefinition, type NpcDefinition, type Rect } from "@midgardia/game-data";

const villagePalette = {
  ground: [0x6b9870, 0x739f75, 0x65916b, 0x7ca77a, 0x608b67],
  road: 0xc5a675,
  roadEdge: 0x997a57,
  wall: 0x36534d,
  roof: 0x28413e,
  roofLight: 0x8cc184,
  window: 0xc9e7b0,
  boundary: 0x273c3b,
};

const townPalette = {
  ground: [0x927b62, 0x9b846a, 0x856f5b, 0x8f775f, 0x9f896f],
  road: 0xc5a675,
  roadEdge: 0x9b795a,
  wall: 0x4b3b3b,
  roof: 0x3c2d35,
  roofLight: 0xb98b69,
  window: 0xf4c486,
  boundary: 0x392f35,
};

export class WorldRenderer {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly detail: Phaser.GameObjects.Graphics;
  private readonly atmosphere: Phaser.GameObjects.Graphics;
  private readonly villageBackground?: Phaser.GameObjects.Image;
  private readonly townBackground?: Phaser.GameObjects.Image;
  private decorations: Phaser.GameObjects.GameObject[] = [];
  private map?: MapDefinition;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(0);
    this.ground = scene.add.graphics();
    this.detail = scene.add.graphics();
    this.atmosphere = scene.add.graphics();
    this.root.add([this.ground, this.detail, this.atmosphere]);
    if (scene.textures.exists("sunpetal-village-bg")) {
      this.villageBackground = scene.add.image(0, 0, "sunpetal-village-bg").setOrigin(0, 0);
      scene.textures.get("sunpetal-village-bg").setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.root.addAt(this.villageBackground, 0);
    }
    if (scene.textures.exists("emberfall-town-bg")) {
      this.townBackground = scene.add.image(0, 0, "emberfall-town-bg").setOrigin(0, 0);
      scene.textures.get("emberfall-town-bg").setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.root.addAt(this.townBackground, 0);
    }
  }

  render(mapId: string): MapDefinition {
    const map = getMapDefinition(mapId);
    this.map = map;
    const size = map.tileSize;
    const width = map.width * size;
    const height = map.height * size;
    const palette = map.id === "emberfall-town" ? townPalette : villagePalette;
    const hasIllustratedMap = map.id === "sunpetal-village" ? Boolean(this.villageBackground) : Boolean(this.townBackground);

    this.ground.clear();
    this.detail.clear();
    this.atmosphere.clear();
    this.villageBackground?.setVisible(map.id === "sunpetal-village" && hasIllustratedMap).setDisplaySize(width, height);
    this.townBackground?.setVisible(map.id === "emberfall-town" && hasIllustratedMap).setDisplaySize(width, height);
    this.ground.setVisible(!hasIllustratedMap);
    this.detail.setVisible(true);
    if (!hasIllustratedMap) {
      this.ground.fillStyle(palette.ground[0], 1);
      this.ground.fillRect(0, 0, width, height);

      for (let y = 0; y < map.height; y += 1) {
        for (let x = 0; x < map.width; x += 1) {
          const variation = (x * 17 + y * 31 + (map.id === "emberfall-town" ? 9 : 0)) % palette.ground.length;
          const inRoad = map.id === "emberfall-town"
            ? (x > 27 && x < 33) || (y > 18 && y < 22)
            : (x > 26 && x < 34) || (y > 19 && y < 23);
          const tileX = x * size;
          const tileY = y * size;
          this.ground.fillStyle(inRoad ? palette.road : palette.ground[variation], 1);
          this.ground.fillRect(tileX, tileY, size + 1, size + 1);

          if (inRoad) {
            this.detail.lineStyle(1, palette.roadEdge, 0.16);
            this.detail.strokeRect(tileX + 1, tileY + 1, size - 2, size - 2);
            if ((x + y) % 4 === 0) {
              this.detail.fillStyle(palette.roadEdge, 0.18);
              this.detail.fillRect(tileX + 8, tileY + 15, 11, 2);
            }
          } else if (variation === 0) {
            this.detail.fillStyle(map.id === "emberfall-town" ? 0x765f4e : 0x527b5a, 0.38);
            this.detail.fillRect(tileX + 7, tileY + 9, 2, 2);
            this.detail.fillRect(tileX + 22, tileY + 19, 2, 2);
          } else if ((x * 7 + y * 11) % 13 === 0) {
            this.detail.lineStyle(1, map.id === "emberfall-town" ? 0xb29676 : 0x9bc48b, 0.22);
            this.detail.lineBetween(tileX + 14, tileY + 22, tileX + 16, tileY + 17);
            this.detail.lineBetween(tileX + 16, tileY + 17, tileX + 19, tileY + 20);
          }
        }
      }
    }

    if (!hasIllustratedMap) {
      this.drawBoundary(width, height, palette.boundary);
      for (const [index, rect] of map.blocked.entries()) {
        if (this.isBoundaryRect(rect, width, height)) continue;
        this.drawBuilding(rect, palette, index);
      }
      this.drawLandmarks(map, palette);
    }
    this.drawAtmosphere(width, height, map.id === "emberfall-town");

    for (const decoration of this.decorations) decoration.destroy();
    this.decorations = [];
    for (const npc of map.npcs) this.addNpc(npc);
    for (const portal of map.portals) this.addPortal(portal.x, portal.y, portal.label, map.id === "emberfall-town");
    return map;
  }

  addClickMarker(x: number, y: number): void {
    const marker = this.scene.add.container(x, y).setDepth(8);
    const ring = this.scene.add.graphics();
    ring.lineStyle(2, 0xffe29b, 0.95);
    ring.strokeCircle(0, 0, 11);
    ring.lineStyle(1, 0xffffff, 0.7);
    ring.strokeCircle(0, 0, 5);
    ring.fillStyle(0xffe29b, 0.3);
    ring.fillCircle(0, 0, 3);
    const north = this.scene.add.triangle(0, -17, 0, -4, -4, 2, 4, 2, 0xfff1bc, 0.95);
    marker.add([ring, north]);
    this.scene.tweens.add({
      targets: marker,
      alpha: 0,
      scale: 1.42,
      duration: 480,
      ease: "Cubic.easeOut",
      onComplete: () => marker.destroy(),
    });
  }

  npcAt(x: number, y: number, range = 34): NpcDefinition | undefined {
    return this.map?.npcs.find((npc) => Math.hypot(npc.x - x, npc.y - y) <= range);
  }

  mapBounds(): { width: number; height: number } {
    return {
      width: (this.map?.width ?? 60) * (this.map?.tileSize ?? 32),
      height: (this.map?.height ?? 40) * (this.map?.tileSize ?? 32),
    };
  }

  private drawBoundary(width: number, height: number, color: number): void {
    this.detail.fillStyle(color, 0.7);
    this.detail.fillRect(0, 0, width, 8);
    this.detail.fillRect(0, height - 8, width, 8);
    this.detail.fillRect(0, 0, 8, height);
    this.detail.fillRect(width - 8, 0, 8, height);
    this.detail.lineStyle(2, 0xe4c487, 0.18);
    this.detail.strokeRect(8, 8, width - 16, height - 16);
  }

  private isBoundaryRect(rect: Rect, width: number, height: number): boolean {
    return rect.width >= width - 64 || rect.height >= height - 64;
  }

  private drawBuilding(rect: Rect, palette: typeof villagePalette, index: number): void {
    const roofHeight = Math.min(30, Math.max(16, Math.round(rect.height * 0.18)));
    const innerWidth = Math.max(12, rect.width - 8);
    const innerHeight = Math.max(12, rect.height - 8);
    const wallY = rect.y + 4;
    const roofY = rect.y + 4;

    this.detail.fillStyle(0x101b24, 0.3);
    this.detail.fillRect(rect.x + 11, rect.y + 12, rect.width, rect.height);
    this.detail.fillStyle(palette.wall, 1);
    this.detail.fillRect(rect.x + 2, rect.y + 2, innerWidth, innerHeight);
    this.detail.lineStyle(2, 0x171f2d, 0.85);
    this.detail.strokeRect(rect.x + 2, rect.y + 2, innerWidth, innerHeight);
    this.detail.fillStyle(palette.roof, 1);
    this.detail.fillRect(rect.x + 4, roofY, Math.max(8, rect.width - 12), roofHeight);
    this.detail.fillStyle(palette.roofLight, 0.45);
    this.detail.fillRect(rect.x + 6, roofY + 4, Math.max(5, rect.width - 16), 3);
    this.detail.lineStyle(1, 0xf4d28c, 0.16);
    this.detail.lineBetween(rect.x + 5, wallY + roofHeight, rect.x + rect.width - 9, wallY + roofHeight);

    if (rect.width >= 96 && rect.height >= 80) {
      const windowCount = Math.max(1, Math.floor((rect.width - 28) / 58));
      for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
        const windowX = rect.x + 17 + windowIndex * ((rect.width - 35) / windowCount);
        const windowY = rect.y + Math.min(rect.height - 35, roofHeight + 30);
        this.detail.fillStyle(0x172533, 1);
        this.detail.fillRect(windowX, windowY, 18, 13);
        this.detail.fillStyle(palette.window, 0.8);
        this.detail.fillRect(windowX + 3, windowY + 3, 5, 7);
        this.detail.fillRect(windowX + 10, windowY + 3, 5, 7);
      }
    }

    const doorX = rect.x + Math.max(10, Math.floor(rect.width / 2) - 8);
    const doorY = rect.y + rect.height - 25;
    if (rect.height >= 60) {
      this.detail.fillStyle(0x1b2431, 1);
      this.detail.fillRect(doorX, doorY, 16, 21);
      this.detail.fillStyle(0xf2c56e, 0.8);
      this.detail.fillCircle(doorX + 12, doorY + 11, 2);
    }

    if (index % 2 === 0) {
      this.detail.fillStyle(palette.roofLight, 0.5);
      this.detail.fillRect(rect.x + 9, rect.y + 9, 4, Math.max(8, roofHeight - 12));
    }
  }

  private drawLandmarks(map: MapDefinition, palette: typeof villagePalette): void {
    const landmarkPoints = map.id === "emberfall-town"
      ? [{ x: 224, y: 176 }, { x: 800, y: 176 }, { x: 1712, y: 176 }, { x: 1712, y: 1040 }, { x: 480, y: 1168 }]
      : [{ x: 192, y: 176 }, { x: 800, y: 176 }, { x: 1088, y: 208 }, { x: 1760, y: 176 }, { x: 1760, y: 1040 }, { x: 480, y: 1168 }];

    for (const [index, point] of landmarkPoints.entries()) {
      this.detail.fillStyle(0x1d2b2f, 0.24);
      this.detail.fillEllipse(point.x + 3, point.y + 16, 38, 13);
      this.detail.fillStyle(map.id === "emberfall-town" ? 0x5c684f : 0x365f4b, 0.92);
      this.detail.fillCircle(point.x, point.y, 15);
      this.detail.fillStyle(map.id === "emberfall-town" ? 0x76835e : 0x57906c, 1);
      this.detail.fillCircle(point.x - 7, point.y - 6, 10);
      this.detail.fillCircle(point.x + 8, point.y - 7, 9);
      this.detail.fillStyle(index % 2 === 0 ? 0xf0c77b : palette.window, 0.88);
      this.detail.fillRect(point.x - 2, point.y - 1, 4, 4);
      this.detail.fillStyle(0x1e342f, 0.65);
      this.detail.fillRect(point.x - 3, point.y + 8, 6, 9);
    }

    const flowerPoints = map.id === "emberfall-town"
      ? [{ x: 288, y: 832 }, { x: 864, y: 832 }, { x: 1088, y: 240 }, { x: 1728, y: 832 }]
      : [{ x: 272, y: 768 }, { x: 736, y: 800 }, { x: 1056, y: 864 }, { x: 1728, y: 832 }, { x: 1056, y: 208 }];
    for (const [index, point] of flowerPoints.entries()) {
      this.detail.fillStyle(index % 2 === 0 ? 0xf5d27c : 0xf0a8d6, 0.9);
      this.detail.fillCircle(point.x - 4, point.y, 3);
      this.detail.fillCircle(point.x + 4, point.y, 3);
      this.detail.fillCircle(point.x, point.y - 4, 3);
      this.detail.fillStyle(0xfff2bd, 0.9);
      this.detail.fillCircle(point.x, point.y, 2);
      this.detail.lineStyle(1, 0x355d4b, 0.7);
      this.detail.lineBetween(point.x, point.y + 3, point.x, point.y + 10);
    }
  }

  private drawAtmosphere(width: number, height: number, isTown: boolean): void {
    this.atmosphere.fillStyle(isTown ? 0xffad76 : 0xa6e5a9, 0.035);
    this.atmosphere.fillRect(0, 0, width, height);
    this.atmosphere.fillStyle(0x0e1726, 0.1);
    this.atmosphere.fillRect(0, 0, width, 110);
    this.atmosphere.fillStyle(0x0e1726, 0.08);
    this.atmosphere.fillRect(0, height - 150, width, 150);
  }

  private addNpc(npc: NpcDefinition): void {
    const marker = this.scene.add.container(npc.x, npc.y).setDepth(9);
    const art = this.scene.add.graphics();
    const accent = Phaser.Display.Color.HexStringToColor(npc.accent).color;
    art.fillStyle(0x101926, 0.38);
    art.fillEllipse(0, 18, 38, 12);
    art.fillStyle(0x222a42, 1);
    art.fillRoundedRect(-14, -2, 28, 25, 5);
    art.fillStyle(accent, 1);
    art.fillRect(-10, 1, 20, 16);
    art.fillStyle(0xf4d28c, 1);
    art.fillCircle(0, -10, 10);
    art.fillStyle(0x202942, 1);
    art.fillRect(-10, -20, 20, 6);
    art.fillRect(-13, -17, 5, 7);
    art.fillStyle(0xfff1bd, 0.92);
    art.fillCircle(4, -10, 2);
    art.fillStyle(0xf7c66d, 1);
    art.fillRect(12, 2, 3, 23);
    art.fillCircle(13.5, 0, 4);
    art.lineStyle(2, 0xfff2bd, 0.8);
    art.strokeCircle(0, -1, 23);
    const label = this.scene.add.text(0, -46, npc.name, {
      color: "#ffe8a8",
      fontFamily: "'Trebuchet MS', sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      stroke: "#192038",
      strokeThickness: 3,
    }).setOrigin(0.5);
    const role = this.scene.add.text(0, 31, npc.role.toUpperCase(), {
      color: "#abc1d6",
      fontFamily: "monospace",
      fontSize: "8px",
      stroke: "#192038",
      strokeThickness: 2,
    }).setOrigin(0.5);
    marker.add([art, label, role]);
    this.decorations.push(marker);
    this.scene.tweens.add({ targets: art, y: -2, duration: 1250, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  private addPortal(x: number, y: number, labelText: string, isTown: boolean): void {
    const marker = this.scene.add.container(x, y).setDepth(7);
    const glow = this.scene.add.graphics();
    glow.fillStyle(isTown ? 0x70d4ff : 0x8d73ff, 0.14);
    glow.fillCircle(0, 0, 36);
    glow.lineStyle(2, isTown ? 0x83e6ff : 0xe0a6ff, 0.35);
    glow.strokeCircle(0, 0, 33);
    const art = this.scene.add.graphics();
    art.fillStyle(0x1a203c, 0.78);
    art.fillCircle(0, 0, 25);
    art.lineStyle(3, isTown ? 0x83e6ff : 0xe0a6ff, 0.9);
    art.strokeCircle(0, 0, 25);
    art.lineStyle(1, 0xffe0ff, 0.75);
    art.strokeCircle(0, 0, 17);
    art.fillStyle(isTown ? 0x78d6ff : 0xd89cff, 0.22);
    art.fillCircle(0, 0, 12);
    const sparkles = this.scene.add.graphics();
    sparkles.fillStyle(0xfff1bd, 0.95);
    sparkles.fillRect(-2, -36, 4, 4);
    sparkles.fillRect(29, -3, 4, 4);
    sparkles.fillRect(-33, 8, 3, 3);
    const label = this.scene.add.text(0, 42, labelText, {
      color: "#efd9ff",
      fontFamily: "'Trebuchet MS', sans-serif",
      fontSize: "11px",
      stroke: "#271b43",
      strokeThickness: 3,
    }).setOrigin(0.5);
    marker.add([glow, art, sparkles, label]);
    this.decorations.push(marker);
    this.scene.tweens.add({ targets: glow, alpha: 0.42, scale: 1.12, duration: 1050, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.scene.tweens.add({ targets: sparkles, angle: 360, duration: 9000, repeat: -1, ease: "Linear" });
  }
}
