# Project Neon — PoC Architecture Overview

## Goal

A browser-based multiplayer game where players join a shared world, see each other move around (click-to-move with pathfinding), and chat. Inspired by RuneScape (isometric MMO feel, click-to-move) and League of Legends (smooth movement, top-down camera).

---

## 1. Project Structure — Monorepo

```
project_neon/
├── client/          # Browser app (renders the game)
├── server/          # Authoritative game server
└── shared/          # Types, constants, pathfinding grid shared by both
```

A monorepo with shared code keeps client/server in sync (shared types for network messages, map data, etc.).

---

## 2. Client (Browser)

| Concern | Technology | Why |
|---|---|---|
| **Rendering** | **PixiJS** (2D WebGL/WebGPU) | Lightweight (~150KB), best-in-class 2D sprite batching. Full control over game loop — ideal for server-authoritative architecture. Viewport culling for large maps (1000x1000+) is ~50-100 lines of custom code. Chosen over Phaser (fights server-authoritative patterns), Three.js/Babylon.js (3D overkill), Excalibur (less proven at scale), and raw Canvas 2D (CPU-bound, no GPU batching). |
| **Networking** | **WebSocket** (native browser API) | Low-latency bidirectional comms. No need for WebRTC for this PoC. |
| **Pathfinding** | Shared A* implementation | Click a tile → compute path → send movement intent to server. |
| **UI (chat, HUD)** | **HTML/CSS overlay** on top of the canvas | Simpler and more accessible than rendering UI inside the canvas. A small Preact or vanilla DOM layer. |

**Client game loop:**

1. Receive authoritative state from server (player positions, new chat messages)
2. Interpolate/lerp other players' positions for smooth rendering
3. On click → run A* pathfinding on the local map → send `MOVE_TO` intent to server
4. Render the tile map, player sprites, name labels, chat bubbles

---

## 3. Server (Authoritative)

| Concern | Technology | Why |
|---|---|---|
| **Runtime** | **Node.js + TypeScript** | Shares code/types with client. Fast enough for this scale. |
| **Networking** | **ws** (WebSocket library) | Lightweight, no framework overhead. |
| **Game loop** | Fixed-tick server loop (e.g. 20 ticks/sec) | Server validates movement, broadcasts state. |

**Server responsibilities:**

- Maintain the canonical game state (all player positions, chat history)
- Validate movement requests (is the path walkable? is the speed legal?)
- Broadcast position updates and chat to all connected players
- Handle connect/disconnect (spawn/despawn players)

**Why server-authoritative:** Prevents cheating (teleporting, speed hacks). The server owns the truth; clients are just renderers + input collectors.

---

## 4. Shared Module

- **Message protocol types** — strongly typed message schemas (`PlayerMove`, `ChatMessage`, `PlayerJoin`, `PlayerLeave`, `WorldState`, etc.)
- **Map data** — the tile grid (walkable vs blocked), shared so both client and server can run pathfinding
- **Pathfinding (A\*)** — same algorithm on both sides. Client uses it for immediate visual feedback; server uses it for validation
- **Constants** — tick rate, movement speed, map dimensions

---

## 5. Networking Protocol

Simple JSON-over-WebSocket for the PoC (binary like MessagePack can come later for performance):

```
Client → Server:
  MOVE_TO { x, y }           // Player clicked a destination
  CHAT    { message }        // Player sent a chat message
  JOIN    { displayName }    // Player connects

Server → Client:
  WORLD_STATE { players[] }  // Periodic snapshot (positions, directions)
  PLAYER_JOIN { player }     // Someone joined
  PLAYER_LEAVE { playerId }  // Someone left
  CHAT { playerId, message } // Chat relay
```

**Optimization:** Instead of full snapshots, send **delta updates** — only the players whose state changed since last tick.

---

## 6. Game Map (PoC)

- A simple 2D tile grid (e.g. 50×50 tiles)
- Each tile is either walkable (grass, dirt) or blocked (wall, water)
- Rendered as colored/textured tiles in PixiJS
- Defined as a shared JSON or 2D array

---

## 7. Movement System

1. Player clicks a tile on the canvas
2. **Client** runs A* from current position to target → shows path preview immediately
3. Client sends `MOVE_TO { x, y }` to server
4. **Server** validates the path (runs its own A*), then moves the player along it at a fixed speed each tick
5. Server broadcasts updated position to all clients
6. **Other clients** interpolate/lerp the moving player's position between server ticks for smooth visuals

---

## 8. Chat System

- Standard MMO chat box at the bottom of the screen (HTML overlay)
- Press Enter to focus, type message, Enter to send
- Server relays to all players
- Messages appear in the chat log with the player's name
- Optional: chat bubbles above player sprites that fade after a few seconds

---

## 9. Key Technical Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| 2D vs 3D | **2D top-down** | Dramatically simpler for PoC, fits the RuneScape/LoL aesthetic |
| Rendering | **PixiJS** | Best-in-class 2D WebGL/WebGPU, lightweight, full control over game loop |
| Server runtime | **Node.js** | Code sharing with client, fast iteration |
| Transport | **WebSocket** | Simple, bidirectional, low latency |
| Authority | **Server-authoritative** | Prevents cheating, clean architecture |
| Pathfinding | **A* (shared)** | Industry standard for grid-based movement |
| Serialization | **JSON** (PoC) → **MessagePack** (later) | Start simple, optimize when needed |

---

## 10. PoC Milestones (Build Order)

1. **Shared** — Define message types, map grid, A* pathfinding
2. **Server** — WebSocket server, game loop, player state management, chat relay
3. **Client** — PixiJS tile map rendering, WebSocket connection, click-to-move with pathfinding
4. **Integration** — Players see each other, movement syncs, chat works
5. **Polish** — Interpolation, chat bubbles, name labels, basic spawn screen
