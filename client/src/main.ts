import {
  TileType,
  findPath,
  isWalkable,
  type ServerPlayerState,
  type Position,
} from 'shared';
import { Network } from './network';
import { Renderer } from './renderer';
import { Chat } from './chat';

// ---- State ----
let myPlayerId: string | null = null;
let map: TileType[][] = [];
const playerStates: Map<string, ServerPlayerState> = new Map();

// Interpolation: we store previous + current states and lerp between them
const prevPositions: Map<string, Position> = new Map();
const targetPositions: Map<string, Position> = new Map();
let lastUpdateTime = 0;
const SERVER_TICK_MS = 50; // 20 ticks/sec

// Local movement (path preview)
let localPath: Position[] = [];

// ---- Init ----
const network = new Network();
const renderer = new Renderer();
const chat = new Chat(network);

async function start(displayName: string) {
  await renderer.init();

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsHost = window.location.hostname || 'localhost';
  await network.connect(`${wsProtocol}://${wsHost}:3001`);

  network.send({ type: 'JOIN', displayName });

  network.onMessage((msg) => {
    switch (msg.type) {
      case 'JOINED':
        myPlayerId = msg.playerId;
        break;

      case 'MAP':
        map = msg.tiles as TileType[][];
        renderer.setMap(map);
        break;

      case 'WORLD_STATE':
        for (const p of msg.players) {
          // Store previous position for interpolation
          const current = targetPositions.get(p.id);
          if (current) {
            prevPositions.set(p.id, { x: current.x, y: current.y });
          } else {
            prevPositions.set(p.id, { x: p.x, y: p.y });
          }
          targetPositions.set(p.id, { x: p.x, y: p.y });
          playerStates.set(p.id, p);
          renderer.setPlayerName(p.id, p.displayName);
        }

        // Remove players that are no longer in the state
        const activeIds = new Set(msg.players.map((p) => p.id));
        for (const id of playerStates.keys()) {
          if (!activeIds.has(id)) {
            playerStates.delete(id);
            prevPositions.delete(id);
            targetPositions.delete(id);
            renderer.removePlayerName(id);
          }
        }

        lastUpdateTime = performance.now();
        break;

      case 'PLAYER_JOIN':
        playerStates.set(msg.player.id, msg.player);
        prevPositions.set(msg.player.id, { x: msg.player.x, y: msg.player.y });
        targetPositions.set(msg.player.id, { x: msg.player.x, y: msg.player.y });
        renderer.setPlayerName(msg.player.id, msg.player.displayName);
        chat.addSystemMessage(`${msg.player.displayName} joined the game`);
        break;

      case 'PLAYER_LEAVE': {
        const leaving = playerStates.get(msg.playerId);
        playerStates.delete(msg.playerId);
        prevPositions.delete(msg.playerId);
        targetPositions.delete(msg.playerId);
        renderer.removePlayerName(msg.playerId);
        if (leaving) {
          chat.addSystemMessage(`${leaving.displayName} left the game`);
        }
        break;
      }

      case 'CHAT':
        chat.addMessage(msg.displayName, msg.message);
        renderer.showChatBubble(msg.playerId, msg.message);
        break;
    }
  });

  // ---- Click to move ----
  renderer.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!myPlayerId || chat.isFocused) return;

    const target = renderer.screenToWorld(e.clientX, e.clientY);
    if (!isWalkable(map, target)) return;

    const myState = playerStates.get(myPlayerId);
    if (!myState) return;

    const from = {
      x: Math.round(myState.x),
      y: Math.round(myState.y),
    };

    const path = findPath(map, from, target);
    if (path && path.length > 0) {
      localPath = path;
      renderer.setPathPreview(localPath);
      network.send({ type: 'MOVE_TO', x: target.x, y: target.y });
    }
  });

  // ---- Game loop ----
  const gameLoop = () => {
    // Interpolate player positions
    const now = performance.now();
    const elapsed = now - lastUpdateTime;
    const t = Math.min(elapsed / SERVER_TICK_MS, 1);

    const renderPlayers: Array<{ id: string; x: number; y: number; isLocal: boolean }> = [];

    for (const [id, state] of playerStates) {
      const prev = prevPositions.get(id) || { x: state.x, y: state.y };
      const target = targetPositions.get(id) || { x: state.x, y: state.y };

      const x = prev.x + (target.x - prev.x) * t;
      const y = prev.y + (target.y - prev.y) * t;

      renderPlayers.push({
        id,
        x,
        y,
        isLocal: id === myPlayerId,
      });
    }

    // Camera follows local player
    const localPlayer = renderPlayers.find((p) => p.isLocal);
    if (localPlayer) {
      renderer.setCamera({ x: localPlayer.x, y: localPlayer.y });
    }

    // Clear path preview when we arrive
    if (myPlayerId && localPath.length > 0) {
      const myState = playerStates.get(myPlayerId);
      if (myState) {
        const dest = localPath[localPath.length - 1];
        const dx = myState.x - dest.x;
        const dy = myState.y - dest.y;
        if (dx * dx + dy * dy < 0.1) {
          localPath = [];
          renderer.setPathPreview([]);
        }
      }
    }

    renderer.setPlayers(renderPlayers);
    renderer.render();
    requestAnimationFrame(gameLoop);
  };

  requestAnimationFrame(gameLoop);
}

// ---- Join screen ----
const joinScreen = document.getElementById('join-screen')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn')!;

function handleJoin() {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  joinScreen.style.display = 'none';
  start(name);
}

joinBtn.addEventListener('click', handleJoin);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleJoin();
});
