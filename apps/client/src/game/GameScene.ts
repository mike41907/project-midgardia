import { getMapDefinition } from "@midgardia/game-data";
import type { CharacterSummary, NetworkPlayerState, WorldState } from "@midgardia/shared";
import type { GameHud } from "../ui/GameHud";
import { NetworkClient } from "../network";
import { AvatarView } from "./AvatarView";
import { WorldRenderer } from "./WorldRenderer";

export interface GameSceneData {
  network: NetworkClient;
  character: CharacterSummary;
  hud: GameHud;
}

export class GameScene extends Phaser.Scene {
  private network!: NetworkClient;
  private character!: CharacterSummary;
  private hud!: GameHud;
  private worldRenderer!: WorldRenderer;
  private actors = new Map<string, AvatarView>();
  private localId = "";
  private pendingNpcId?: string;
  private lastNpcRequestAt = 0;
  private selectedPlayer?: AvatarView;

  constructor() {
    super("world");
  }

  init(data: GameSceneData): void {
    this.network = data.network;
    this.character = data.character;
    this.hud = data.hud;
  }

  create(): void {
    this.worldRenderer = new WorldRenderer(this);
    this.network.onState((state) => this.applyWorldState(state));
    this.network.onDialog((dialog) => this.hud.showNpcDialog(dialog));
    this.network.onSystem((message) => this.hud.addSystemMessage(message));
    this.network.join(this.character);

    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handlePointer(pointer));
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _currentlyOver: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const nextZoom = Phaser.Math.Clamp(this.cameras.main.zoom - deltaY * 0.001, 0.8, 1.55);
      this.cameras.main.setZoom(nextZoom);
    });
    this.input.keyboard?.on("keydown-ESC", () => {
      this.pendingNpcId = undefined;
      this.selectedPlayer?.clearTint();
      this.selectedPlayer = undefined;
      this.hud.setTargetStatus("No target");
    });
    this.input.keyboard?.on("keydown-INSERT", () => this.network.toggleSit());
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") this.hud.focusChat();
      if (event.key.startsWith("F") && Number(event.key.slice(1)) >= 1) {
        this.hud.addSystemMessage(`${event.key} is reserved for future skills in Phase 4.`);
      }
    });
    this.scale.on("resize", () => this.resizeCamera());
    this.resizeCamera();
  }

  update(time: number, delta: number): void {
    for (const actor of this.actors.values()) actor.update(delta, time);
    const local = this.actors.get(this.localId);
    if (local) {
      this.cameras.main.startFollow(local, true, 0.11, 0.11);
      this.hud.updatePlayerPosition(Math.round(local.x), Math.round(local.y), getMapDefinition(this.currentMapId()).name);
      if (this.pendingNpcId) {
        const npc = getMapDefinition(this.currentMapId()).npcs.find((candidate) => candidate.id === this.pendingNpcId);
        if (npc && Math.hypot(npc.x - local.x, npc.y - local.y) < 116 && Date.now() - this.lastNpcRequestAt > 900) {
          this.lastNpcRequestAt = Date.now();
          this.network.interactNpc(npc.id);
        }
      }
    }
  }

  private currentMapId(): string {
    return this.hud.getMapId() || this.character.mapId || "sunpetal-village";
  }

  private applyWorldState(state: WorldState): void {
    const mapChanged = this.hud.getMapId() !== state.mapId;
    this.localId = state.selfId || this.character.id;
    if (mapChanged) {
      const map = this.worldRenderer.render(state.mapId);
      this.hud.setMap(map.id, map.name);
      this.cameras.main.setBounds(0, 0, map.width * map.tileSize, map.height * map.tileSize);
      for (const actor of this.actors.values()) actor.destroy();
      this.actors.clear();
      this.pendingNpcId = undefined;
    }
    const visibleIds = new Set<string>();
    for (const player of state.players) {
      visibleIds.add(player.characterId);
      let actor = this.actors.get(player.characterId);
      if (!actor) {
        actor = new AvatarView(this, player);
        this.actors.set(player.characterId, actor);
      } else {
        actor.applyState(player);
      }
      if (player.characterId === this.localId) {
        this.hud.updateCharacter(player);
      }
    }
    for (const [id, actor] of this.actors) {
      if (!visibleIds.has(id)) {
        actor.destroy();
        this.actors.delete(id);
      }
    }
    this.hud.updateOnlineCount(state.players.length);
    this.hud.updateMiniMap(state);
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;
    const npc = this.worldRenderer.npcAt(worldX, worldY);
    const player = this.findPlayerAt(worldX, worldY);
    if (pointer.rightButtonDown()) {
      if (player && player.characterId !== this.localId) {
        player.flashSelection();
        this.hud.setTargetStatus(`Player: ${player.name}`);
      } else if (npc) {
        this.hud.setTargetStatus(`${npc.name} · ${npc.role}`);
      }
      return;
    }
    if (!pointer.leftButtonDown()) return;
    if (npc) {
      this.pendingNpcId = npc.id;
      this.hud.setTargetStatus(`${npc.name} · approaching`);
      this.network.setTarget({ x: npc.x - 52, y: npc.y + 48 });
      this.worldRenderer.addClickMarker(npc.x, npc.y);
      return;
    }
    if (player && player.characterId !== this.localId) {
      this.selectedPlayer?.clearTint();
      this.selectedPlayer = player;
      player.setTint(0xffe4a3);
      this.hud.setTargetStatus(`Player: ${player.name}`);
      return;
    }
    this.pendingNpcId = undefined;
    this.hud.setTargetStatus(`Move to ${Math.round(worldX)}, ${Math.round(worldY)}`);
    this.network.setTarget({ x: worldX, y: worldY });
    this.worldRenderer.addClickMarker(worldX, worldY);
  }

  private findPlayerAt(x: number, y: number): AvatarView | undefined {
    return [...this.actors.values()]
      .filter((actor) => Math.hypot(actor.x - x, actor.y - y) < 28)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
  }

  private resizeCamera(): void {
    this.cameras.main.setZoom(Math.max(0.8, Math.min(1.55, this.cameras.main.zoom || 1.1)));
  }
}
