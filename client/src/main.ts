import {
  TileType,
  findPath,
  isWalkable,
  MOVEMENT_SPEED,
  type ServerPlayerState,
  type Position,
} from 'shared';
import { Network } from './network';
import { Renderer } from './renderer';
import { Chat } from './chat';
import { DebugOverlay } from './debug';

// ---- State ----
let myPlayerId: string | null = null;
let map: TileType[][] = [];
const playerStates: Map<string, ServerPlayerState> = new Map();

// ---- Local player prediction ----
// The client walks the local player along the path independently at the same
// speed the server uses. Server updates are used only for reconciliation.
let localPos: Position = { x: 0, y: 0 };
let localPath: Position[] = [];
let localPathIndex = 0;
let localInitialized = false;
const RECONCILE_THRESHOLD = 0.5; // tiles — snap-correct above this
const RECONCILE_LERP = 0.15;     // smooth correction speed per frame

// ---- Remote player interpolation (buffered) ----
// We store timestamped snapshots and render remote players at a fixed delay
// so we always have two snapshots to interpolate between.
const INTERP_DELAY_MS = 100; // render 100ms in the past
interface Snapshot {
  time: number;
  x: number;
  y: number;
}
const snapshotBuffers: Map<string, Snapshot[]> = new Map();
const MAX_SNAPSHOTS = 30;

// Camera lerp
const CAMERA_LERP_SPEED = 0.1;
const cameraPos: Position = { x: 0, y: 0 };

// Timing
let lastFrameTime = performance.now();

// ---- Init ----
const network = new Network();
const renderer = new Renderer();
const chat = new Chat(network);
const debug = new DebugOverlay(network);

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
        debug.setMapTiles(msg.width * msg.height);
        break;

      case 'WORLD_STATE': {
        const now = performance.now();
        for (const p of msg.players) {
          playerStates.set(p.id, p);
          renderer.setPlayerName(p.id, p.displayName);

          if (p.id === myPlayerId) {
            // ---- Local player reconciliation ----
            if (!localInitialized) {
              localPos.x = p.x;
              localPos.y = p.y;
              cameraPos.x = p.x;
              cameraPos.y = p.y;
              localInitialized = true;
            }
            // Server correction is applied in the game loop via reconciliation
          } else {
            // ---- Remote player: push snapshot into buffer ----
            let buf = snapshotBuffers.get(p.id);
            if (!buf) {
              buf = [];
              snapshotBuffers.set(p.id, buf);
            }
            buf.push({ time: now, x: p.x, y: p.y });
            if (buf.length > MAX_SNAPSHOTS) buf.shift();
          }
        }

        // Remove players that are no longer in the state
        const activeIds = new Set(msg.players.map((p) => p.id));
        for (const id of playerStates.keys()) {
          if (!activeIds.has(id)) {
            playerStates.delete(id);
            snapshotBuffers.delete(id);
            renderer.removePlayerName(id);
          }
        }
        break;
      }

      case 'PLAYER_JOIN':
        playerStates.set(msg.player.id, msg.player);
        snapshotBuffers.set(msg.player.id, [{
          time: performance.now(),
          x: msg.player.x,
          y: msg.player.y,
        }]);
        renderer.setPlayerName(msg.player.id, msg.player.displayName);
        chat.addSystemMessage(`${msg.player.displayName} joined the game`);
        break;

      case 'PLAYER_LEAVE': {
        const leaving = playerStates.get(msg.playerId);
        playerStates.delete(msg.playerId);
        snapshotBuffers.delete(msg.playerId);
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

    const from = {
      x: Math.round(localPos.x),
      y: Math.round(localPos.y),
    };

    const path = findPath(map, from, target);
    if (path && path.length > 0) {
      localPath = path.length > 1 ? path.slice(1) : path;
      localPathIndex = 0;
      renderer.setPathPreview(localPath);
      network.send({ type: 'MOVE_TO', x: target.x, y: target.y });
    }
  });

  // ---- Game loop ----
  const gameLoop = () => {
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000; // delta in seconds
    lastFrameTime = now;

    const renderPlayers: Array<{ id: string; x: number; y: number; isLocal: boolean }> = [];

    // ---- Local player: client-side prediction ----
    if (myPlayerId && localInitialized) {
      // Walk along the path at MOVEMENT_SPEED tiles/sec
      let remaining = MOVEMENT_SPEED * dt;
      while (remaining > 0 && localPathIndex < localPath.length) {
        const target = localPath[localPathIndex];
        const dx = target.x - localPos.x;
        const dy = target.y - localPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= remaining) {
          localPos.x = target.x;
          localPos.y = target.y;
          remaining -= dist;
          localPathIndex++;
        } else {
          localPos.x += (dx / dist) * remaining;
          localPos.y += (dy / dist) * remaining;
          remaining = 0;
        }
      }

      // Reconcile with server position
      const serverState = playerStates.get(myPlayerId);
      if (serverState) {
        const errX = serverState.x - localPos.x;
        const errY = serverState.y - localPos.y;
        const errDist = Math.sqrt(errX * errX + errY * errY);

        if (errDist > RECONCILE_THRESHOLD) {
          // Large desync — snap to server
          localPos.x = serverState.x;
          localPos.y = serverState.y;
          localPath = [];
          localPathIndex = 0;
        } else if (errDist > 0.01) {
          // Small drift — gently nudge toward server
          localPos.x += errX * RECONCILE_LERP;
          localPos.y += errY * RECONCILE_LERP;
        }
      }

      // Clear path preview when we arrive
      if (localPathIndex >= localPath.length && localPath.length > 0) {
        localPath = [];
        localPathIndex = 0;
        renderer.setPathPreview([]);
      }

      renderPlayers.push({
        id: myPlayerId,
        x: localPos.x,
        y: localPos.y,
        isLocal: true,
      });
    }

    // ---- Remote players: buffered interpolation ----
    const renderTime = now - INTERP_DELAY_MS;

    for (const [id, state] of playerStates) {
      if (id === myPlayerId) continue;

      const buf = snapshotBuffers.get(id);
      if (!buf || buf.length === 0) {
        renderPlayers.push({ id, x: state.x, y: state.y, isLocal: false });
        continue;
      }

      // Find the two snapshots that straddle renderTime
      let x: number;
      let y: number;

      if (buf.length === 1 || renderTime <= buf[0].time) {
        // Only one snapshot or render time is before all snapshots
        x = buf[0].x;
        y = buf[0].y;
      } else if (renderTime >= buf[buf.length - 1].time) {
        // Past the latest snapshot — use latest position
        x = buf[buf.length - 1].x;
        y = buf[buf.length - 1].y;
      } else {
        // Interpolate between two surrounding snapshots
        let i = 0;
        while (i < buf.length - 1 && buf[i + 1].time < renderTime) i++;
        const a = buf[i];
        const b = buf[i + 1];
        const t = (renderTime - a.time) / (b.time - a.time);
        x = a.x + (b.x - a.x) * t;
        y = a.y + (b.y - a.y) * t;
      }

      renderPlayers.push({ id, x, y, isLocal: false });
    }

    // Camera lerps toward local player
    const localPlayer = renderPlayers.find((p) => p.isLocal);
    if (localPlayer) {
      cameraPos.x += (localPlayer.x - cameraPos.x) * CAMERA_LERP_SPEED;
      cameraPos.y += (localPlayer.y - cameraPos.y) * CAMERA_LERP_SPEED;
      renderer.setCamera(cameraPos);
    }

    renderer.setPlayers(renderPlayers);
    renderer.render();

    debug.setPlayerCount(renderPlayers.length);
    debug.update();

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
