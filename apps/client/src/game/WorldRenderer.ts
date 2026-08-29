import { getMapDefinition, type MapDefinition, type NpcDefinition } from "@midgardia/game-data";

export class WorldRenderer {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly ground: Phaser.GameObjects.Graphics;
  private decorations: Phaser.GameObjects.GameObject[] = [];
  private map?: MapDefinition;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(0);
    this.ground = scene.add.graphics();
    this.root.add(this.ground);
  }

  render(mapId: string): MapDefinition {
    const map = getMapDefinition(mapId);
    this.map = map;
    this.ground.clear();
    const size = map.tileSize;
    const width = map.width * size;
    const height = map.height * size;
    this.ground.fillStyle(map.id === "emberfall-town" ? 0x8b7660 : 0x6d9a71, 1);
    this.ground.fillRect(0, 0, width, height);

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const variation = (x * 17 + y * 31 + (map.id === "emberfall-town" ? 9 : 0)) % 5;
        const inRoad = map.id === "emberfall-town"
          ? (x > 27 && x < 33) || (y > 18 && y < 22)
          : (x > 26 && x < 34) || (y > 19 && y < 23);
        const colors = map.id === "emberfall-town"
          ? [0x927b62, 0x9b846a, 0x856f5b, 0x8f775f, 0x9f896f]
          : [0x6d9a71, 0x739f73, 0x67916a, 0x78a477, 0x65906a];
        this.ground.fillStyle(inRoad ? 0xc5a675 : colors[variation], 1);
        this.ground.fillRect(x * size, y * size, size + 1, size + 1);
        if (variation === 0 && !inRoad) {
          this.ground.fillStyle(map.id === "emberfall-town" ? 0x765f4e : 0x527b5a, 0.4);
          this.ground.fillRect(x * size + 7, y * size + 9, 2, 2);
          this.ground.fillRect(x * size + 22, y * size + 19, 2, 2);
        }
      }
    }

    for (const rect of map.blocked) {
      if (rect.x <= 32 && rect.y <= 32) continue;
      this.ground.fillStyle(map.id === "emberfall-town" ? 0x4b3b3b : 0x36534d, 0.95);
      this.ground.fillRect(rect.x, rect.y, rect.width, rect.height);
      this.ground.lineStyle(3, map.id === "emberfall-town" ? 0xb98b69 : 0x8cc184, 0.35);
      this.ground.strokeRect(rect.x + 3, rect.y + 3, Math.max(1, rect.width - 6), Math.max(1, rect.height - 6));
    }

    for (const decoration of this.decorations) decoration.destroy();
    this.decorations = [];
    for (const npc of map.npcs) this.addNpc(npc);
    for (const portal of map.portals) this.addPortal(portal.x, portal.y, portal.label);
    return map;
  }

  addClickMarker(x: number, y: number): void {
    const marker = this.scene.add.graphics().setDepth(8);
    marker.lineStyle(2, 0xffe29b, 0.95);
    marker.strokeCircle(x, y, 12);
    marker.fillStyle(0xffe29b, 0.22);
    marker.fillCircle(x, y, 4);
    this.scene.tweens.add({
      targets: marker,
      alpha: 0,
      scale: 1.45,
      duration: 430,
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

  private addNpc(npc: NpcDefinition): void {
    const marker = this.scene.add.container(npc.x, npc.y).setDepth(9);
    const art = this.scene.add.graphics();
    art.fillStyle(0x222a42, 0.92);
    art.fillCircle(0, 0, 18);
    art.fillStyle(Phaser.Display.Color.HexStringToColor(npc.accent).color, 1);
    art.fillCircle(0, -2, 10);
    art.fillStyle(0xf4d28c, 1);
    art.fillRect(-7, 6, 14, 8);
    art.lineStyle(2, 0xfff2bd, 0.8);
    art.strokeCircle(0, 0, 20);
    const label = this.scene.add.text(0, -36, npc.name, {
      color: "#ffe8a8",
      fontFamily: "'Trebuchet MS', sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      stroke: "#192038",
      strokeThickness: 3,
    }).setOrigin(0.5);
    marker.add([art, label]);
    this.decorations.push(marker);
  }

  private addPortal(x: number, y: number, labelText: string): void {
    const marker = this.scene.add.container(x, y).setDepth(7);
    const art = this.scene.add.graphics();
    art.fillStyle(0x4a2e77, 0.55);
    art.fillCircle(0, 0, 28);
    art.lineStyle(3, 0xe0a6ff, 0.85);
    art.strokeCircle(0, 0, 26);
    art.lineStyle(1, 0xffe0ff, 0.65);
    art.strokeCircle(0, 0, 18);
    const label = this.scene.add.text(0, 36, labelText, {
      color: "#efd9ff",
      fontFamily: "'Trebuchet MS', sans-serif",
      fontSize: "11px",
      stroke: "#271b43",
      strokeThickness: 3,
    }).setOrigin(0.5);
    marker.add([art, label]);
    this.decorations.push(marker);
    this.scene.tweens.add({ targets: marker, scale: 1.08, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }
}
