import { io, type Socket } from "socket.io-client";
import type {
  ChatMessage,
  NpcDialog,
  Point2,
  WorldState,
} from "@midgardia/shared";
import type { CharacterSummary } from "@midgardia/shared";

export class NetworkClient {
  private readonly socket: Socket;
  private latestState?: WorldState;
  private readonly stateListeners = new Set<(state: WorldState) => void>();
  private readonly chatListeners = new Set<(message: ChatMessage) => void>();
  private readonly dialogListeners = new Set<(dialog: NpcDialog) => void>();
  private readonly systemListeners = new Set<(message: string) => void>();

  constructor(token: string) {
    this.socket = io({
      auth: { token },
      transports: ["websocket", "polling"],
      autoConnect: false,
    });
    this.socket.on("world:state", (state: WorldState) => {
      this.latestState = state;
      for (const listener of this.stateListeners) listener(state);
    });
    this.socket.on("chat:message", (message: ChatMessage) => {
      for (const listener of this.chatListeners) listener(message);
    });
    this.socket.on("npc:dialog", (dialog: NpcDialog) => {
      for (const listener of this.dialogListeners) listener(dialog);
    });
    this.socket.on("session:error", (payload: { message?: string }) => {
      for (const listener of this.systemListeners) listener(payload.message ?? "Your session is no longer valid.");
    });
    this.socket.on("connect_error", (error) => {
      for (const listener of this.systemListeners) listener(`Network connection failed: ${error.message}`);
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off("connect", onConnect);
        this.socket.off("connect_error", onError);
      };
      this.socket.once("connect", onConnect);
      this.socket.once("connect_error", onError);
      this.socket.connect();
    });
  }

  join(character: CharacterSummary): void {
    this.socket.emit("player:join", { characterId: character.id });
  }

  setTarget(point: Point2): void {
    this.socket.emit("player:setTarget", point);
  }

  toggleSit(): void {
    this.socket.emit("player:toggleSit");
  }

  interactNpc(npcId: string): void {
    this.socket.emit("npc:interact", { npcId });
  }

  sendChat(channel: string, message: string): void {
    this.socket.emit("chat:send", { channel, message });
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
    this.socket.disconnect();
  }
}
