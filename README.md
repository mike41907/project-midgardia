# Project Midgardia

Project Midgardia is an original private multiplayer RPG foundation for 2–10 friends. It is designed around the interaction rhythm of early PC 2D MMORPGs while using original names, data, visuals, and audio placeholders. It does not include or depend on Ragnarok Online assets, text, maps, music, sprites, or trademarks.

## Phase 1 status

The first playable milestone is implemented as a real client/server flow:

- account registration and login with hashed passwords and signed session tokens;
- up to five persistent characters per account;
- SQLite + Prisma persistence for character position, map, level, and presentation data;
- Phaser 3 client with original pixel-art map backgrounds, an adventurer sprite, fallback procedural rendering, and two rendered maps;
- server-authoritative click-to-move with collision checks and movement speed limits;
- eight facing directions, smooth movement interpolation, destination feedback, and camera follow;
- simultaneous players visible through Socket.IO world snapshots;
- NPC interaction with server-validated proximity and dialog data;
- portal transfer between Sunpetal Village and Emberfall Town;
- local/system/party/guild/whisper chat channels, including `/w`, `/party`, and `/guild` commands;
- classic-style HUD, minimap, keyboard shortcuts, mobile joystick, and responsive layout;
- original Tiled-compatible map source files, Docker Compose, CI, and a CHANGELOG.

Combat, skills, items, cards, refining, quests, parties, guild persistence, trading, and GM/admin tools are intentionally queued for the next phases; the repository already contains the extensible schema areas for them.

## Single-player web demo

The first playable offline slice is deployed at [mike41907.github.io/project-midgardia](https://mike41907.github.io/project-midgardia/). Choose **PLAY SINGLE-PLAYER DEMO** on the landing screen. The browser stores one traveller's character, position, map, and appearance in local storage, so the demo needs no account or backend. The online multiplayer flow remains available when the full server is started locally or on a Node-compatible host.

## Start locally

Requirements: Node.js 20+, pnpm 9+, and a browser with WebGL or Canvas support.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The server listens on `http://localhost:3000` and the Vite proxy keeps the browser flow same-origin during development. Register an account, create a character, and open a second browser window to see multiplayer movement and chat.

Useful commands:

```powershell
pnpm test
pnpm build
pnpm db:push
pnpm db:seed
docker compose up --build
```

For a LAN setup, set `CLIENT_ORIGIN` to the browser origin (or a comma-separated allow-list used by the server), bind the server to `0.0.0.0`, and share the host's port 3000. Do not expose this private server to the public internet without adding production secret management, TLS, rate limiting, backups, and an operational account policy.

## Repository layout

```text
apps/
  client/       Phaser 3 + Vite browser client
  server/       Express + Socket.IO + Prisma server
  admin/        Admin surface reserved for Phase 9
packages/
  shared/       transport types and deterministic formulas
  game-data/    original maps, NPCs, portals, and content definitions
assets/
  maps/         Tiled-compatible original map source
  sprites/      source notes for generated/procedural art
docs/            architecture and phase notes
```

## Original-content boundary

All project names, NPCs, map names, data, UI graphics, and placeholder audio are original. The current visual pass uses original generated pixel-art backgrounds and a player sprite, with provenance recorded in `assets/asset-manifest.json`; the code-drawn renderer remains as a deterministic fallback. No third-party game assets are included.

## Architecture notes

The server owns authentication, character persistence, movement validation, collision, portals, NPC proximity, and chat routing. The client only renders state and submits intents. The Prisma schema includes the Phase 1 models plus forward-compatible inventory, equipment, monster, skill, quest, guild, party, card, and drop-table models so later phases can extend the same repository without replacing the foundation.
