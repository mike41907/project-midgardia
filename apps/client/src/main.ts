import Phaser from "phaser";
import type { CharacterSummary, NetworkPlayerState } from "@midgardia/shared";
import { createCharacter, getCharacters, login, register, type AuthResponse } from "./api";
import { OfflineGameClient, createOfflineCharacter, readOfflineCharacter } from "./offline";
import { NetworkClient, type GameClient } from "./network";
import { GameScene } from "./game/GameScene";
import { GameHud } from "./ui/GameHud";
import "./ui/style.css";

const app = document.querySelector<HTMLElement>("#app")!;
const SESSION_KEY = "midgardia-session";
let activeGame: Phaser.Game | undefined;
let activeNetwork: GameClient | undefined;
let activeHud: GameHud | undefined;

interface Session {
  token: string;
  account: { id: string; username: string };
}

function readSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token === "string" && parsed.account?.username) return parsed as Session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
  return undefined;
}

function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function showAuth(mode: "login" | "register" = "login", message = ""): void {
  app.innerHTML = `
    <main class="screen"><section class="auth-card">
      <div class="brand-lockup"><span class="brand-mark">✦</span><div><strong>PROJECT MIDGARDIA</strong><small>ORIGINAL PRIVATE MMORPG FOUNDATION</small></div></div>
      <div class="auth-copy"><h1>${mode === "login" ? "Enter the frontier." : "Create your account."}</h1><p>Two friends, one small world, and the deliberate pace of a classic PC RPG — with original lore, maps, and visuals.</p></div>
      <form id="auth-form" class="auth-form">
        <div class="field"><label for="username">Account name</label><input id="username" name="username" required minlength="3" maxlength="24" autocomplete="username" placeholder="lowercase adventurer name" /></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" required minlength="8" maxlength="128" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" placeholder="8 characters or more" /></div>
        <div id="auth-error" class="form-error" role="alert">${escapeHtml(message)}</div>
        <button class="auth-submit" type="submit">${mode === "login" ? "LOGIN" : "REGISTER"}</button>
      </form>
      <div class="offline-divider"><span>OR</span></div>
      <button id="offline-play" class="offline-play" type="button">PLAY SINGLE-PLAYER DEMO</button>
      <p class="offline-note">No account or server required · progress stays in this browser</p>
      <div class="switch-mode">${mode === "login" ? "New to the frontier?" : "Already have an account?"} <button id="switch-auth" class="text-button" type="button">${mode === "login" ? "Register" : "Login"}</button></div>
      <div class="legal-note">Private server foundation · server-authoritative movement · no third-party game assets · local SQLite data</div>
    </section></main>
  `;
  app.querySelector<HTMLButtonElement>("#switch-auth")!.addEventListener("click", () => showAuth(mode === "login" ? "register" : "login"));
  app.querySelector<HTMLButtonElement>("#offline-play")!.addEventListener("click", () => showOfflineCharacterSelect());
  app.querySelector<HTMLFormElement>("#auth-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const username = String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");
    const error = app.querySelector<HTMLElement>("#auth-error")!;
    const submit = app.querySelector<HTMLButtonElement>(".auth-submit")!;
    submit.disabled = true;
    error.textContent = "Connecting to the world…";
    try {
      const response = mode === "login" ? await login(username, password) : await register(username, password);
      saveSession(response);
      await showCharacterSelect(response);
    } catch (requestError) {
      error.textContent = requestError instanceof Error ? requestError.message : "Could not connect to the server.";
      submit.disabled = false;
    }
  });
}

async function showCharacterSelect(session: Session, message = ""): Promise<void> {
  app.innerHTML = `
    <main class="screen"><section class="select-card">
      <div class="select-heading"><div><div class="brand-lockup"><span class="brand-mark">✦</span><div><strong>PROJECT MIDGARDIA</strong><small>CHARACTER SELECT</small></div></div><h1>Choose your traveller.</h1><p>Each account can keep up to five persistent characters.</p></div><div class="account-chip">${escapeHtml(session.account.username)}</div></div>
      <div id="select-error" class="form-error" role="alert">${escapeHtml(message)}</div>
      <div id="character-grid" class="character-grid"><div class="legal-note">Loading character registry…</div></div>
      <form id="character-form" class="character-form" hidden>
        <div class="panel-caption"><span>NEW CHARACTER</span><b>SPAWN: SUNPETAL VILLAGE</b></div>
        <div class="form-row"><div class="field"><label for="character-name">Character name</label><input id="character-name" name="name" required minlength="2" maxlength="16" placeholder="e.g. Rowan" /></div><div class="field"><label for="gender">Presentation</label><select id="gender" name="gender"><option value="androgynous">Androgynous</option><option value="feminine">Feminine</option><option value="masculine">Masculine</option></select></div></div>
        <div class="field"><label>Hair color</label><div class="swatches"><button type="button" class="swatch active" data-color="#e8bd77" style="background:#e8bd77" aria-label="Gold hair"></button><button type="button" class="swatch" data-color="#b7d7e9" style="background:#b7d7e9" aria-label="Silver hair"></button><button type="button" class="swatch" data-color="#d889a7" style="background:#d889a7" aria-label="Rose hair"></button><button type="button" class="swatch" data-color="#8ac59c" style="background:#8ac59c" aria-label="Mint hair"></button></div></div>
        <div class="form-row"><button id="cancel-create" type="button" class="logout-button" style="position:static">CANCEL</button><button type="submit" class="primary-button">CREATE & ENTER VILLAGE</button></div>
      </form>
    </section></main>
  `;
  const grid = app.querySelector<HTMLElement>("#character-grid")!;
  const form = app.querySelector<HTMLFormElement>("#character-form")!;
  const error = app.querySelector<HTMLElement>("#select-error")!;
  let characters: CharacterSummary[] = [];
  try {
    characters = await getCharacters(session.token);
    grid.replaceChildren(...characters.map((character) => characterCard(character, () => void startOnlineGame(session, character))));
    const newButton = document.createElement("button");
    newButton.className = "character-card new-character";
    newButton.type = "button";
    newButton.innerHTML = `<span class="char-icon">＋</span><strong>New traveller</strong><small>Begin at Sunpetal Village</small>`;
    newButton.addEventListener("click", () => { form.hidden = false; newButton.hidden = true; form.querySelector<HTMLInputElement>("#character-name")?.focus(); });
    grid.append(newButton);
    form.querySelector<HTMLButtonElement>("#cancel-create")!.addEventListener("click", () => { form.hidden = true; newButton.hidden = false; });
    form.querySelectorAll<HTMLButtonElement>(".swatch").forEach((swatch) => swatch.addEventListener("click", () => {
      form.querySelectorAll(".swatch").forEach((item) => item.classList.toggle("active", item === swatch));
    }));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const selectedColor = form.querySelector<HTMLButtonElement>(".swatch.active")?.dataset.color ?? "#e8bd77";
      try {
        const character = await createCharacter(session.token, {
          name: String(values.get("name") ?? ""),
          gender: String(values.get("gender") ?? "androgynous"),
          hair: 1,
          hairColor: selectedColor,
        });
        await startOnlineGame(session, character);
      } catch (requestError) {
        error.textContent = requestError instanceof Error ? requestError.message : "Could not create that character.";
      }
    });
  } catch (requestError) {
    clearSession();
    showAuth("login", requestError instanceof Error ? requestError.message : "Session expired.");
  }
}

function showOfflineCharacterSelect(message = ""): void {
  const saved = readOfflineCharacter();
  app.innerHTML = `
    <main class="screen"><section class="select-card">
      <div class="select-heading"><div><div class="brand-lockup"><span class="brand-mark">✦</span><div><strong>PROJECT MIDGARDIA</strong><small>SINGLE-PLAYER DEMO</small></div></div><h1>Choose your traveller.</h1><p>Your one-character save is stored locally in this browser. No account or internet connection is needed after the page loads.</p></div><div class="account-chip">LOCAL SAVE</div></div>
      <div id="offline-error" class="form-error" role="alert">${escapeHtml(message)}</div>
      <div id="offline-character-grid" class="character-grid"></div>
      <form id="offline-character-form" class="character-form" hidden>
        <div class="panel-caption"><span>NEW OFFLINE TRAVELLER</span><b>SPAWN: SUNPETAL VILLAGE</b></div>
        <div class="form-row"><div class="field"><label for="offline-character-name">Character name</label><input id="offline-character-name" name="name" required minlength="2" maxlength="16" placeholder="e.g. Rowan" /></div><div class="field"><label for="offline-gender">Presentation</label><select id="offline-gender" name="gender"><option value="androgynous">Androgynous</option><option value="feminine">Feminine</option><option value="masculine">Masculine</option></select></div></div>
        <div class="field"><label>Hair color</label><div class="swatches"><button type="button" class="swatch active" data-color="#e8bd77" style="background:#e8bd77" aria-label="Gold hair"></button><button type="button" class="swatch" data-color="#b7d7e9" style="background:#b7d7e9" aria-label="Silver hair"></button><button type="button" class="swatch" data-color="#d889a7" style="background:#d889a7" aria-label="Rose hair"></button><button type="button" class="swatch" data-color="#8ac59c" style="background:#8ac59c" aria-label="Mint hair"></button></div></div>
        <div class="form-row"><button id="cancel-offline-create" type="button" class="logout-button" style="position:static">CANCEL</button><button type="submit" class="primary-button">CREATE & ENTER VILLAGE</button></div>
      </form>
      <div class="offline-actions"><button id="offline-back" type="button" class="text-button">BACK TO ACCOUNT LOGIN</button><span class="offline-note">Autosaves position, map, and character look</span></div>
    </section></main>
  `;
  const grid = app.querySelector<HTMLElement>("#offline-character-grid")!;
  const form = app.querySelector<HTMLFormElement>("#offline-character-form")!;
  const error = app.querySelector<HTMLElement>("#offline-error")!;
  if (saved) grid.append(characterCard(saved, () => void startOfflineGame(saved)));
  const newButton = document.createElement("button");
  newButton.className = "character-card new-character";
  newButton.type = "button";
  newButton.innerHTML = `<span class="char-icon">＋</span><strong>${saved ? "New traveller" : "Begin your journey"}</strong><small>Start at Sunpetal Village</small>`;
  newButton.addEventListener("click", () => { form.hidden = false; newButton.hidden = true; form.querySelector<HTMLInputElement>("#offline-character-name")?.focus(); });
  grid.append(newButton);
  app.querySelector<HTMLButtonElement>("#offline-back")!.addEventListener("click", () => showAuth("login"));
  app.querySelector<HTMLButtonElement>("#cancel-offline-create")!.addEventListener("click", () => { form.hidden = true; newButton.hidden = false; });
  form.querySelectorAll<HTMLButtonElement>(".swatch").forEach((swatch) => swatch.addEventListener("click", () => {
    form.querySelectorAll(".swatch").forEach((item) => item.classList.toggle("active", item === swatch));
  }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    if (name.length < 2) {
      error.textContent = "Choose a name with at least 2 characters.";
      return;
    }
    const selectedColor = form.querySelector<HTMLButtonElement>(".swatch.active")?.dataset.color ?? "#e8bd77";
    const character = createOfflineCharacter({
      name,
      gender: String(values.get("gender") ?? "androgynous"),
      hairColor: selectedColor,
    });
    void startOfflineGame(character);
  });
}

function characterCard(character: CharacterSummary, onSelect: () => void): HTMLButtonElement {
  const card = document.createElement("button");
  card.className = "character-card";
  card.type = "button";
  card.innerHTML = `<span class="char-icon">✧</span><strong>${escapeHtml(character.name)}</strong><small>Base ${character.baseLevel} · Job ${character.jobLevel}</small><small>${escapeHtml(character.mapId.replaceAll("-", " "))}</small>`;
  card.addEventListener("click", onSelect);
  return card;
}

async function startOnlineGame(session: Session, character: CharacterSummary): Promise<void> {
  const network = new NetworkClient(session.token);
  try {
    await network.connect();
  } catch (error) {
    network.disconnect();
    void showCharacterSelect(session, error instanceof Error ? error.message : "Could not connect to the world server.");
    return;
  }
  await launchGame(network, character, "online", () => void showCharacterSelect(session));
}

async function startOfflineGame(character: CharacterSummary): Promise<void> {
  const network = new OfflineGameClient();
  await network.connect();
  await launchGame(network, character, "offline", () => showOfflineCharacterSelect());
}

async function launchGame(network: GameClient, character: CharacterSummary, mode: "online" | "offline", onExit: () => void): Promise<void> {
  activeNetwork = network;
  const initialPlayer: NetworkPlayerState = {
    id: character.id,
    characterId: character.id,
    name: character.name,
    gender: character.gender,
    hair: character.hair,
    hairColor: character.hairColor,
    baseLevel: character.baseLevel,
    jobLevel: character.jobLevel,
    facing: character.facing,
    isMoving: false,
    isSitting: character.isSitting,
    x: character.x,
    y: character.y,
  };
  const hud = new GameHud(app, network, initialPlayer, () => leaveWorld(onExit), mode);
  activeHud = hud;
  activeGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: hud.getElement().querySelector<HTMLElement>("#game-canvas")!,
    width: window.innerWidth,
    height: Math.max(320, window.innerHeight - 72),
    backgroundColor: "#15253c",
    render: { pixelArt: true, antialias: false, roundPixels: true },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
  });
  activeGame.scene.add("world", GameScene, true, { network, character, hud });
}

function leaveWorld(onExit: () => void): void {
  activeGame?.destroy(true);
  activeGame = undefined;
  activeNetwork?.disconnect();
  activeNetwork = undefined;
  activeHud?.close();
  activeHud = undefined;
  onExit();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

const existingSession = readSession();
if (existingSession) void showCharacterSelect(existingSession);
else showAuth();
