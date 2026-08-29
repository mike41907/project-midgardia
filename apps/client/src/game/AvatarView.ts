import type { Direction8, NetworkPlayerState } from "@midgardia/shared";

const directionRotation: Record<Direction8, number> = {
  south: 0,
  southEast: Math.PI / 8,
  east: Math.PI / 4,
  northEast: (3 * Math.PI) / 8,
  north: Math.PI / 2,
  northWest: (5 * Math.PI) / 8,
  west: (6 * Math.PI) / 8,
  southWest: (7 * Math.PI) / 8,
};

export class AvatarView extends Phaser.GameObjects.Container {
  readonly characterId: string;
  private readonly selectionRing: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly art: Phaser.GameObjects.Container;
  private readonly artGraphics: Phaser.GameObjects.Graphics;
  private readonly nameText: Phaser.GameObjects.Text;
  private state: NetworkPlayerState;
  private phase = Math.random() * Math.PI * 2;
  private targetX: number;
  private targetY: number;
  private pulse = 0;

  constructor(scene: Phaser.Scene, state: NetworkPlayerState) {
    super(scene, state.x, state.y);
    this.characterId = state.characterId;
    this.state = state;
    this.targetX = state.x;
    this.targetY = state.y;
    this.selectionRing = scene.add.graphics();
    this.shadow = scene.add.ellipse(0, 14, 26, 9, 0x101826, 0.34);
    this.art = scene.add.container(0, 0);
    this.artGraphics = scene.add.graphics();
    this.art.add(this.artGraphics);
    this.nameText = scene.add.text(0, -39, state.name, {
      color: state.isSitting ? "#b5c3d6" : "#fff3d1",
      fontFamily: "'Trebuchet MS', sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      stroke: "#121a2b",
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add([this.selectionRing, this.shadow, this.art, this.nameText]);
    scene.add.existing(this);
    this.setDepth(20);
    this.redraw();
  }

  applyState(next: NetworkPlayerState): void {
    this.state = next;
    this.targetX = next.x;
    this.targetY = next.y;
    this.nameText.setText(next.name);
    this.nameText.setColor(next.isSitting ? "#b5c3d6" : "#fff3d1");
    this.redraw();
  }

  update(delta: number, elapsed: number): void {
    const blend = 1 - Math.pow(0.001, delta / 1000);
    this.x = Phaser.Math.Linear(this.x, this.targetX, blend);
    this.y = Phaser.Math.Linear(this.y, this.targetY, blend);
    const moving = this.state.isMoving && !this.state.isSitting;
    const wave = Math.sin(elapsed * (moving ? 0.014 : 0.0028) + this.phase);
    const bob = moving ? wave * 2.1 : wave * 0.55;
    this.art.y = bob;
    this.shadow.scaleX = moving ? 1 + Math.abs(wave) * 0.08 : 1;
    this.art.scaleY = this.state.isSitting ? 0.78 : 1;
    this.art.scaleX = 1;
    this.selectionRing.alpha = this.state.isSitting ? 0.28 : 0.55;
    if (this.pulse > 0) {
      this.pulse = Math.max(0, this.pulse - delta);
      this.art.scaleX = 1 + this.pulse / 240;
      this.selectionRing.alpha = 0.8;
      this.selectionRing.scale = 1 + (180 - this.pulse) / 280;
    } else {
      this.selectionRing.scale = 1;
    }
  }

  flashSelection(): void {
    this.pulse = 180;
  }

  private redraw(): void {
    const graphics = this.artGraphics;
    graphics.clear();
    const facing = directionRotation[this.state.facing];
    this.art.rotation = facing;

    this.selectionRing.clear();
    this.selectionRing.lineStyle(1, 0xffe6a5, 0.9);
    this.selectionRing.strokeEllipse(0, 12, 38, 18);
    this.selectionRing.lineStyle(1, 0x7bdce8, 0.42);
    this.selectionRing.strokeEllipse(0, 12, 31, 13);

    // Original, code-drawn pixel-style adventurer: cape, tunic, hair, boots, and a small lantern.
    graphics.fillStyle(0x18263e, 1);
    graphics.fillRect(-13, 3, 26, 20);
    graphics.fillStyle(0x263655, 1);
    graphics.fillRect(-10, 5, 20, 19);
    graphics.fillStyle(0x3f5b83, 0.95);
    graphics.fillRect(-12, 8, 4, 14);
    graphics.fillRect(8, 8, 4, 14);
    graphics.fillStyle(0x5e83b5, 1);
    graphics.fillRect(-8, 1, 16, 18);
    graphics.fillStyle(0x9fcae9, 1);
    graphics.fillRect(-6, 4, 12, 7);
    graphics.fillStyle(0xd9f4ff, 0.72);
    graphics.fillRect(-4, 5, 8, 2);
    graphics.fillStyle(0x202942, 1);
    graphics.fillRect(-9, 21, 7, 7);
    graphics.fillRect(2, 21, 7, 7);
    graphics.fillStyle(0xe8bd77, 1);
    graphics.fillCircle(0, -6, 10);
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(this.state.hairColor).color, 1);
    if (this.state.hair % 2 === 0) {
      graphics.fillRect(-11, -16, 22, 8);
      graphics.fillRect(-9, -9, 5, 8);
      graphics.fillRect(4, -9, 5, 8);
    } else {
      graphics.fillRect(-10, -16, 20, 7);
      graphics.fillRect(-7, -10, 14, 4);
      if (this.state.hair >= 3) graphics.fillRect(-11, -13, 4, 11);
    }
    graphics.fillStyle(0xffffff, 0.48);
    graphics.fillRect(-6, -9, 3, 2);
    graphics.fillStyle(0xf7c66d, 1);
    graphics.fillCircle(9, 8, 3);
    graphics.lineStyle(2, 0xf7c66d, 0.9);
    graphics.strokeRect(-12, -18, 24, 48);
    if (this.state.isSitting) {
      graphics.fillStyle(0x8da0bf, 0.8);
      graphics.fillRect(-15, 27, 30, 3);
    }
  }
}
