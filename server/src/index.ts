import { WebSocketServer, WebSocket } from 'ws';
import {
  generateMap,
  findPath,
  isWalkable,
  TICK_RATE,
  TICK_INTERVAL_MS,
  MOVEMENT_SPEED,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  CHAT_HISTORY_SIZE,
  type TileType,
  type Position,
  type ClientMessage,
  type ServerMessage,
  type ServerPlayerState,
} from 'shared';

// ---- State ----

interface ServerPlayer {
  id: string;
  displayName: string;
  position: Position;
  path: Position[];
  pathIndex: number;
  ws: WebSocket;
}

const PORT = Number(process.env.PORT) || 3001;
const map: TileType[][] = generateMap();
const players = new Map<string, ServerPlayer>();
const chatHistory: ServerMessage[] = [];
let nextPlayerId = 1;

// ---- WebSocket server ----

const wss = new WebSocketServer({ port: PORT });
console.log(`Game server listening on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  let player: ServerPlayer | null = null;

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'JOIN') {
      if (player) return; // already joined

      const displayName = msg.displayName
        .trim()
        .slice(0, MAX_DISPLAY_NAME_LENGTH) || 'Anon';

      const id = String(nextPlayerId++);
      player = {
        id,
        displayName,
        position: findSpawnPoint(),
        path: [],
        pathIndex: 0,
        ws,
      };
      players.set(id, player);

      // Tell this player their ID
      send(ws, { type: 'JOINED', playerId: id });

      // Send the map
      send(ws, {
        type: 'MAP',
        width: map[0].length,
        height: map.length,
        tiles: map.map((row) => row.map((t) => t as number)),
      });

      // Send current world state
      send(ws, {
        type: 'WORLD_STATE',
        players: getPlayerStates(),
      });

      // Send chat history
      for (const chatMsg of chatHistory) {
        send(ws, chatMsg);
      }

      // Announce to others
      broadcast({
        type: 'PLAYER_JOIN',
        player: playerToState(player),
      }, id);

      console.log(`${displayName} (${id}) joined`);
      return;
    }

    if (!player) return; // not joined yet

    if (msg.type === 'MOVE_TO') {
      const targetX = Math.round(msg.x);
      const targetY = Math.round(msg.y);
      const target = { x: targetX, y: targetY };

      if (!isWalkable(map, target)) return;

      // Compute path from player's current tile position
      const from = {
        x: Math.round(player.position.x),
        y: Math.round(player.position.y),
      };

      const path = findPath(map, from, target);
      if (!path || path.length === 0) return;

      // Skip the start tile — the player is already on/near it.
      // Without this, rapid clicks cause backtracking to the rounded tile.
      player.path = path.length > 1 ? path.slice(1) : path;
      player.pathIndex = 0;
      return;
    }

    if (msg.type === 'CHAT') {
      const message = msg.message.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
      if (!message) return;

      const chatMsg: ServerMessage = {
        type: 'CHAT',
        playerId: player.id,
        displayName: player.displayName,
        message,
        timestamp: Date.now(),
      };

      chatHistory.push(chatMsg);
      if (chatHistory.length > CHAT_HISTORY_SIZE) {
        chatHistory.shift();
      }

      broadcast(chatMsg);
      return;
    }

    if (msg.type === 'PING') {
      send(ws, { type: 'PONG', timestamp: msg.timestamp });
      return;
    }
  });

  ws.on('close', () => {
    if (player) {
      players.delete(player.id);
      broadcast({ type: 'PLAYER_LEAVE', playerId: player.id });
      console.log(`${player.displayName} (${player.id}) left`);
    }
  });
});

// ---- Game loop ----

function tick() {
  const tilesPerTick = MOVEMENT_SPEED / TICK_RATE;

  for (const player of players.values()) {
    let remaining = tilesPerTick;

    while (remaining > 0 && player.pathIndex < player.path.length) {
      const target = player.path[player.pathIndex];
      const dx = target.x - player.position.x;
      const dy = target.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= remaining) {
        // Reached this waypoint — snap and carry leftover into next waypoint
        player.position.x = target.x;
        player.position.y = target.y;
        remaining -= dist;
        player.pathIndex++;
      } else {
        // Move toward waypoint, consuming all remaining budget
        player.position.x += (dx / dist) * remaining;
        player.position.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }
  }

  // Broadcast world state to all
  const stateMsg: ServerMessage = {
    type: 'WORLD_STATE',
    players: getPlayerStates(),
  };
  broadcast(stateMsg);
}

setInterval(tick, TICK_INTERVAL_MS);

// ---- Helpers ----

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: ServerMessage, excludeId?: string) {
  const data = JSON.stringify(msg);
  for (const player of players.values()) {
    if (player.id === excludeId) continue;
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function playerToState(p: ServerPlayer): ServerPlayerState {
  const target = p.pathIndex < p.path.length
    ? p.path[p.path.length - 1]
    : null;
  return {
    id: p.id,
    displayName: p.displayName,
    x: p.position.x,
    y: p.position.y,
    targetX: target?.x ?? null,
    targetY: target?.y ?? null,
  };
}

function getPlayerStates(): ServerPlayerState[] {
  return Array.from(players.values()).map(playerToState);
}

function findSpawnPoint(): Position {
  // Spawn near center, on a walkable tile
  const cx = Math.floor(map[0].length / 2);
  const cy = Math.floor(map.length / 2);

  for (let r = 0; r < 10; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const pos = { x: cx + dx, y: cy + dy };
        if (isWalkable(map, pos)) return pos;
      }
    }
  }

  return { x: cx, y: cy };
}
