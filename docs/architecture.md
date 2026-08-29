# Architecture

## Runtime boundary

```text
Browser (Phaser + DOM HUD)
        │ HTTP: auth / characters / health
        │ WebSocket: intents and authoritative snapshots
        ▼
Node.js (Express + Socket.IO)
        │ Prisma
        ▼
SQLite (private server data)
```

The browser sends intentions (`player:setTarget`, `player:toggleSit`, `npc:interact`, and `chat:send`). The server validates ownership, proximity, collision, movement speed, and message size before broadcasting state. Visual interpolation and feedback are client-only and never alter persisted state.

## Phase 1 world loop

1. Login returns a signed token; character endpoints require that token.
2. The selected character joins a Socket.IO room for its current map.
3. A server tick moves each player toward a validated target at the configured speed.
4. The tick broadcasts the room snapshot and periodically persists character coordinates.
5. Portal proximity changes the authoritative map and room.
6. Disconnect saves the latest state.

## Extending safely

Keep all damage, rewards, item movement, inventory mutations, trade confirmation, and GM actions on the server. Add a typed intent and a server-side invariant before adding a client control. Add a deterministic unit test for every new formula and a browser smoke test for every player-facing flow.
