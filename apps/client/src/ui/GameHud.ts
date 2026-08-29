import type { NpcDialog, NetworkPlayerState, WorldState } from "@midgardia/shared";
import type { GameClient } from "../network";
import { getMapDefinition } from "@midgardia/game-data";

const channels = ["all", "local", "party", "guild", "whisper", "system"] as const;
type ChannelTab = (typeof channels)[number];

export class GameHud {
  private readonly root: HTMLElement;
  private readonly network: GameClient;
  private readonly onExit: () => void;
  private readonly mode: "online" | "offline";
  private mapId = "";
  private localPosition = { x: 0, y: 0 };
  private currentChannel: ChannelTab = "all";
  private readonly chatMessages: Array<{ channel: string; element: HTMLElement }> = [];
  private dialogPages: string[] = [];
  private dialogIndex = 0;
  private readonly refs: Record<string, HTMLElement> = {};

  constructor(parent: HTMLElement, network: GameClient, character: NetworkPlayerState, onExit: () => void, mode: "online" | "offline" = "online") {
    this.network = network;
    this.onExit = onExit;
    this.mode = mode;
    this.root = document.createElement("section");
    this.root.className = "game-shell";
    this.root.innerHTML = this.template(character);
    parent.replaceChildren(this.root);
    for (const key of [
      "player-name", "base-level", "job-level", "map-name", "server-clock", "online-count", "target-status",
      "chat-feed", "dialog-title", "dialog-role", "dialog-copy", "dialog-page", "minimap-canvas",
    ]) {
      const element = this.root.querySelector<HTMLElement>(`#${key}`);
      if (element) this.refs[key] = element;
    }
    this.bindEvents();
    this.updateClock();
    window.setInterval(() => this.updateClock(), 1000);
    this.addSystemMessage("Left click open ground to move · click Liora or Bram to talk · Insert to sit.");
  }

  getElement(): HTMLElement {
    return this.root;
  }

  getMapId(): string {
    return this.mapId;
  }

  setMap(mapId: string, name: string): void {
    this.mapId = mapId;
    this.refs["map-name"].textContent = name;
    this.addSystemMessage(`Map loaded: ${name}.`);
  }

  updateCharacter(player: NetworkPlayerState): void {
    this.refs["player-name"].textContent = player.name;
    this.refs["base-level"].textContent = String(player.baseLevel).padStart(2, "0");
    this.refs["job-level"].textContent = String(player.jobLevel).padStart(2, "0");
    this.localPosition = { x: player.x, y: player.y };
    const state = player.isSitting ? "Resting" : player.isMoving ? "Moving" : "Ready";
    this.root.querySelector<HTMLElement>("#player-state")!.textContent = state;
  }

  updatePlayerPosition(x: number, y: number, mapName: string): void {
    this.localPosition = { x, y };
    this.root.querySelector<HTMLElement>("#coords")!.textContent = `${x}, ${y}`;
    this.refs["map-name"].textContent = mapName;
  }

  updateOnlineCount(count: number): void {
    this.refs["online-count"].textContent = `${count} online`;
  }

  updateMiniMap(state: WorldState): void {
    const canvas = this.refs["minimap-canvas"] as HTMLCanvasElement | undefined;
    if (!canvas) return;
    const map = getMapDefinition(state.mapId);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = map.id === "emberfall-town" ? "#6d5949" : "#41664a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / (map.width * map.tileSize);
    const scaleY = canvas.height / (map.height * map.tileSize);
    for (const rect of map.blocked) {
      context.fillStyle = "rgba(27, 30, 44, .72)";
      context.fillRect(rect.x * scaleX, rect.y * scaleY, rect.width * scaleX, rect.height * scaleY);
    }
    for (const portal of map.portals) {
      context.fillStyle = "#efb4ff";
      context.beginPath();
      context.arc(portal.x * scaleX, portal.y * scaleY, 3, 0, Math.PI * 2);
      context.fill();
    }
    for (const npc of map.npcs) {
      context.fillStyle = "#ffd878";
      context.fillRect(npc.x * scaleX - 2, npc.y * scaleY - 2, 4, 4);
    }
    for (const player of state.players) {
      context.fillStyle = player.characterId === state.selfId ? "#ffffff" : "#8ed8ff";
      context.beginPath();
      context.arc(player.x * scaleX, player.y * scaleY, player.characterId === state.selfId ? 3 : 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  setTargetStatus(status: string): void {
    this.refs["target-status"].textContent = status;
  }

  focusChat(): void {
    this.root.querySelector<HTMLInputElement>("#chat-input")?.focus();
  }

  addSystemMessage(message: string): void {
    this.addMessage("system", "System", message);
  }

  showNpcDialog(dialog: NpcDialog): void {
    this.dialogPages = dialog.pages;
    this.dialogIndex = 0;
    this.refs["dialog-title"].textContent = dialog.npcName;
    this.refs["dialog-role"].textContent = dialog.role;
    this.renderDialogPage();
    this.root.querySelector<HTMLElement>("#npc-dialog")?.classList.add("is-open");
  }

  close(): void {
    this.root.remove();
  }

  private template(character: NetworkPlayerState): string {
    const slots = Array.from({ length: 9 }, (_, index) => `<button class="skill-slot" data-skill="F${index + 1}" title="Reserved for Phase 4"><span>F${index + 1}</span><b>—</b></button>`).join("");
    return `
        <div class="game-topbar">
        <div class="brand-lockup"><span class="brand-mark">✦</span><div><strong>PROJECT MIDGARDIA</strong><small>${this.mode === "offline" ? "SINGLE-PLAYER DEMO" : "PRIVATE WORLD · PHASE 1"}</small></div></div>
        <div class="player-panel">
          <div class="portrait-chip"><span class="portrait-glyph">✧</span></div>
          <div class="player-copy"><strong id="player-name">${this.escape(character.name)}</strong><span id="player-state">Ready</span></div>
          <div class="level-stack"><span>BASE <b id="base-level">${character.baseLevel}</b></span><span>JOB <b id="job-level">${character.jobLevel}</b></span></div>
          <div class="resource-bars"><div class="bar-row"><label>HP</label><div class="bar"><i class="bar-hp"></i></div><em>100%</em></div><div class="bar-row"><label>SP</label><div class="bar"><i class="bar-sp"></i></div><em>100%</em></div></div>
          <div class="exp-stack"><span>BASE EXP</span><div class="exp-bar"><i></i></div><span>JOB EXP</span><div class="exp-bar job"><i></i></div></div>
        </div>
        <div class="world-meta"><div class="clock-line"><span class="live-dot"></span><span id="server-clock">--:--</span></div><strong id="map-name">Awaiting world</strong><span id="online-count">0 online</span><span id="coords">0, 0</span></div>
      </div>
      <div class="game-body">
        <div id="game-canvas" class="game-canvas" aria-label="Midgardia game world"></div>
        <aside class="minimap-panel"><div class="panel-caption"><span>WORLD MAP</span><b id="map-short">◎</b></div><canvas id="minimap-canvas" width="176" height="116"></canvas><div class="map-legend"><span><i class="legend-self"></i> You</span><span><i class="legend-player"></i> Players</span><span><i class="legend-npc"></i> NPC</span></div></aside>
        <div class="target-panel"><span class="eyebrow">CURRENT TARGET</span><strong id="target-status">No target</strong><small>ESC clears target · right click selects</small></div>
        <div class="chat-panel"><div class="panel-caption"><span>CHAT LOG</span><b>ENTER TO CHAT</b></div><div class="chat-tabs">${channels.map((channel) => `<button class="chat-tab ${channel === "all" ? "active" : ""}" data-channel="${channel}">${channel}</button>`).join("")}</div><div id="chat-feed" class="chat-feed" role="log" aria-live="polite"></div><form id="chat-form" class="chat-form"><span class="chat-prefix">›</span><input id="chat-input" maxlength="160" autocomplete="off" placeholder="Say something…" aria-label="Chat message" /><button type="submit">SEND</button></form></div>
        <div class="skill-panel"><div class="panel-caption"><span>QUICK SKILLS</span><b>F1 — F9</b></div><div class="skill-row">${slots}</div><small>Skill tree unlocks in Phase 4 · click movement remains primary.</small></div>
        <div class="mobile-controls"><div id="joystick" class="joystick" aria-label="Move joystick"><div id="joystick-knob" class="joystick-knob"></div></div><div class="mobile-actions"><button id="mobile-attack">ATTACK</button><button id="mobile-potion">POTION</button></div></div>
        <button id="logout-button" class="logout-button">LEAVE WORLD</button>
      </div>
      <div id="npc-dialog" class="modal-backdrop"><div class="dialog-window"><div class="dialog-top"><div><span class="eyebrow">NPC CONVERSATION</span><h2 id="dialog-title">—</h2><p id="dialog-role">—</p></div><button id="dialog-close" class="icon-button" aria-label="Close dialog">×</button></div><div id="dialog-copy" class="dialog-copy"></div><div class="dialog-bottom"><span id="dialog-page">1 / 1</span><button id="dialog-next" class="primary-button">NEXT</button></div></div></div>
    `;
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>(".chat-tab").forEach((button) => {
      button.addEventListener("click", () => {
        this.currentChannel = button.dataset.channel as ChannelTab;
        this.root.querySelectorAll(".chat-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
        this.filterChat();
      });
    });
    this.root.querySelector<HTMLFormElement>("#chat-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = this.root.querySelector<HTMLInputElement>("#chat-input");
      const value = input?.value.trim() ?? "";
      if (!value) return;
      this.network.sendChat(this.currentChannel === "all" ? "local" : this.currentChannel, value);
      if (input) input.value = "";
    });
    this.network.onChat((message) => this.addMessage(message.channel, message.senderName, message.message));
    this.root.querySelector<HTMLButtonElement>("#logout-button")?.addEventListener("click", this.onExit);
    this.root.querySelector<HTMLButtonElement>("#dialog-close")?.addEventListener("click", () => this.root.querySelector("#npc-dialog")?.classList.remove("is-open"));
    this.root.querySelector<HTMLButtonElement>("#dialog-next")?.addEventListener("click", () => {
      if (this.dialogIndex < this.dialogPages.length - 1) this.dialogIndex += 1;
      else this.root.querySelector("#npc-dialog")?.classList.remove("is-open");
      this.renderDialogPage();
    });
    this.root.querySelectorAll<HTMLButtonElement>(".skill-slot").forEach((button) => button.addEventListener("click", () => this.addSystemMessage(`${button.dataset.skill} will be assignable after the skill tree phase.`)));
    this.root.querySelector<HTMLButtonElement>("#mobile-attack")?.addEventListener("click", () => this.addSystemMessage("Combat is the next phase; the movement and multiplayer foundation is live."));
    this.root.querySelector<HTMLButtonElement>("#mobile-potion")?.addEventListener("click", () => this.addSystemMessage("No consumables are equipped yet."));
    this.bindJoystick();
  }

  private bindJoystick(): void {
    const joystick = this.root.querySelector<HTMLElement>("#joystick");
    const knob = this.root.querySelector<HTMLElement>("#joystick-knob");
    if (!joystick || !knob) return;
    let active = false;
    const move = (clientX: number, clientY: number) => {
      const rect = joystick.getBoundingClientRect();
      const max = 35;
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const length = Math.hypot(dx, dy) || 1;
      const scale = Math.min(1, max / length);
      const x = dx * scale;
      const y = dy * scale;
      knob.style.transform = `translate(${x}px, ${y}px)`;
      if (Math.hypot(x, y) > 7) this.network.setTarget({ x: this.localPosition.x + (x / max) * 180, y: this.localPosition.y + (y / max) * 180 });
    };
    joystick.addEventListener("pointerdown", (event) => { active = true; joystick.setPointerCapture(event.pointerId); move(event.clientX, event.clientY); });
    joystick.addEventListener("pointermove", (event) => { if (active) move(event.clientX, event.clientY); });
    const release = () => { active = false; knob.style.transform = "translate(0, 0)"; };
    joystick.addEventListener("pointerup", release);
    joystick.addEventListener("pointercancel", release);
  }

  private renderDialogPage(): void {
    this.refs["dialog-copy"].textContent = this.dialogPages[this.dialogIndex] ?? "";
    this.refs["dialog-page"].textContent = `${this.dialogIndex + 1} / ${Math.max(1, this.dialogPages.length)}`;
    this.root.querySelector<HTMLButtonElement>("#dialog-next")!.textContent = this.dialogIndex < this.dialogPages.length - 1 ? "NEXT" : "CLOSE";
  }

  private addMessage(channel: string, sender: string, message: string): void {
    const element = document.createElement("div");
    element.className = `chat-line channel-${channel}`;
    const channelTag = document.createElement("span");
    channelTag.className = "chat-channel";
    channelTag.textContent = channel.toUpperCase();
    const senderText = document.createElement("strong");
    senderText.textContent = sender;
    const copy = document.createElement("span");
    copy.textContent = message;
    element.append(channelTag, senderText, copy);
    this.refs["chat-feed"].append(element);
    this.chatMessages.push({ channel, element });
    while (this.chatMessages.length > 80) this.chatMessages.shift()?.element.remove();
    this.filterChat();
    this.refs["chat-feed"].scrollTop = this.refs["chat-feed"].scrollHeight;
  }

  private filterChat(): void {
    for (const message of this.chatMessages) {
      message.element.hidden = this.currentChannel !== "all" && message.channel !== this.currentChannel;
    }
  }

  private updateClock(): void {
    this.refs["server-clock"].textContent = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  }

  private escape(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
  }
}
